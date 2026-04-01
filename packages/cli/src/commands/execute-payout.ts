/**
 * CLI command: execute-payout
 *
 * Records a payout execution against a decision, verifies the full
 * hash chain, and emits a stamped execution receipt.
 *
 * Note: actual XRPL Payment submissions are out of scope for Phase D MVP.
 * This command records and verifies the execution receipt — the tx hashes
 * come from real ledger submissions done externally or in a later phase.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  assertPayoutDecision,
  stampExecutionHash,
  checkExecutionAgainstDecision,
} from "@capsule/core";
import type {
  PayoutExecutionReceipt,
  ExecutedPayoutOutput,
} from "@capsule/core";

export interface ExecutePayoutOpts {
  policyPath: string;
  proposalPath: string;
  decisionPath: string;
  txHashes: string[];
  ledgerIndexes?: number[];
  executedOutputs: ExecutedPayoutOutput[];
  executedBy: string;
  outputPath: string;
}

export async function executePayout(
  opts: ExecutePayoutOpts
): Promise<PayoutExecutionReceipt> {
  const policy = assertGovernancePolicy(
    JSON.parse(await readFile(opts.policyPath, "utf-8"))
  );
  const proposal = assertPayoutProposal(
    JSON.parse(await readFile(opts.proposalPath, "utf-8"))
  );
  const decision = assertPayoutDecision(
    JSON.parse(await readFile(opts.decisionPath, "utf-8"))
  );

  if (decision.decision.outcome !== "approved") {
    throw new Error("Cannot execute: proposal was not approved");
  }

  const raw: PayoutExecutionReceipt = {
    schemaVersion: "1.0.0",
    kind: "payout-execution-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    decisionHash: decision.decisionHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    executedAt: new Date().toISOString(),
    executedBy: opts.executedBy,
    xrpl: {
      txHashes: opts.txHashes,
      ...(opts.ledgerIndexes && { ledgerIndexes: opts.ledgerIndexes }),
    },
    executedOutputs: opts.executedOutputs,
    verification: {
      matchesApprovedProposal: true,
      errors: [],
      warnings: [],
    },
  };

  // Verify the full hash chain
  const check = checkExecutionAgainstDecision(raw, decision, proposal, policy);
  if (!check.valid) {
    raw.verification = {
      matchesApprovedProposal: false,
      errors: check.errors,
      warnings: [],
    };
    throw new Error(
      `Execution violates hash chain:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  const stamped = stampExecutionHash(raw);
  await writeFile(opts.outputPath, JSON.stringify(stamped, null, 2) + "\n");
  return stamped;
}
