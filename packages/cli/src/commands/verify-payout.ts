/**
 * CLI command: verify-payout
 *
 * Loads all 4 governance artifacts, recomputes every hash,
 * and runs every cross-contract check. Reports pass/fail.
 */

import { readFile } from "node:fs/promises";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  assertPayoutDecision,
  assertPayoutExecution,
  computePolicyHash,
  computeProposalHash,
  computeDecisionHash,
  computeExecutionHash,
  checkProposalAgainstPolicy,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
} from "@capsule/core";

export interface VerifyPayoutOpts {
  policyPath: string;
  proposalPath: string;
  decisionPath: string;
  executionPath: string;
}

interface VerifyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyPayoutResult {
  passed: boolean;
  checks: VerifyCheck[];
}

export async function verifyPayout(
  opts: VerifyPayoutOpts
): Promise<VerifyPayoutResult> {
  const checks: VerifyCheck[] = [];

  // Load + schema-validate all 4 artifacts
  const policy = assertGovernancePolicy(
    JSON.parse(await readFile(opts.policyPath, "utf-8"))
  );
  checks.push({ name: "Policy schema", passed: true, detail: "Valid GovernancePolicy" });

  const proposal = assertPayoutProposal(
    JSON.parse(await readFile(opts.proposalPath, "utf-8"))
  );
  checks.push({ name: "Proposal schema", passed: true, detail: "Valid PayoutProposal" });

  const decision = assertPayoutDecision(
    JSON.parse(await readFile(opts.decisionPath, "utf-8"))
  );
  checks.push({ name: "Decision schema", passed: true, detail: "Valid PayoutDecisionReceipt" });

  const execution = assertPayoutExecution(
    JSON.parse(await readFile(opts.executionPath, "utf-8"))
  );
  checks.push({ name: "Execution schema", passed: true, detail: "Valid PayoutExecutionReceipt" });

  // Hash integrity
  const policyHashOk = policy.policyHash === computePolicyHash(policy);
  checks.push({
    name: "Policy hash",
    passed: policyHashOk,
    detail: policyHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const proposalHashOk = proposal.proposalHash === computeProposalHash(proposal);
  checks.push({
    name: "Proposal hash",
    passed: proposalHashOk,
    detail: proposalHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const decisionHashOk = decision.decisionHash === computeDecisionHash(decision);
  checks.push({
    name: "Decision hash",
    passed: decisionHashOk,
    detail: decisionHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const executionHashOk = execution.executionHash === computeExecutionHash(execution);
  checks.push({
    name: "Execution hash",
    passed: executionHashOk,
    detail: executionHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  // Cross-contract checks
  const proposalVsPolicy = checkProposalAgainstPolicy(proposal, policy);
  checks.push({
    name: "Proposal ↔ Policy",
    passed: proposalVsPolicy.valid,
    detail: proposalVsPolicy.valid
      ? "Consistent"
      : proposalVsPolicy.errors.join("; "),
  });

  const decisionVsProposal = checkDecisionAgainstProposal(decision, proposal, policy);
  checks.push({
    name: "Decision ↔ Proposal",
    passed: decisionVsProposal.valid,
    detail: decisionVsProposal.valid
      ? "Consistent"
      : decisionVsProposal.errors.join("; "),
  });

  const executionVsDecision = checkExecutionAgainstDecision(
    execution, decision, proposal, policy
  );
  checks.push({
    name: "Execution ↔ Decision",
    passed: executionVsDecision.valid,
    detail: executionVsDecision.valid
      ? "Consistent"
      : executionVsDecision.errors.join("; "),
  });

  // Outcome check
  const outcomeOk = decision.decision.outcome === "approved";
  checks.push({
    name: "Decision outcome",
    passed: outcomeOk,
    detail: outcomeOk ? "Approved" : `Outcome: ${decision.decision.outcome}`,
  });

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}
