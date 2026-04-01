/**
 * Release Manifest — the canonical object for XRPL Creator Capsule.
 *
 * Everything in the system is a view or operation on this contract.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CollectorBenefit {
  /** What the collector receives (e.g., "bonus-track", "stems", "lossless-master", "artwork-pack") */
  kind: string;
  /** Human-readable description of the benefit */
  description: string;
  /** CID or URI pointing to the gated content */
  contentPointer: string;
}

export interface PayoutPolicy {
  /** XRPL address of the treasury account */
  treasuryAddress: string;
  /** Whether multi-sig is required for withdrawals */
  multiSig: boolean;
  /** Signer addresses if multi-sig is enabled */
  signers?: string[];
  /** Minimum number of signers required (quorum) */
  quorum?: number;
  /** Human-readable payout terms */
  terms: string;
}

export interface LicenseTerms {
  /** SPDX-like identifier or "custom" */
  type: string;
  /** Plain-English summary of what the buyer receives and does NOT receive */
  summary: string;
  /** URI to the full license text */
  uri: string;
}

export interface ReleaseManifest {
  /** Schema version for forward compatibility */
  schemaVersion: "1.0.0";

  // ── Identity ──────────────────────────────────────────────────────
  /** Unique release identifier (deterministic hash of core fields) */
  id?: string;
  /** Release title */
  title: string;
  /** Artist or creator name */
  artist: string;

  // ── Edition ───────────────────────────────────────────────────────
  /** Total number of editions available */
  editionSize: number;

  // ── Media ─────────────────────────────────────────────────────────
  /** IPFS CID or Arweave ID for the primary cover/artwork */
  coverCid: string;
  /** IPFS CID or Arweave ID for the primary media (audio, video, etc.) */
  mediaCid: string;

  // ── Metadata ──────────────────────────────────────────────────────
  /** URI where metadata JSON is hosted (resolvable endpoint) */
  metadataEndpoint: string;

  // ── License ───────────────────────────────────────────────────────
  /** Explicit license terms — purchase does NOT transfer copyright */
  license: LicenseTerms;

  // ── Collector benefit ─────────────────────────────────────────────
  /** What holders unlock by owning an edition */
  benefit: CollectorBenefit;

  // ── Commerce ──────────────────────────────────────────────────────
  /** Price per edition in drops (1 XRP = 1,000,000 drops) */
  priceDrops: string;
  /** Secondary sale royalty percentage (0–50, XRPL TransferFee range) */
  transferFeePercent: number;

  // ── Governance ────────────────────────────────────────────────────
  /** Collaborator payout governance */
  payoutPolicy: PayoutPolicy;

  // ── XRPL identity ─────────────────────────────────────────────────
  /** Cold issuer account address */
  issuerAddress: string;
  /** Operational (authorized minter) account address */
  operatorAddress: string;

  // ── Timestamps ────────────────────────────────────────────────────
  /** ISO 8601 creation timestamp */
  createdAt: string;
}
