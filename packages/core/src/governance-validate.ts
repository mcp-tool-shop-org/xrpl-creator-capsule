/**
 * Governance validation — schema validation, structural invariants,
 * cross-contract relationship rules, and hash computation for all
 * four governance contracts.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { sortKeysDeep } from "./hash.js";

import { governancePolicySchema } from "./governance-policy-schema.js";
import { payoutProposalSchema } from "./payout-proposal-schema.js";
import { payoutDecisionReceiptSchema } from "./payout-decision-schema.js";
import { payoutExecutionReceiptSchema } from "./payout-execution-schema.js";

import type { GovernancePolicy } from "./governance-policy.js";
import type { PayoutProposal } from "./payout-proposal.js";
import type { PayoutDecisionReceipt } from "./payout-decision.js";
import type { PayoutExecutionReceipt } from "./payout-execution.js";
import type { ValidationResult } from "./validate.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validatePolicySchema = ajv.compile<GovernancePolicy>(governancePolicySchema);
const validateProposalSchema = ajv.compile<PayoutProposal>(payoutProposalSchema);
const validateDecisionSchema = ajv.compile<PayoutDecisionReceipt>(payoutDecisionReceiptSchema);
const validateExecutionSchema = ajv.compile<PayoutExecutionReceipt>(payoutExecutionReceiptSchema);

function schemaResult(validator: { errors?: Array<{ instancePath: string; message?: string }> | null }, valid: boolean): ValidationResult {
  if (valid) return { valid: true, errors: [] };
  const errors = (validator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

// ── Hash computation ──────────────────────────────────────────────

function computeHash(obj: Record<string, unknown>, excludeField: string): string {
  const { [excludeField]: _excluded, ...rest } = obj;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHash("sha256").update(canonical).digest("hex");
}

export function computePolicyHash(policy: GovernancePolicy): string {
  return computeHash(policy as unknown as Record<string, unknown>, "policyHash");
}

export function stampPolicyHash(policy: GovernancePolicy): GovernancePolicy {
  return { ...policy, policyHash: computePolicyHash(policy) };
}

export function computeProposalHash(proposal: PayoutProposal): string {
  return computeHash(proposal as unknown as Record<string, unknown>, "proposalHash");
}

export function stampProposalHash(proposal: PayoutProposal): PayoutProposal {
  return { ...proposal, proposalHash: computeProposalHash(proposal) };
}

export function computeDecisionHash(decision: PayoutDecisionReceipt): string {
  return computeHash(decision as unknown as Record<string, unknown>, "decisionHash");
}

export function stampDecisionHash(decision: PayoutDecisionReceipt): PayoutDecisionReceipt {
  return { ...decision, decisionHash: computeDecisionHash(decision) };
}

export function computeExecutionHash(execution: PayoutExecutionReceipt): string {
  return computeHash(execution as unknown as Record<string, unknown>, "executionHash");
}

export function stampExecutionHash(execution: PayoutExecutionReceipt): PayoutExecutionReceipt {
  return { ...execution, executionHash: computeExecutionHash(execution) };
}

// ── Schema validation ─────────────────────────────────────────────

export function validateGovernancePolicy(policy: unknown): ValidationResult {
  return schemaResult(validatePolicySchema, validatePolicySchema(policy));
}

export function validatePayoutProposal(proposal: unknown): ValidationResult {
  return schemaResult(validateProposalSchema, validateProposalSchema(proposal));
}

export function validatePayoutDecision(decision: unknown): ValidationResult {
  return schemaResult(validateDecisionSchema, validateDecisionSchema(decision));
}

export function validatePayoutExecution(execution: unknown): ValidationResult {
  return schemaResult(validateExecutionSchema, validateExecutionSchema(execution));
}

// ── Structural invariants ─────────────────────────────────────────

export function assertGovernancePolicy(raw: unknown): GovernancePolicy {
  const result = validateGovernancePolicy(raw);
  if (!result.valid) {
    throw new Error(`Invalid GovernancePolicy:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const policy = raw as GovernancePolicy;
  const errors: string[] = [];

  if (policy.signerPolicy.threshold > policy.signerPolicy.signers.length) {
    errors.push(`Threshold (${policy.signerPolicy.threshold}) exceeds signer count (${policy.signerPolicy.signers.length})`);
  }

  const addresses = policy.signerPolicy.signers.map((s) => s.address);
  if (new Set(addresses).size !== addresses.length) {
    errors.push("Signer addresses must be unique");
  }

  if (errors.length > 0) {
    throw new Error(`GovernancePolicy invariant violation:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return policy;
}

export function assertPayoutProposal(raw: unknown): PayoutProposal {
  const result = validatePayoutProposal(raw);
  if (!result.valid) {
    throw new Error(`Invalid PayoutProposal:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const proposal = raw as PayoutProposal;
  const errors: string[] = [];

  for (const output of proposal.outputs) {
    const amount = parseFloat(output.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Output to ${output.address}: amount must be positive, got "${output.amount}"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`PayoutProposal invariant violation:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return proposal;
}

export function assertPayoutDecision(raw: unknown): PayoutDecisionReceipt {
  const result = validatePayoutDecision(raw);
  if (!result.valid) {
    throw new Error(`Invalid PayoutDecisionReceipt:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return raw as PayoutDecisionReceipt;
}

export function assertPayoutExecution(raw: unknown): PayoutExecutionReceipt {
  const result = validatePayoutExecution(raw);
  if (!result.valid) {
    throw new Error(`Invalid PayoutExecutionReceipt:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return raw as PayoutExecutionReceipt;
}

// ── Cross-contract relationship validation ────────────────────────

export interface GovernanceCheckResult {
  valid: boolean;
  errors: string[];
}

/** Validate that a proposal is consistent with its governance policy. */
export function checkProposalAgainstPolicy(
  proposal: PayoutProposal,
  policy: GovernancePolicy
): GovernanceCheckResult {
  const errors: string[] = [];

  if (proposal.manifestId !== policy.manifestId) {
    errors.push("Proposal manifestId does not match policy");
  }
  if (proposal.network !== policy.network) {
    errors.push("Proposal network does not match policy");
  }
  if (proposal.treasuryAddress !== policy.treasuryAddress) {
    errors.push("Proposal treasuryAddress does not match policy");
  }

  const expectedPolicyHash = policy.policyHash ?? computePolicyHash(policy);
  if (proposal.policyHash !== expectedPolicyHash) {
    errors.push("Proposal policyHash does not match policy");
  }

  const allowedAssets = new Set(policy.payoutPolicy.allowedAssets);
  for (const output of proposal.outputs) {
    if (!allowedAssets.has(output.asset)) {
      errors.push(`Output asset "${output.asset}" is not in policy allowedAssets`);
    }
  }

  if (
    policy.payoutPolicy.maxOutputsPerProposal &&
    proposal.outputs.length > policy.payoutPolicy.maxOutputsPerProposal
  ) {
    errors.push(
      `Proposal has ${proposal.outputs.length} outputs, policy allows max ${policy.payoutPolicy.maxOutputsPerProposal}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/** Evaluate approvals and produce a decision. */
export function evaluateApprovals(
  proposal: PayoutProposal,
  policy: GovernancePolicy,
  approvals: Array<{ signerAddress: string; approved: boolean; decidedAt: string; note?: string }>
): { outcome: "approved" | "rejected"; thresholdMet: boolean; approvedCount: number; rejectedCount: number; errors: string[] } {
  const errors: string[] = [];
  const policySignerAddresses = new Set(policy.signerPolicy.signers.map((s) => s.address));

  // Deduplicate by signer address (first vote counts)
  const seen = new Set<string>();
  const uniqueApprovals: typeof approvals = [];
  for (const a of approvals) {
    if (seen.has(a.signerAddress)) continue;
    seen.add(a.signerAddress);

    if (!policySignerAddresses.has(a.signerAddress)) {
      errors.push(`Signer ${a.signerAddress} is not in governance policy`);
      continue;
    }
    uniqueApprovals.push(a);
  }

  const approvedCount = uniqueApprovals.filter((a) => a.approved).length;
  const rejectedCount = uniqueApprovals.filter((a) => !a.approved).length;
  const thresholdMet = approvedCount >= policy.signerPolicy.threshold;
  const outcome = thresholdMet ? "approved" : "rejected";

  return { outcome, thresholdMet, approvedCount, rejectedCount, errors };
}

/** Validate that a decision is consistent with proposal and policy. */
export function checkDecisionAgainstProposal(
  decision: PayoutDecisionReceipt,
  proposal: PayoutProposal,
  policy: GovernancePolicy
): GovernanceCheckResult {
  const errors: string[] = [];

  if (decision.proposalId !== proposal.proposalId) {
    errors.push("Decision proposalId does not match proposal");
  }

  const expectedProposalHash = proposal.proposalHash ?? computeProposalHash(proposal);
  if (decision.proposalHash !== expectedProposalHash) {
    errors.push("Decision proposalHash does not match proposal");
  }

  const expectedPolicyHash = policy.policyHash ?? computePolicyHash(policy);
  if (decision.policyHash !== expectedPolicyHash) {
    errors.push("Decision policyHash does not match policy");
  }

  // Verify signer legitimacy
  const policySignerAddresses = new Set(policy.signerPolicy.signers.map((s) => s.address));
  for (const approval of decision.approvals) {
    if (!policySignerAddresses.has(approval.signerAddress)) {
      errors.push(`Signer ${approval.signerAddress} is not in governance policy`);
    }
  }

  // Verify threshold computation
  const uniqueApprovers = new Set(
    decision.approvals.filter((a) => a.approved).map((a) => a.signerAddress)
  );
  if (decision.decision.approvedCount !== uniqueApprovers.size) {
    errors.push(
      `Claimed approvedCount (${decision.decision.approvedCount}) does not match unique approvals (${uniqueApprovers.size})`
    );
  }

  const thresholdMet = uniqueApprovers.size >= policy.signerPolicy.threshold;
  if (decision.decision.thresholdMet !== thresholdMet) {
    errors.push("ThresholdMet flag is incorrect");
  }

  if (decision.decision.outcome === "approved" && !thresholdMet) {
    errors.push("Decision is 'approved' but threshold is not met");
  }

  return { valid: errors.length === 0, errors };
}

/** Validate that an execution is consistent with decision and proposal. */
export function checkExecutionAgainstDecision(
  execution: PayoutExecutionReceipt,
  decision: PayoutDecisionReceipt,
  proposal: PayoutProposal,
  policy: GovernancePolicy
): GovernanceCheckResult {
  const errors: string[] = [];

  // Decision must be approved
  if (decision.decision.outcome !== "approved") {
    errors.push("Cannot execute an unapproved proposal");
  }

  // Hash chain
  const expectedDecisionHash = decision.decisionHash ?? computeDecisionHash(decision);
  if (execution.decisionHash !== expectedDecisionHash) {
    errors.push("Execution decisionHash does not match decision");
  }

  const expectedProposalHash = proposal.proposalHash ?? computeProposalHash(proposal);
  if (execution.proposalHash !== expectedProposalHash) {
    errors.push("Execution proposalHash does not match proposal");
  }

  const expectedPolicyHash = policy.policyHash ?? computePolicyHash(policy);
  if (execution.policyHash !== expectedPolicyHash) {
    errors.push("Execution policyHash does not match policy");
  }

  // Identity chain
  if (execution.manifestId !== policy.manifestId) {
    errors.push("Execution manifestId does not match policy");
  }
  if (execution.network !== policy.network) {
    errors.push("Execution network does not match policy");
  }
  if (execution.treasuryAddress !== policy.treasuryAddress) {
    errors.push("Execution treasuryAddress does not match policy");
  }

  // Output reconciliation (if not partial payouts)
  if (!policy.payoutPolicy.allowPartialPayouts) {
    if (execution.executedOutputs.length !== proposal.outputs.length) {
      errors.push(
        `Executed ${execution.executedOutputs.length} outputs, proposal has ${proposal.outputs.length}`
      );
    } else {
      for (let i = 0; i < proposal.outputs.length; i++) {
        const expected = proposal.outputs[i];
        const actual = execution.executedOutputs[i];
        if (actual.address !== expected.address) {
          errors.push(`Output ${i}: address mismatch (expected ${expected.address}, got ${actual.address})`);
        }
        if (actual.amount !== expected.amount) {
          errors.push(`Output ${i}: amount mismatch (expected ${expected.amount}, got ${actual.amount})`);
        }
        if (actual.asset !== expected.asset) {
          errors.push(`Output ${i}: asset mismatch (expected ${expected.asset}, got ${actual.asset})`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
