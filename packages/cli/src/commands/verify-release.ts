import { readFile } from "node:fs/promises";
import {
  assertManifest,
  assertReceipt,
  computeManifestId,
  computeRevisionHash,
  computeReceiptHash,
  type ReleaseManifest,
  type IssuanceReceipt,
} from "@capsule/core";
import {
  verifyAuthorizedMinter,
  readNftFromLedger,
} from "@capsule/xrpl";
import { convertStringToHex } from "xrpl";

export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyResult {
  passed: boolean;
  checks: VerifyCheck[];
}

/**
 * Reconcile a Release Manifest + Issuance Receipt against chain state.
 *
 * This proves the full chain:
 *   manifest intent → receipt claims → ledger truth
 *
 * Produces exact mismatch reasons on failure.
 */
export async function verifyRelease(
  manifestPath: string,
  receiptPath: string
): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];

  // ── Load and validate both artifacts ─────────────────────────────

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const receiptRaw = await readFile(receiptPath, "utf-8");
  const receipt = assertReceipt(JSON.parse(receiptRaw));

  // ── Manifest identity ────────────────────────────────────────────

  const expectedId = computeManifestId(manifest);
  checks.push({
    name: "manifest-id-match",
    passed: receipt.manifestId === expectedId,
    detail:
      receipt.manifestId === expectedId
        ? `Manifest ID matches: ${expectedId.slice(0, 16)}...`
        : `Manifest ID mismatch: receipt has ${receipt.manifestId.slice(0, 16)}..., expected ${expectedId.slice(0, 16)}...`,
  });

  // ── Revision hash ────────────────────────────────────────────────

  const expectedRevision = computeRevisionHash(manifest);
  checks.push({
    name: "revision-hash-match",
    passed: receipt.manifestRevisionHash === expectedRevision,
    detail:
      receipt.manifestRevisionHash === expectedRevision
        ? `Revision hash matches: ${expectedRevision.slice(0, 16)}...`
        : `Revision hash mismatch: manifest has been modified since issuance`,
  });

  // ── Receipt integrity ────────────────────────────────────────────

  if (receipt.receiptHash) {
    const expectedReceiptHash = computeReceiptHash(receipt);
    checks.push({
      name: "receipt-integrity",
      passed: receipt.receiptHash === expectedReceiptHash,
      detail:
        receipt.receiptHash === expectedReceiptHash
          ? "Receipt hash is valid (untampered)"
          : "Receipt hash mismatch — receipt may have been tampered with",
    });
  }

  // ── Issuer/operator identity ─────────────────────────────────────

  checks.push({
    name: "issuer-match",
    passed: receipt.issuerAddress === manifest.issuerAddress,
    detail:
      receipt.issuerAddress === manifest.issuerAddress
        ? `Issuer matches: ${manifest.issuerAddress}`
        : `Issuer mismatch: receipt ${receipt.issuerAddress}, manifest ${manifest.issuerAddress}`,
  });

  checks.push({
    name: "operator-match",
    passed: receipt.operatorAddress === manifest.operatorAddress,
    detail:
      receipt.operatorAddress === manifest.operatorAddress
        ? `Operator matches: ${manifest.operatorAddress}`
        : `Operator mismatch: receipt ${receipt.operatorAddress}, manifest ${manifest.operatorAddress}`,
  });

  // ── Transfer fee ─────────────────────────────────────────────────

  const expectedFee = Math.round(manifest.transferFeePercent * 1000);
  checks.push({
    name: "transfer-fee-match",
    passed: receipt.xrpl.transferFee === expectedFee,
    detail:
      receipt.xrpl.transferFee === expectedFee
        ? `Transfer fee matches: ${expectedFee} (${manifest.transferFeePercent}%)`
        : `Transfer fee mismatch: receipt ${receipt.xrpl.transferFee}, expected ${expectedFee}`,
  });

  // ── Token count ──────────────────────────────────────────────────

  checks.push({
    name: "edition-count",
    passed: receipt.xrpl.nftTokenIds.length === manifest.editionSize,
    detail:
      receipt.xrpl.nftTokenIds.length === manifest.editionSize
        ? `Edition count matches: ${manifest.editionSize}`
        : `Edition count mismatch: ${receipt.xrpl.nftTokenIds.length} minted, ${manifest.editionSize} expected`,
  });

  // ── Pointer coherence ────────────────────────────────────────────

  checks.push({
    name: "metadata-pointer",
    passed: receipt.pointers.metadataUri === manifest.metadataEndpoint,
    detail:
      receipt.pointers.metadataUri === manifest.metadataEndpoint
        ? "Metadata URI matches"
        : "Metadata URI mismatch between receipt and manifest",
  });

  checks.push({
    name: "license-pointer",
    passed: receipt.pointers.licenseUri === manifest.license.uri,
    detail:
      receipt.pointers.licenseUri === manifest.license.uri
        ? "License URI matches"
        : "License URI mismatch between receipt and manifest",
  });

  checks.push({
    name: "cover-cid",
    passed: receipt.pointers.coverCid === manifest.coverCid,
    detail:
      receipt.pointers.coverCid === manifest.coverCid
        ? "Cover CID matches"
        : "Cover CID mismatch between receipt and manifest",
  });

  checks.push({
    name: "media-cid",
    passed: receipt.pointers.mediaCid === manifest.mediaCid,
    detail:
      receipt.pointers.mediaCid === manifest.mediaCid
        ? "Media CID matches"
        : "Media CID mismatch between receipt and manifest",
  });

  // ── Chain verification (if we can reach the network) ─────────────

  try {
    // Verify authorized minter still set correctly
    const minterCheck = await verifyAuthorizedMinter(
      receipt.issuerAddress,
      receipt.operatorAddress,
      receipt.network
    );
    checks.push({
      name: "chain-minter-status",
      passed: minterCheck.verified,
      detail: minterCheck.verified
        ? "Authorized minter confirmed on ledger"
        : `Minter check failed: ${minterCheck.error}`,
    });

    // Verify first NFT exists on chain with correct URI.
    // NFTs minted by authorized minter are held by the minting account
    // (operator), not the issuer. Check operator first, then issuer.
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
        const expectedUri = convertStringToHex(manifest.metadataEndpoint);
        checks.push({
          name: "chain-nft-exists",
          passed: true,
          detail: `NFT ${firstTokenId.slice(0, 16)}... found on ledger`,
        });
        checks.push({
          name: "chain-nft-uri",
          passed: nft.uri === expectedUri,
          detail:
            nft.uri === expectedUri
              ? "On-chain URI matches manifest metadata endpoint"
              : "On-chain URI does not match manifest metadata endpoint",
        });
        checks.push({
          name: "chain-nft-issuer",
          passed: nft.issuer === receipt.issuerAddress,
          detail:
            nft.issuer === receipt.issuerAddress
              ? "On-chain issuer matches receipt"
              : `On-chain issuer ${nft.issuer} differs from receipt ${receipt.issuerAddress}`,
        });
        checks.push({
          name: "chain-nft-transfer-fee",
          passed: nft.transferFee === receipt.xrpl.transferFee,
          detail:
            nft.transferFee === receipt.xrpl.transferFee
              ? `On-chain transfer fee matches: ${nft.transferFee}`
              : `On-chain transfer fee ${nft.transferFee} differs from receipt ${receipt.xrpl.transferFee}`,
        });
      } else {
        checks.push({
          name: "chain-nft-exists",
          passed: false,
          detail: `NFT ${firstTokenId.slice(0, 16)}... not found on issuer account`,
        });
      }
    }
  } catch (err) {
    checks.push({
      name: "chain-connectivity",
      passed: false,
      detail: `Could not connect to ${receipt.network}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}
