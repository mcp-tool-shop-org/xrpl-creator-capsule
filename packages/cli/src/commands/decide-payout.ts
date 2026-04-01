/**
 * CLI command: decide-payout
 *
 * Collects signer approvals, evaluates against policy threshold,
 * and emits a stamped decision receipt.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  evaluateApprovals,
  stampDecisionHash,
  checkDecisionAgainstProposal,
} from "@capsule/core";
import type { PayoutDecisionReceipt, GovernanceApproval } from "@capsule/core";

export interface DecidePayoutOpts {
  policyPath: string;
  proposalPath: string;
  approvals: GovernanceApproval[];
  decidedBy: string;
  outputPath: string;
}

export async function decidePayout(
  opts: DecidePayoutOpts
): Promise<PayoutDecisionReceipt> {
  const policy = assertGovernancePolicy(
    JSON.parse(await readFile(opts.policyPath, "utf-8"))
  );
  const proposal = assertPayoutProposal(
    JSON.parse(await readFile(opts.proposalPath, "utf-8"))
  );

  // Evaluate approvals against policy threshold
  const evaluation = evaluateApprovals(proposal, policy, opts.approvals);

  if (evaluation.errors.length > 0) {
    throw new Error(
      `Approval errors:\n${evaluation.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  const raw: PayoutDecisionReceipt = {
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    approvals: opts.approvals,
    decision: {
      outcome: evaluation.outcome,
      thresholdMet: evaluation.thresholdMet,
      approvedCount: evaluation.approvedCount,
      rejectedCount: evaluation.rejectedCount,
    },
    decidedAt: new Date().toISOString(),
    decidedBy: opts.decidedBy,
  };

  // Self-verify the decision against proposal + policy
  const check = checkDecisionAgainstProposal(raw, proposal, policy);
  if (!check.valid) {
    throw new Error(
      `Decision inconsistency:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  const stamped = stampDecisionHash(raw);
  await writeFile(opts.outputPath, JSON.stringify(stamped, null, 2) + "\n");
  return stamped;
}
