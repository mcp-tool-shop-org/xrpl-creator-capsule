import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { recoveryBundleSchema } from "./recovery-bundle-schema.js";
import type { RecoveryBundle } from "./recovery-bundle.js";
import type { ReleaseManifest } from "./manifest.js";
import type { IssuanceReceipt } from "./receipt.js";
import type { AccessPolicy } from "./access-policy.js";
import type { ValidationResult } from "./validate.js";
import { computeManifestId, computeRevisionHash, sortKeysDeep } from "./hash.js";
import { computeReceiptHash } from "./receipt-validate.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const compiledValidator = ajv.compile<RecoveryBundle>(recoveryBundleSchema);

/** Validate a RecoveryBundle against its schema. */
export function validateRecoveryBundle(bundle: unknown): ValidationResult {
  const valid = compiledValidator(bundle);
  if (valid) return { valid: true, errors: [] };
  const errors = (compiledValidator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

/** Validate and return typed bundle or throw. */
export function assertRecoveryBundle(bundle: unknown): RecoveryBundle {
  const result = validateRecoveryBundle(bundle);
  if (!result.valid) {
    throw new Error(
      `Invalid RecoveryBundle:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  return bundle as RecoveryBundle;
}

/** Compute tamper-evident fingerprint of a recovery bundle. */
export function computeBundleHash(bundle: RecoveryBundle): string {
  const { bundleHash: _bh, ...rest } = bundle;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stamp a bundle with its fingerprint. Returns new object. */
export function stampBundleHash(bundle: RecoveryBundle): RecoveryBundle {
  return { ...bundle, bundleHash: computeBundleHash(bundle) };
}

/**
 * Derive a RecoveryBundle from source artifacts.
 *
 * This is the canonical derivation — the bundle contains no new truth,
 * only pointers extracted from existing canonical objects.
 */
export function deriveRecoveryBundle(
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt,
  policy?: AccessPolicy
): RecoveryBundle {
  const bundle: RecoveryBundle = {
    schemaVersion: "1.0.0",
    kind: "recovery-bundle",

    manifestId: computeManifestId(manifest),
    revisionHash: computeRevisionHash(manifest),
    receiptHash: receipt.receiptHash ?? computeReceiptHash(receipt),

    title: manifest.title,
    artist: manifest.artist,
    editionSize: manifest.editionSize,
    network: receipt.network,
    issuerAddress: manifest.issuerAddress,
    operatorAddress: manifest.operatorAddress,

    tokenIds: receipt.xrpl.nftTokenIds,
    txHashes: receipt.xrpl.mintTxHashes,
    transferFee: receipt.xrpl.transferFee,

    metadataUri: manifest.metadataEndpoint,
    licenseUri: manifest.license.uri,
    coverCid: manifest.coverCid,
    mediaCid: manifest.mediaCid,

    licenseType: manifest.license.type,
    licenseSummary: manifest.license.summary,

    benefit: {
      kind: manifest.benefit.kind,
      description: manifest.benefit.description,
      contentPointer: manifest.benefit.contentPointer,
    },

    generatedAt: new Date().toISOString(),
    recoveryVersion: "1.0.0",

    instructions: [
      `This release "${manifest.title}" by ${manifest.artist} was issued on the XRPL ${receipt.network}.`,
      `Issuer account: ${manifest.issuerAddress}`,
      `Operator account: ${manifest.operatorAddress}`,
      `${receipt.xrpl.nftTokenIds.length} edition(s) were minted as NFTs.`,
      `To verify ownership: query the XRPL ledger for the token ID(s) listed in this bundle.`,
      `To check holder eligibility: the wallet must hold at least one of the qualifying token IDs.`,
      `Metadata is available at: ${manifest.metadataEndpoint}`,
      `License terms are at: ${manifest.license.uri}`,
      `Cover artwork CID: ${manifest.coverCid}`,
      `Media CID: ${manifest.mediaCid}`,
      `Benefit: ${manifest.benefit.kind} — ${manifest.benefit.description}`,
      `Benefit content pointer: ${manifest.benefit.contentPointer}`,
      `This bundle was generated from canonical artifacts and contains no secrets.`,
    ],
  };

  if (policy) {
    bundle.accessPolicyLabel = policy.label;
    bundle.qualifyingTokenIds = policy.rule.qualifyingTokenIds;
  }

  return stampBundleHash(bundle);
}

/**
 * Verify that a recovery bundle is consistent with its source artifacts.
 */
export interface BundleVerificationResult {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

export function verifyBundleConsistency(
  bundle: RecoveryBundle,
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt,
  policy?: AccessPolicy
): BundleVerificationResult {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // Bundle hash integrity
  if (bundle.bundleHash) {
    const expected = computeBundleHash(bundle);
    checks.push({
      name: "bundle-integrity",
      passed: bundle.bundleHash === expected,
      detail: bundle.bundleHash === expected
        ? "Bundle hash is valid"
        : "Bundle hash mismatch — bundle may have been tampered with",
    });
  }

  // Manifest identity
  const expectedManifestId = computeManifestId(manifest);
  checks.push({
    name: "manifest-id",
    passed: bundle.manifestId === expectedManifestId,
    detail: bundle.manifestId === expectedManifestId
      ? `Manifest ID matches: ${expectedManifestId.slice(0, 16)}...`
      : `Manifest ID mismatch`,
  });

  // Revision hash
  const expectedRevision = computeRevisionHash(manifest);
  checks.push({
    name: "revision-hash",
    passed: bundle.revisionHash === expectedRevision,
    detail: bundle.revisionHash === expectedRevision
      ? "Revision hash matches"
      : "Revision hash mismatch — manifest has been modified",
  });

  // Receipt hash
  const expectedReceiptHash = receipt.receiptHash ?? computeReceiptHash(receipt);
  checks.push({
    name: "receipt-hash",
    passed: bundle.receiptHash === expectedReceiptHash,
    detail: bundle.receiptHash === expectedReceiptHash
      ? "Receipt hash matches"
      : "Receipt hash mismatch",
  });

  // Provenance
  checks.push({
    name: "title",
    passed: bundle.title === manifest.title,
    detail: bundle.title === manifest.title ? `Title: ${bundle.title}` : "Title mismatch",
  });

  checks.push({
    name: "artist",
    passed: bundle.artist === manifest.artist,
    detail: bundle.artist === manifest.artist ? `Artist: ${bundle.artist}` : "Artist mismatch",
  });

  checks.push({
    name: "issuer",
    passed: bundle.issuerAddress === manifest.issuerAddress,
    detail: bundle.issuerAddress === manifest.issuerAddress
      ? `Issuer: ${bundle.issuerAddress}`
      : "Issuer mismatch",
  });

  checks.push({
    name: "operator",
    passed: bundle.operatorAddress === manifest.operatorAddress,
    detail: bundle.operatorAddress === manifest.operatorAddress
      ? `Operator: ${bundle.operatorAddress}`
      : "Operator mismatch",
  });

  // Mint facts
  const tokenIdsMatch =
    bundle.tokenIds.length === receipt.xrpl.nftTokenIds.length &&
    bundle.tokenIds.every((t, i) => t === receipt.xrpl.nftTokenIds[i]);
  checks.push({
    name: "token-ids",
    passed: tokenIdsMatch,
    detail: tokenIdsMatch
      ? `${bundle.tokenIds.length} token ID(s) match`
      : "Token IDs do not match receipt",
  });

  const txHashesMatch =
    bundle.txHashes.length === receipt.xrpl.mintTxHashes.length &&
    bundle.txHashes.every((t, i) => t === receipt.xrpl.mintTxHashes[i]);
  checks.push({
    name: "tx-hashes",
    passed: txHashesMatch,
    detail: txHashesMatch
      ? `${bundle.txHashes.length} tx hash(es) match`
      : "Tx hashes do not match receipt",
  });

  // Pointers
  checks.push({
    name: "metadata-uri",
    passed: bundle.metadataUri === manifest.metadataEndpoint,
    detail: bundle.metadataUri === manifest.metadataEndpoint
      ? "Metadata URI matches"
      : "Metadata URI mismatch",
  });

  checks.push({
    name: "license-uri",
    passed: bundle.licenseUri === manifest.license.uri,
    detail: bundle.licenseUri === manifest.license.uri
      ? "License URI matches"
      : "License URI mismatch",
  });

  checks.push({
    name: "cover-cid",
    passed: bundle.coverCid === manifest.coverCid,
    detail: bundle.coverCid === manifest.coverCid ? "Cover CID matches" : "Cover CID mismatch",
  });

  checks.push({
    name: "media-cid",
    passed: bundle.mediaCid === manifest.mediaCid,
    detail: bundle.mediaCid === manifest.mediaCid ? "Media CID matches" : "Media CID mismatch",
  });

  // Benefit
  checks.push({
    name: "benefit",
    passed:
      bundle.benefit.kind === manifest.benefit.kind &&
      bundle.benefit.contentPointer === manifest.benefit.contentPointer,
    detail:
      bundle.benefit.kind === manifest.benefit.kind
        ? `Benefit: ${bundle.benefit.kind}`
        : "Benefit mismatch",
  });

  // Policy (if provided)
  if (policy && bundle.accessPolicyLabel) {
    checks.push({
      name: "access-policy",
      passed: bundle.accessPolicyLabel === policy.label,
      detail: bundle.accessPolicyLabel === policy.label
        ? `Access policy: ${policy.label}`
        : "Access policy label mismatch",
    });
  }

  const valid = checks.every((c) => c.passed);
  return { valid, checks };
}
