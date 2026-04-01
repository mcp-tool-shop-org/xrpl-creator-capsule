/**
 * Payout Execution Receipt — ledger-backed execution truth for a payout.
 */

import type { Sha256Hex, XrplAddress, IsoUtc, SignerRole } from "./governance-policy.js";

export interface ExecutedPayoutOutput {
  address: XrplAddress;
  amount: string;
  asset: string;
  role: SignerRole;
  reason: string;
}

export interface PayoutExecutionReceipt {
  schemaVersion: "1.0.0";
  kind: "payout-execution-receipt";

  manifestId: string;
  policyHash: Sha256Hex;
  proposalId: string;
  proposalHash: Sha256Hex;
  decisionHash: Sha256Hex;

  network: "testnet" | "devnet" | "mainnet";
  treasuryAddress: XrplAddress;

  executedAt: IsoUtc;
  executedBy: string;

  xrpl: {
    txHashes: string[];
    ledgerIndexes?: number[];
  };

  executedOutputs: ExecutedPayoutOutput[];

  verification: {
    matchesApprovedProposal: boolean;
    errors: string[];
    warnings: string[];
  };

  executionHash?: Sha256Hex;
}
