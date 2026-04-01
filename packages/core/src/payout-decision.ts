/**
 * Payout Decision Receipt — records whether a proposal was approved or rejected.
 */

import type { Sha256Hex, XrplAddress, IsoUtc } from "./governance-policy.js";

export interface GovernanceApproval {
  signerAddress: XrplAddress;
  approved: boolean;
  decidedAt: IsoUtc;
  note?: string;
}

export interface PayoutDecisionReceipt {
  schemaVersion: "1.0.0";
  kind: "payout-decision-receipt";

  manifestId: string;
  policyHash: Sha256Hex;
  proposalId: string;
  proposalHash: Sha256Hex;

  network: "testnet" | "devnet" | "mainnet";
  treasuryAddress: XrplAddress;

  approvals: GovernanceApproval[];

  decision: {
    outcome: "approved" | "rejected";
    thresholdMet: boolean;
    approvedCount: number;
    rejectedCount: number;
  };

  decidedAt: IsoUtc;
  decidedBy: string;

  decisionHash?: Sha256Hex;
}
