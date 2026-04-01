/**
 * Bridge Worker — Node.js process that exposes @capsule/core and @capsule/xrpl
 * to the Tauri desktop app via stdin/stdout JSON-RPC.
 *
 * Protocol:
 *   stdin  ← JSON { command: string, params: Record<string, unknown> }
 *   stdout → JSON { ok: true, data: unknown } | { ok: false, error: string }
 *
 * Tauri Rust commands spawn this script via `npx tsx app/bridge-worker.ts`,
 * pipe the command JSON on stdin, and read the result from stdout.
 *
 * This file is the ONLY place the desktop app touches engine code.
 * React never imports @capsule/* directly.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertManifest,
  validateManifest,
  computeManifestId,
  computeRevisionHash,
  stampManifestId,
  resolveManifestPointers,
  assertReceipt,
  computeReceiptHash,
  type ReleaseManifest,
  type IssuanceReceipt,
} from "@capsule/core";
import {
  importWalletPair,
  issueRelease,
  verifyAuthorizedMinter,
  readNftFromLedger,
  type NetworkId,
} from "@capsule/xrpl";
import { MockContentStore } from "@capsule/storage";
import { convertStringToHex } from "xrpl";

// ── Types ───────────────────────────────────────────────────────────

interface BridgeCommand {
  command: string;
  params: Record<string, unknown>;
}

interface BridgeOk {
  ok: true;
  data: unknown;
}

interface BridgeErr {
  ok: false;
  error: string;
}

type BridgeResult = BridgeOk | BridgeErr;

// ── Command dispatch ────────────────────────────────────────────────

async function dispatch(cmd: BridgeCommand): Promise<unknown> {
  switch (cmd.command) {
    case "validate_manifest":
      return validateManifestCmd(cmd.params);
    case "resolve_manifest":
      return resolveManifestCmd(cmd.params);
    case "stamp_manifest":
      return stampManifestCmd(cmd.params);
    case "mint_release":
      return mintReleaseCmd(cmd.params);
    case "verify_release":
      return verifyReleaseCmd(cmd.params);
    default:
      throw new Error(`Unknown command: ${cmd.command}`);
  }
}

// ── Commands ────────────────────────────────────────────────────────

async function validateManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, errors: [`Failed to parse ${path} as JSON`] };
  }
  return validateManifest(parsed);
}

async function resolveManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  const manifest = assertManifest(JSON.parse(raw));
  return resolveManifestPointers(manifest);
}

async function stampManifestCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const path = params.path as string;
  const raw = await readFile(path, "utf-8");
  const manifest = assertManifest(JSON.parse(raw));
  const stamped = stampManifestId(manifest);
  const manifestId = computeManifestId(manifest);
  const revisionHash = computeRevisionHash(manifest);
  return { manifest: stamped, manifestId, revisionHash };
}

async function mintReleaseCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const walletsPath = params.walletsPath as string;
  const network = (params.network ?? "testnet") as NetworkId;
  const receiptPath = params.receiptPath as string;

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const walletRaw = await readFile(walletsPath, "utf-8");
  const wallets = importWalletPair(JSON.parse(walletRaw));

  const storage = new MockContentStore();

  const receipt = await issueRelease({
    manifest,
    wallets,
    network,
    allowMainnetWrite: false,
    storage,
    storageProvider: "mock",
  });

  // Persist receipt
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

  return receipt;
}

async function verifyReleaseCmd(
  params: Record<string, unknown>
): Promise<unknown> {
  const manifestPath = params.manifestPath as string;
  const receiptPath = params.receiptPath as string;

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const receiptRaw = await readFile(receiptPath, "utf-8");
  const receipt = assertReceipt(JSON.parse(receiptRaw));

  interface Check {
    name: string;
    passed: boolean;
    detail: string;
  }

  const checks: Check[] = [];

  // ── Manifest identity ──────────────────────────────────────────

  const expectedId = computeManifestId(manifest);
  checks.push({
    name: "manifest-id-match",
    passed: receipt.manifestId === expectedId,
    detail:
      receipt.manifestId === expectedId
        ? `Manifest ID matches: ${expectedId.slice(0, 16)}...`
        : `Manifest ID mismatch: receipt has ${receipt.manifestId.slice(0, 16)}..., expected ${expectedId.slice(0, 16)}...`,
  });

  // ── Revision hash ──────────────────────────────────────────────

  const expectedRevision = computeRevisionHash(manifest);
  checks.push({
    name: "revision-hash-match",
    passed: receipt.manifestRevisionHash === expectedRevision,
    detail:
      receipt.manifestRevisionHash === expectedRevision
        ? `Revision hash matches: ${expectedRevision.slice(0, 16)}...`
        : `Revision hash mismatch: manifest modified since issuance`,
  });

  // ── Receipt integrity ──────────────────────────────────────────

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

  // ── Issuer/operator ────────────────────────────────────────────

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

  // ── Transfer fee ───────────────────────────────────────────────

  const expectedFee = Math.round(manifest.transferFeePercent * 1000);
  checks.push({
    name: "transfer-fee-match",
    passed: receipt.xrpl.transferFee === expectedFee,
    detail:
      receipt.xrpl.transferFee === expectedFee
        ? `Transfer fee matches: ${expectedFee} (${manifest.transferFeePercent}%)`
        : `Transfer fee mismatch: receipt ${receipt.xrpl.transferFee}, expected ${expectedFee}`,
  });

  // ── Token count ────────────────────────────────────────────────

  checks.push({
    name: "edition-count",
    passed: receipt.xrpl.nftTokenIds.length === manifest.editionSize,
    detail:
      receipt.xrpl.nftTokenIds.length === manifest.editionSize
        ? `Edition count matches: ${manifest.editionSize}`
        : `Edition count mismatch: ${receipt.xrpl.nftTokenIds.length} minted, ${manifest.editionSize} expected`,
  });

  // ── Pointer coherence ─────────────────────────────────────────

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

  // ── Chain verification ─────────────────────────────────────────

  try {
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
          detail: `NFT ${firstTokenId.slice(0, 16)}... not found on ledger`,
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

// ── Main: read stdin, dispatch, write stdout ────────────────────────

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  let cmd: BridgeCommand;
  try {
    cmd = JSON.parse(input);
  } catch {
    const result: BridgeErr = { ok: false, error: "Invalid JSON on stdin" };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }

  try {
    const data = await dispatch(cmd);
    const result: BridgeResult = { ok: true, data };
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const result: BridgeErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }
}

main();
