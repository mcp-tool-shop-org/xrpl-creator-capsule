/**
 * grant-access — evaluate an access request and emit a receipt.
 *
 * Orchestrates: policy coherence → holder check → delivery token → receipt.
 */

import { readFile } from "node:fs/promises";
import {
  assertManifest,
  assertReceipt,
  assertAccessPolicy,
  checkPolicyCoherence,
  computeManifestId,
  computeRevisionHash,
  computeReceiptHash,
  stampGrantHash,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
  type AccessGrantReceipt,
} from "@capsule/core";
import { checkHolder } from "@capsule/xrpl";
import type { DeliveryProvider } from "@capsule/storage";

export interface GrantAccessOptions {
  manifestPath: string;
  receiptPath: string;
  policyPath: string;
  walletAddress: string;
  deliveryProvider: DeliveryProvider;
}

export async function grantAccess(
  options: GrantAccessOptions
): Promise<AccessGrantReceipt> {
  const { manifestPath, receiptPath, policyPath, walletAddress, deliveryProvider } = options;

  // ── Load and validate all artifacts ─────────────────────────────

  const manifest = assertManifest(
    JSON.parse(await readFile(manifestPath, "utf-8"))
  );
  const receipt = assertReceipt(
    JSON.parse(await readFile(receiptPath, "utf-8"))
  );
  const policy = assertAccessPolicy(
    JSON.parse(await readFile(policyPath, "utf-8"))
  );

  const now = new Date().toISOString();

  // ── Policy coherence ────────────────────────────────────────────

  const coherence = checkPolicyCoherence(policy, manifest, receipt);
  if (!coherence.coherent) {
    return stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: `Policy coherence failed: ${coherence.errors.join("; ")}`,
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
  }

  // ── Issuance receipt integrity ──────────────────────────────────

  if (receipt.receiptHash) {
    const expectedHash = computeReceiptHash(receipt);
    if (receipt.receiptHash !== expectedHash) {
      return stampGrantHash({
        schemaVersion: "1.0.0",
        kind: "access-grant-receipt",
        manifestId: policy.manifestId,
        policyLabel: policy.label,
        subjectAddress: walletAddress,
        network: receipt.network,
        decision: "deny",
        reason: "Issuance receipt has been tampered with",
        benefit: policy.benefit,
        ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
        decidedAt: now,
      });
    }
  }

  // ── Manifest identity check ─────────────────────────────────────

  const expectedManifestId = computeManifestId(manifest);
  if (receipt.manifestId !== expectedManifestId) {
    return stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: "Manifest identity does not match issuance receipt",
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
  }

  // ── Revision hash check ─────────────────────────────────────────

  const expectedRevision = computeRevisionHash(manifest);
  if (receipt.manifestRevisionHash !== expectedRevision) {
    return stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: "Manifest has been modified since issuance",
      benefit: policy.benefit,
      ownership: { matchedTokenIds: [], totalNftsChecked: 0 },
      decidedAt: now,
    });
  }

  // ── Ownership check ─────────────────────────────────────────────

  const holderResult = await checkHolder(
    walletAddress,
    policy.rule.qualifyingTokenIds,
    receipt.network
  );

  if (holderResult.error) {
    return stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: `Ownership check failed: ${holderResult.error}`,
      benefit: policy.benefit,
      ownership: {
        matchedTokenIds: holderResult.matchedTokenIds,
        totalNftsChecked: holderResult.totalNftsChecked,
      },
      decidedAt: now,
    });
  }

  if (!holderResult.holds) {
    return stampGrantHash({
      schemaVersion: "1.0.0",
      kind: "access-grant-receipt",
      manifestId: policy.manifestId,
      policyLabel: policy.label,
      subjectAddress: walletAddress,
      network: receipt.network,
      decision: "deny",
      reason: "Wallet does not hold any qualifying NFT for this release",
      benefit: policy.benefit,
      ownership: {
        matchedTokenIds: [],
        totalNftsChecked: holderResult.totalNftsChecked,
      },
      decidedAt: now,
    });
  }

  // ── Delivery ────────────────────────────────────────────────────

  const deliveryToken = await deliveryProvider.createToken(
    policy.benefit.contentPointer,
    policy.delivery.ttlSeconds
  );

  return stampGrantHash({
    schemaVersion: "1.0.0",
    kind: "access-grant-receipt",
    manifestId: policy.manifestId,
    policyLabel: policy.label,
    subjectAddress: walletAddress,
    network: receipt.network,
    decision: "allow",
    reason: `Wallet holds ${holderResult.matchedTokenIds.length} qualifying NFT(s)`,
    benefit: policy.benefit,
    ownership: {
      matchedTokenIds: holderResult.matchedTokenIds,
      totalNftsChecked: holderResult.totalNftsChecked,
    },
    delivery: {
      mode: policy.delivery.mode,
      token: deliveryToken.token,
      expiresAt: deliveryToken.expiresAt,
    },
    decidedAt: now,
  });
}
