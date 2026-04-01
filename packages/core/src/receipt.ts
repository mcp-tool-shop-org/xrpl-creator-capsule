/**
 * Issuance Receipt — ledger-backed execution truth.
 *
 * Release Manifest = creator intent
 * Issuance Receipt = what actually happened on chain
 *
 * This is a canonical artifact, not logs. It proves:
 * - which manifest version was used
 * - which wallets executed
 * - what was minted and where
 * - what pointers were resolved at issuance time
 */

// ── Branded type aliases for clarity ────────────────────────────────

export type Sha256Hex = string;
export type XrplAddress = string;
export type UriString = string;
export type CidString = string;
export type NetworkId = "testnet" | "devnet" | "mainnet";

// ── Receipt contract ────────────────────────────────────────────────

export interface IssuanceReceipt {
  schemaVersion: "1.0.0";
  kind: "issuance-receipt";

  /** Stable release identity (from manifest identity fields) */
  manifestId: string;

  /** Full SHA-256 of the complete manifest at issuance time */
  manifestRevisionHash: Sha256Hex;

  /** Network the issuance occurred on */
  network: NetworkId;

  /** ISO-8601 UTC timestamp of issuance */
  issuedAt: string;

  /** Cold issuer account */
  issuerAddress: XrplAddress;

  /** Operational minter account */
  operatorAddress: XrplAddress;

  /** Release identity snapshot */
  release: {
    title: string;
    artist: string;
    editionSize: number;
    transferFee: number;
  };

  /** Pointer values resolved at issuance time */
  pointers: {
    metadataUri: UriString;
    licenseUri: UriString;
    coverCid: CidString;
    mediaCid: CidString;
  };

  /** XRPL execution facts */
  xrpl: {
    authorizedMinterVerified: boolean;
    authorizedMinterTxHash?: string;
    mintTxHashes: string[];
    nftTokenIds: string[];
    tokenTaxon: number;
    flags: number;
    transferFee: number;
  };

  /** Storage resolution status at issuance time */
  storage: {
    provider: string;
    mediaResolved: boolean;
    coverResolved: boolean;
  };

  /** Verification snapshot captured at write time */
  verification: {
    manifestMatchesPointers: boolean;
    issuerOperatorSeparated: boolean;
    networkAllowed: boolean;
    errors: string[];
    warnings: string[];
  };

  /** Tamper-evident fingerprint of this receipt (computed on serialize) */
  receiptHash?: Sha256Hex;
}
