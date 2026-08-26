/**
 * recover-release — reconstruct a release from canonical artifacts + chain state.
 *
 * This is the frontend death drill command. It proves the release is
 * still legible, verifiable, and recoverable without the original app.
 */

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
import { readJsonFile } from "../lib/json-input.js";

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

/**
 * Build the "Mint Facts" report lines from the receipt's parallel
 * nftTokenIds/mintTxHashes arrays (F-506382f2).
 *
 * assertReceipt() (packages/core/src/receipt-validate.ts) already rejects
 * a receipt whose nftTokenIds and mintTxHashes arrays differ in length —
 * recoverRelease() calls it on every receipt before this function ever
 * runs, so today a length mismatch can't actually reach here through the
 * CLI's normal file-based flow. This still re-asserts the invariant
 * locally and renders an explicit "MISSING" marker instead of
 * parallel-indexing into a shorter array, as defense-in-depth: it keeps
 * this section correct on its own if that upstream guarantee is ever
 * loosened, or if this rendering logic is ever reused somewhere that
 * doesn't go through assertReceipt first. Exported so it can be
 * unit-tested directly against mismatched arrays without needing to
 * fabricate a receipt that bypasses schema validation.
 *
 * Marker text ("MISSING") chosen for coordinator alignment with the
 * analogous fix in app/src/components/panels/RecoveryPanel.tsx, which
 * renders `bundle.txHashes[i] ?? ""` — same defect family (parallel-index
 * access with no length guard), fixed by a parallel wave-7 desktop-app
 * agent.
 */
export function buildMintFactsLines(
  nftTokenIds: string[],
  mintTxHashes: string[],
  transferFee: number
): { lines: string[]; passed: boolean } {
  const lines: string[] = [];
  const lengthMismatch = nftTokenIds.length !== mintTxHashes.length;

  if (lengthMismatch) {
    lines.push(
      `WARNING: nftTokenIds (${nftTokenIds.length}) and mintTxHashes ` +
        `(${mintTxHashes.length}) are different lengths — this receipt is ` +
        `malformed. Tx hashes below marked MISSING are index guesses, not ` +
        `confirmed data.`
    );
  }

  for (let i = 0; i < nftTokenIds.length; i++) {
    lines.push(`  Token ${i + 1}: ${nftTokenIds[i]}`);
    lines.push(`    Tx: ${i < mintTxHashes.length ? mintTxHashes[i] : "MISSING"}`);
  }
  lines.push(`Transfer fee: ${transferFee} basis points`);

  return { lines, passed: !lengthMismatch };
}

export async function recoverRelease(
  manifestPath: string,
  receiptPath: string,
  policyPath?: string
): Promise<RecoveryResult> {
  const sections: ReconstructionSection[] = [];

  // ── Load artifacts ──────────────────────────────────────────────

  const manifest = assertManifest(await readJsonFile(manifestPath, "manifest"));
  const receipt = assertReceipt(await readJsonFile(receiptPath, "receipt"));

  let policy: AccessPolicy | undefined;
  if (policyPath) {
    policy = assertAccessPolicy(await readJsonFile(policyPath, "policy"));
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

  const mintFacts = buildMintFactsLines(
    receipt.xrpl.nftTokenIds,
    receipt.xrpl.mintTxHashes,
    receipt.xrpl.transferFee
  );

  sections.push({ name: "Mint Facts", passed: mintFacts.passed, lines: mintFacts.lines });

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

    // Verify every minted edition still exists on-chain — not just the
    // first. A fabricated or stale token id in editions 2..N must not slip
    // through just because edition 1 checks out.
    if (receipt.xrpl.nftTokenIds.length > 0) {
      const total = receipt.xrpl.nftTokenIds.length;
      let confirmed = 0;
      const notFound: string[] = [];

      for (const tokenId of receipt.xrpl.nftTokenIds) {
        let nft = await readNftFromLedger(
          receipt.operatorAddress,
          tokenId,
          receipt.network
        );
        if (!nft) {
          nft = await readNftFromLedger(
            receipt.issuerAddress,
            tokenId,
            receipt.network
          );
        }

        if (nft) {
          confirmed++;
        } else {
          notFound.push(tokenId);
        }
      }

      chainLines.push(`${confirmed}/${total} editions confirmed on ledger`);
      if (confirmed !== total) {
        for (const tokenId of notFound) {
          chainLines.push(`  NOT found on ledger: ${tokenId.slice(0, 16)}...`);
        }
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
