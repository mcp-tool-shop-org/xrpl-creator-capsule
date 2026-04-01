/**
 * Recovery Bundle — durable reconstruction map for a released work.
 *
 * This is NOT a new source of truth. It derives entirely from existing
 * canonical artifacts (manifest, issuance receipt, access policy) and
 * provides a self-contained pointer set that allows reconstruction
 * of the release without the original app.
 *
 * A collector or operator should be able to read this bundle and
 * understand: what the release is, who issued it, what was minted,
 * what it unlocks, and where all durable references live.
 */

export interface RecoveryBundle {
  schemaVersion: "1.0.0";
  kind: "recovery-bundle";

  // ── Release identity ──────────────────────────────────────────────

  /** Stable release identity hash */
  manifestId: string;
  /** Full manifest revision hash at issuance time */
  revisionHash: string;
  /** Tamper-evident receipt fingerprint */
  receiptHash: string;

  // ── Provenance ────────────────────────────────────────────────────

  /** Release title */
  title: string;
  /** Artist or creator */
  artist: string;
  /** Edition count */
  editionSize: number;
  /** Network the release lives on */
  network: "testnet" | "devnet" | "mainnet";
  /** Cold issuer account */
  issuerAddress: string;
  /** Operational minter account */
  operatorAddress: string;

  // ── Mint facts ────────────────────────────────────────────────────

  /** XRPL NFT token IDs minted for this release */
  tokenIds: string[];
  /** Corresponding mint transaction hashes */
  txHashes: string[];
  /** Transfer fee in XRPL basis points */
  transferFee: number;

  // ── Durable pointers ──────────────────────────────────────────────

  /** Metadata endpoint (resolvable URI) */
  metadataUri: string;
  /** License text endpoint */
  licenseUri: string;
  /** Cover artwork CID */
  coverCid: string;
  /** Primary media CID */
  mediaCid: string;

  // ── License summary ───────────────────────────────────────────────

  /** License type (SPDX or "custom") */
  licenseType: string;
  /** Plain-English license summary */
  licenseSummary: string;

  // ── Benefit ───────────────────────────────────────────────────────

  /** What holders unlock */
  benefit: {
    kind: string;
    description: string;
    contentPointer: string;
  };

  // ── Access policy reference ───────────────────────────────────────

  /** Access policy label (if policy was provided) */
  accessPolicyLabel?: string;
  /** Qualifying token IDs for benefit access */
  qualifyingTokenIds?: string[];

  // ── Recovery metadata ─────────────────────────────────────────────

  /** When this bundle was generated */
  generatedAt: string;
  /** Recovery instructions version */
  recoveryVersion: "1.0.0";

  /** Human-readable recovery instructions */
  instructions: string[];

  /** Tamper-evident fingerprint of this bundle */
  bundleHash?: string;
}
