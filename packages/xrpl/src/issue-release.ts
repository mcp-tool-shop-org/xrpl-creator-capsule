import {
  type ReleaseManifest,
  type IssuanceReceipt,
  computeManifestId,
  computeRevisionHash,
  resolveManifestPointers,
  stampReceiptHash,
} from "@capsule/core";
import type { ContentStore } from "@capsule/storage";
import type { WalletPair } from "./wallet.js";
import type { NetworkId } from "./network.js";
import { assertMainnetAllowed } from "./network.js";
import { verifyAuthorizedMinter } from "./verify-minter.js";
import { mintRelease, PartialMintError, type MintResult } from "./mint.js";

export interface IssueReleaseOptions {
  manifest: ReleaseManifest;
  wallets: WalletPair;
  network: NetworkId;
  allowMainnetWrite?: boolean;
  storage: ContentStore;
  storageProvider: string;
  /**
   * The real on-chain tx hash of the AccountSet transaction that
   * authorized the operator as minter (returned by authorizeOperatorAsMinter
   * in wallet.ts). issueRelease itself only RE-VERIFIES the authorization
   * via verifyAuthorizedMinter, a read-only account_info call with no tx
   * hash of its own — so the hash can only be supplied here by a caller
   * that ran the authorization step and captured it. When omitted, the
   * receipt's xrpl.authorizedMinterTxHash is left undefined rather than a
   * fabricated value.
   */
  authorizedMinterTxHash?: string;
  /**
   * The URI minted into an NFT is effectively permanent, so by default
   * (false) an unresolved media or cover CID in storage.has() is a hard
   * pre-flight error — issuance stops before verifying the minter or
   * minting anything. Mirrors the allowMainnetWrite escape hatch already
   * used in this file: set to true to explicitly opt back into the legacy
   * warn-and-proceed behavior (e.g. intentional async/eventual pinning),
   * which is otherwise unchanged.
   */
  allowUnresolvedStorage?: boolean;
}

/**
 * Full issuance flow: validate → verify minter → resolve storage → mint → emit receipt.
 *
 * This is the canonical path from creator intent to ledger-backed execution truth.
 * Receipt is written AFTER successful mint, never before.
 */
export async function issueRelease(
  opts: IssueReleaseOptions
): Promise<IssuanceReceipt> {
  const {
    manifest,
    wallets,
    network,
    allowMainnetWrite = false,
    storage,
    storageProvider,
    allowUnresolvedStorage = false,
    authorizedMinterTxHash,
  } = opts;

  assertMainnetAllowed(network, allowMainnetWrite);

  // ── Pre-flight checks ────────────────────────────────────────────

  const errors: string[] = [];
  const warnings: string[] = [];

  // Issuer/operator separation
  const separated = manifest.issuerAddress !== manifest.operatorAddress;
  if (!separated) {
    errors.push("Issuer and operator addresses must differ");
  }

  // Wallet/manifest identity match
  if (manifest.issuerAddress !== wallets.issuer.address) {
    errors.push(
      `Manifest issuerAddress (${manifest.issuerAddress}) does not match wallet (${wallets.issuer.address})`
    );
  }
  if (manifest.operatorAddress !== wallets.operator.address) {
    errors.push(
      `Manifest operatorAddress (${manifest.operatorAddress}) does not match wallet (${wallets.operator.address})`
    );
  }

  // Pointer resolution
  const pointerResult = resolveManifestPointers(manifest);
  if (!pointerResult.passed) {
    for (const check of pointerResult.checks) {
      if (!check.passed) errors.push(check.detail);
    }
  }

  // Storage resolution
  const mediaResolved = await storage.has(manifest.mediaCid);
  const coverResolved = await storage.has(manifest.coverCid);
  if (!mediaResolved) {
    const msg = `Media CID ${manifest.mediaCid} not found in storage`;
    if (allowUnresolvedStorage) warnings.push(msg);
    else errors.push(msg);
  }
  if (!coverResolved) {
    const msg = `Cover CID ${manifest.coverCid} not found in storage`;
    if (allowUnresolvedStorage) warnings.push(msg);
    else errors.push(msg);
  }

  if (errors.length > 0) {
    throw new Error(
      `Issuance pre-flight failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  // ── Verify authorized minter on ledger ───────────────────────────

  const minterCheck = await verifyAuthorizedMinter(
    manifest.issuerAddress,
    manifest.operatorAddress,
    network
  );

  if (!minterCheck.verified) {
    throw new Error(
      `Authorized minter verification failed: ${minterCheck.error}`
    );
  }

  // ── Mint ─────────────────────────────────────────────────────────

  let mintResult: MintResult;
  try {
    mintResult = await mintRelease(manifest, wallets, network, allowMainnetWrite);
  } catch (err) {
    if (err instanceof PartialMintError) {
      // Do not let a mid-run mint failure erase the editions that already
      // landed on-ledger — forward exactly which ones so this cannot be
      // silently double-minted by a naive retry.
      throw new Error(
        `Mint failed: ${err.message} — ${err.tokenIds.length} of ` +
          `${err.editionSize} edition(s) were already minted on-ledger ` +
          `before the failure and have NO receipt yet ` +
          `(tokenIds: ${err.tokenIds.join(", ") || "none"}; ` +
          `txHashes: ${err.txHashes.join(", ") || "none"}).`,
        { cause: err }
      );
    }
    throw new Error(
      `Mint failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  // ── Build receipt AFTER successful mint ───────────────────────────

  const receipt: IssuanceReceipt = {
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network,
    issuedAt: new Date().toISOString(),
    issuerAddress: manifest.issuerAddress,
    operatorAddress: manifest.operatorAddress,
    release: {
      title: manifest.title,
      artist: manifest.artist,
      editionSize: manifest.editionSize,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    pointers: {
      metadataUri: manifest.metadataEndpoint,
      licenseUri: manifest.license.uri,
      coverCid: manifest.coverCid,
      mediaCid: manifest.mediaCid,
    },
    xrpl: {
      authorizedMinterVerified: true,
      authorizedMinterTxHash,
      mintTxHashes: mintResult.txHashes,
      nftTokenIds: mintResult.tokenIds,
      tokenTaxon: 0,
      flags: 0x00000008, // tfTransferable
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    storage: {
      provider: storageProvider,
      mediaResolved,
      coverResolved,
    },
    verification: {
      manifestMatchesPointers: pointerResult.passed,
      issuerOperatorSeparated: separated,
      networkAllowed: true,
      errors: [],
      warnings,
    },
  };

  return stampReceiptHash(receipt);
}
