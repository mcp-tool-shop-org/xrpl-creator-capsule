/**
 * Payout Proposal — one proposed distribution from the release treasury.
 */

import type { Sha256Hex, XrplAddress, IsoUtc, SignerRole } from "./governance-policy.js";

export interface PayoutOutput {
  address: XrplAddress;
  /** Amount in drops for XRP, or decimal string for tokens */
  amount: string;
  asset: string;
  role: SignerRole;
  reason: string;
}

export interface PayoutProposal {
  schemaVersion: "1.0.0";
  kind: "payout-proposal";

  manifestId: string;
  policyHash: Sha256Hex;
  proposalId: string;

  network: "testnet" | "devnet" | "mainnet";
  treasuryAddress: XrplAddress;

  createdAt: IsoUtc;
  createdBy: string;

  memo?: string;

  outputs: PayoutOutput[];

  proposalHash?: Sha256Hex;
}
