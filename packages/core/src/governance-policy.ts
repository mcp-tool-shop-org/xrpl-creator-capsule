/**
 * Governance Policy — canonical control policy for a release treasury.
 *
 * Defines who can approve payouts, what assets are allowed,
 * and the threshold required for execution eligibility.
 */

export type Sha256Hex = string;
export type XrplAddress = string;
export type IsoUtc = string;

export type SignerRole = "artist" | "producer" | "label" | "manager" | "collaborator" | "other";

export interface GovernanceSigner {
  address: XrplAddress;
  role: SignerRole;
  label?: string;
}

export interface GovernancePolicy {
  schemaVersion: "1.0.0";
  kind: "governance-policy";

  /** Release this policy governs */
  manifestId: string;
  /** Network the treasury lives on */
  network: "testnet" | "devnet" | "mainnet";

  /** Treasury account that holds release revenue */
  treasuryAddress: XrplAddress;

  /** Who can approve payouts and how many are needed */
  signerPolicy: {
    signers: GovernanceSigner[];
    threshold: number;
  };

  /** What payouts are allowed */
  payoutPolicy: {
    allowedAssets: string[];
    allowPartialPayouts: boolean;
    maxOutputsPerProposal?: number;
    notes?: string;
  };

  createdAt: IsoUtc;
  createdBy: string;

  /** Tamper-evident fingerprint */
  policyHash?: Sha256Hex;
}
