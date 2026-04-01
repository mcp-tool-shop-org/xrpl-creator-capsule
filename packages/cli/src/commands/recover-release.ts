/**
 * recover-release — reconstruct a release from canonical artifacts + chain state.
 *
 * This is the frontend death drill command. It proves the release is
 * still legible, verifiable, and recoverable without the original app.
 */

import { readFile } from "node:fs/promises";
import {
  assertManifest,
  assertReceipt,
  assertAccessPolicy,
  deriveRecoveryBundle,
  verifyBundleConsistency,
  computeManifestId,
  computeRevisionHash,
  computeReceiptHash,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
  type RecoveryBundle,
} from "@capsule/core";
import {
  verifyAuthorizedMinter,
  readNftFromLedger,
  checkHolder,
} from "@capsule/xrpl";

export interface RecoveryResult {
  bundle: RecoveryBundle;
  reconstruction: ReconstructionReport;
}

export interface ReconstructionReport {
  passed: boolean;
  sections: ReconstructionSection[];
}

export interface ReconstructionSection {
  name: string;
  passed: boolean;
  lines: string[];
}

export async function recoverRelease(
  manifestPath: string,
  receiptPath: string,
  policyPath?: string
): Promise<RecoveryResult> {
  const sections: ReconstructionSection[] = [];

  // ── Load artifacts ──────────────────────────────────────────────

  const manifest = assertManifest(
    JSON.parse(await readFile(manifestPath, "utf-8"))
  );
  const receipt = assertReceipt(
    JSON.parse(await readFile(receiptPath, "utf-8"))
  );

  let policy: AccessPolicy | undefined;
  if (policyPath) {
    policy = assertAccessPolicy(
      JSON.parse(await readFile(policyPath, "utf-8"))
    );
  }

  // ── Derive bundle ───────────────────────────────────────────────

  const bundle = deriveRecoveryBundle(manifest, receipt, policy);

  // ── Section 1: Release Identity ─────────────────────────────────

  const manifestId = computeManifestId(manifest);
  const revisionHash = computeRevisionHash(manifest);
  const identityOk =
    receipt.manifestId === manifestId &&
    receipt.manifestRevisionHash === revisionHash;

  sections.push({
    name: "Release Identity",
    passed: identityOk,
    lines: [
      `Title: ${manifest.title}`,
      `Artist: ${manifest.artist}`,
      `Edition size: ${manifest.editionSize}`,
      `Manifest ID: ${manifestId}`,
      `Revision hash: ${revisionHash.slice(0, 16)}...`,
      identityOk
        ? "Manifest identity matches issuance receipt"
        : "WARNING: Manifest identity does not match issuance receipt — manifest may have been modified",
    ],
  });

  // ── Section 2: Issuance Receipt Integrity ───────────────────────

  let receiptOk = true;
  const receiptLines: string[] = [
    `Network: ${receipt.network}`,
    `Issued at: ${receipt.issuedAt}`,
    `Issuer: ${receipt.issuerAddress}`,
    `Operator: ${receipt.operatorAddress}`,
    `Editions minted: ${receipt.xrpl.nftTokenIds.length}`,
  ];

  if (receipt.receiptHash) {
    const expectedHash = computeReceiptHash(receipt);
    receiptOk = receipt.receiptHash === expectedHash;
    receiptLines.push(
      receiptOk
        ? "Receipt integrity: valid (untampered)"
        : "WARNING: Receipt hash mismatch — receipt may have been tampered with"
    );
  } else {
    receiptLines.push("Receipt hash: not stamped");
  }

  sections.push({ name: "Issuance Receipt", passed: receiptOk, lines: receiptLines });

  // ── Section 3: Mint Facts ───────────────────────────────────────

  const mintLines: string[] = [];
  for (let i = 0; i < receipt.xrpl.nftTokenIds.length; i++) {
    mintLines.push(`  Token ${i + 1}: ${receipt.xrpl.nftTokenIds[i]}`);
    mintLines.push(`    Tx: ${receipt.xrpl.mintTxHashes[i]}`);
  }
  mintLines.push(`Transfer fee: ${receipt.xrpl.transferFee} basis points`);

  sections.push({ name: "Mint Facts", passed: true, lines: mintLines });

  // ── Section 4: Durable Pointers ─────────────────────────────────

  sections.push({
    name: "Durable Pointers",
    passed: true,
    lines: [
      `Metadata: ${manifest.metadataEndpoint}`,
      `License: ${manifest.license.uri}`,
      `Cover CID: ${manifest.coverCid}`,
      `Media CID: ${manifest.mediaCid}`,
    ],
  });

  // ── Section 5: License Terms ────────────────────────────────────

  sections.push({
    name: "License Terms",
    passed: true,
    lines: [
      `Type: ${manifest.license.type}`,
      `Summary: ${manifest.license.summary}`,
      `Full text: ${manifest.license.uri}`,
    ],
  });

  // ── Section 6: Collector Benefit ────────────────────────────────

  const benefitLines = [
    `Benefit: ${manifest.benefit.kind}`,
    `Description: ${manifest.benefit.description}`,
    `Content pointer: ${manifest.benefit.contentPointer}`,
  ];

  if (policy) {
    benefitLines.push(`Access policy: ${policy.label}`);
    benefitLines.push(`Qualifying tokens: ${policy.rule.qualifyingTokenIds.length}`);
    benefitLines.push(`Delivery: ${policy.delivery.mode} (TTL: ${policy.delivery.ttlSeconds}s)`);
  } else {
    benefitLines.push("No access policy provided — benefit entitlement cannot be evaluated");
  }

  sections.push({ name: "Collector Benefit", passed: true, lines: benefitLines });

  // ── Section 7: Chain Verification ───────────────────────────────

  let chainOk = true;
  const chainLines: string[] = [];

  try {
    // Verify minter is still configured
    const minterCheck = await verifyAuthorizedMinter(
      receipt.issuerAddress,
      receipt.operatorAddress,
      receipt.network
    );
    chainLines.push(
      minterCheck.verified
        ? "Authorized minter: confirmed on ledger"
        : `Authorized minter: ${minterCheck.error}`
    );
    if (!minterCheck.verified) chainOk = false;

    // Verify first NFT exists
    if (receipt.xrpl.nftTokenIds.length > 0) {
      const firstTokenId = receipt.xrpl.nftTokenIds[0];
      let nft = await readNftFromLedger(
        receipt.operatorAddress,
        firstTokenId,
        receipt.network
      );
      if (!nft) {
        nft = await readNftFromLedger(
          receipt.issuerAddress,
          firstTokenId,
          receipt.network
        );
      }

      if (nft) {
        chainLines.push(`NFT ${firstTokenId.slice(0, 16)}... found on ledger`);
        chainLines.push(`  Issuer: ${nft.issuer}`);
        chainLines.push(`  Transfer fee: ${nft.transferFee}`);
      } else {
        chainLines.push(`NFT ${firstTokenId.slice(0, 16)}... NOT found on ledger`);
        chainOk = false;
      }
    }
  } catch (err) {
    chainLines.push(
      `Chain verification failed: ${err instanceof Error ? err.message : String(err)}`
    );
    chainOk = false;
  }

  sections.push({ name: "Chain Verification", passed: chainOk, lines: chainLines });

  // ── Section 8: Recovery Instructions ────────────────────────────

  sections.push({
    name: "Recovery Instructions",
    passed: true,
    lines: [
      "To verify ownership of this release:",
      `  1. Query XRPL ${receipt.network} for the token ID(s) listed above`,
      `  2. Check that the wallet holds at least one qualifying NFT`,
      `  3. The NFT issuer should be: ${receipt.issuerAddress}`,
      "",
      "To access the collector benefit:",
      `  1. Prove wallet holds a qualifying NFT from this release`,
      `  2. Benefit: ${manifest.benefit.kind} — ${manifest.benefit.description}`,
      `  3. Content at: ${manifest.benefit.contentPointer}`,
      "",
      "Durable references:",
      `  Metadata: ${manifest.metadataEndpoint}`,
      `  License: ${manifest.license.uri}`,
      `  Cover: ${manifest.coverCid}`,
      `  Media: ${manifest.mediaCid}`,
    ],
  });

  const passed = sections.every((s) => s.passed);
  return {
    bundle,
    reconstruction: { passed, sections },
  };
}
