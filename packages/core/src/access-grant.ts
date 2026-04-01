/**
 * Access Grant Receipt — auditable record of an access decision.
 *
 * Every access request (allow or deny) produces one of these.
 * This is a canonical artifact, not a log entry.
 */

export interface AccessGrantReceipt {
  schemaVersion: "1.0.0";
  kind: "access-grant-receipt";

  /** Release identity this grant pertains to */
  manifestId: string;

  /** Access policy that was evaluated */
  policyLabel: string;

  /** Wallet address that requested access */
  subjectAddress: string;

  /** Network queried for ownership proof */
  network: "testnet" | "devnet" | "mainnet";

  /** The decision */
  decision: "allow" | "deny";

  /** Exact reason for the decision */
  reason: string;

  /** Benefit that was (or would have been) unlocked */
  benefit: {
    kind: string;
    contentPointer: string;
  };

  /** Ownership evidence used in the decision */
  ownership: {
    /** Token IDs found on the subject's account that match qualifying set */
    matchedTokenIds: string[];
    /** Total NFTs checked on the account */
    totalNftsChecked: number;
  };

  /** Delivery details (only present on allow) */
  delivery?: {
    mode: string;
    token: string;
    expiresAt: string;
  };

  /** ISO 8601 timestamp of the decision */
  decidedAt: string;

  /** Tamper-evident fingerprint */
  grantHash?: string;
}
