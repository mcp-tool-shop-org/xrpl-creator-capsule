/**
 * Access Policy — defines who can unlock a collector benefit and how.
 *
 * Binds a specific benefit to a minted release via manifestId,
 * with ownership rules evaluated against XRPL ledger state.
 */

export interface AccessPolicy {
  schemaVersion: "1.0.0";
  kind: "access-policy";

  /** Stable release identity this policy applies to */
  manifestId: string;

  /** Human-readable policy label */
  label: string;

  /** Which benefit this policy gates */
  benefit: {
    /** Matches CollectorBenefit.kind from the manifest */
    kind: string;
    /** CID or URI of the gated content */
    contentPointer: string;
  };

  /** Ownership rule — what qualifies a wallet for access */
  rule: {
    /** Rule type — Phase C only supports "holds-nft" */
    type: "holds-nft";
    /** Issuer address the qualifying NFT must have */
    issuerAddress: string;
    /** Specific token IDs that qualify (from issuance receipt) */
    qualifyingTokenIds: string[];
  };

  /** Delivery configuration */
  delivery: {
    /** How the benefit is delivered */
    mode: "download-token";
    /** Token validity in seconds (0 = no expiry) */
    ttlSeconds: number;
  };

  /** ISO 8601 creation timestamp */
  createdAt: string;
}
