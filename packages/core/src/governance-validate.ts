/**
 * Governance validation — schema validation, structural invariants,
 * cross-contract relationship rules, and hash computation for all
 * four governance contracts.
 */

import { Ajv } from "ajv";
import { addFormats } from "./ajv-formats-interop.js";
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

  // Always recompute from the policy's live content — never trust a
  // self-reported policyHash field, which may be stale if the policy was
  // mutated after stamping without re-stamping (tamper-evidence bypass).
  const expectedPolicyHash = computePolicyHash(policy);
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

  // Always recompute from live content — never trust a self-reported hash
  // field, which may be stale if the upstream object was mutated after
  // stamping without re-stamping (tamper-evidence bypass).
  const expectedProposalHash = computeProposalHash(proposal);
  if (decision.proposalHash !== expectedProposalHash) {
    errors.push("Decision proposalHash does not match proposal");
  }

  const expectedPolicyHash = computePolicyHash(policy);
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

  // Verify threshold computation by re-deriving the approver set with the
  // IDENTICAL dedup rule the canonical evaluator (evaluateApprovals) uses —
  // first vote per signer wins. Re-implementing "any approved:true row for
  // a signer counts" independently (the previous bug) let a decision claim
  // an outcome evaluateApprovals could never have legitimately produced
  // from the same approvals array (e.g. a real reject followed by a forged
  // duplicate approve row).
  const rederived = evaluateApprovals(proposal, policy, decision.approvals);
  if (decision.decision.approvedCount !== rederived.approvedCount) {
    errors.push(
      `Claimed approvedCount (${decision.decision.approvedCount}) does not match re-derived approvals (${rederived.approvedCount})`
    );
  }

  if (decision.decision.rejectedCount !== rederived.rejectedCount) {
    errors.push(
      `Claimed rejectedCount (${decision.decision.rejectedCount}) does not match re-derived approvals (${rederived.rejectedCount})`
    );
  }

  if (decision.decision.thresholdMet !== rederived.thresholdMet) {
    errors.push("ThresholdMet flag is incorrect");
  }

  if (decision.decision.outcome === "approved" && !rederived.thresholdMet) {
    errors.push("Decision is 'approved' but threshold is not met");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Canonical amount-string format for PayoutOutput.amount / ExecutedPayoutOutput.amount:
 * an unsigned integer (XRP drops) or an unsigned decimal string (token
 * amounts). Mirrors the `amount` pattern in payout-proposal-schema.ts and
 * payout-execution-schema.ts.
 */
const AMOUNT_FORMAT = /^[0-9]+(\.[0-9]+)?$/;

/**
 * Compare two governance amount strings exactly, without ever coercing
 * through a float.
 *
 * These amounts are XRP drops (integers by construction) or decimal
 * token-amount strings. parseFloat/Number is unsafe for comparing either:
 * parseFloat of a malformed string ('', 'N/A', a thousands-separated paste
 * like '75,000,000') either yields NaN -- and NaN compared with anything is
 * always false, so a ">" overage guard fails OPEN -- or silently truncates
 * at the first non-numeric character ('75,000,000' -> 75), which can fail
 * open just as badly. A naive `!==` string check has the opposite problem:
 * it fails CLOSED on merely-differently-formatted-but-equal values (e.g.
 * '75000000' vs '075000000', or '1.50' vs '1.5').
 *
 * This validates format BEFORE any arithmetic, unconditionally -- it does
 * not trust that a caller already ran schema validation (execute-payout.ts
 * does not, today, before calling checkExecutionAgainstDecision), so the
 * gate holds even if a future caller again forgets to schema-validate first.
 *
 * Returns `{ ok: true, cmp }` with cmp negative/zero/positive as `actual` is
 * less than/equal to/greater than `expected` (exact comparison via BigInt
 * over zero-padded fractional digits -- never a float), or
 * `{ ok: false, error }` naming exactly which side was malformed.
 */
function compareAmounts(
  actual: string,
  expected: string
): { ok: true; cmp: number } | { ok: false; error: string } {
  if (!AMOUNT_FORMAT.test(actual)) {
    return {
      ok: false,
      error: `actual amount "${actual}" is not a valid amount string (expected an unsigned integer or decimal matching ^[0-9]+(\\.[0-9]+)?$)`,
    };
  }
  if (!AMOUNT_FORMAT.test(expected)) {
    return {
      ok: false,
      error: `expected amount "${expected}" is not a valid amount string (expected an unsigned integer or decimal matching ^[0-9]+(\\.[0-9]+)?$)`,
    };
  }

  const [actualInt, actualFrac = ""] = actual.split(".");
  const [expectedInt, expectedFrac = ""] = expected.split(".");
  const fracLen = Math.max(actualFrac.length, expectedFrac.length);
  const actualValue = BigInt(actualInt + actualFrac.padEnd(fracLen, "0"));
  const expectedValue = BigInt(expectedInt + expectedFrac.padEnd(fracLen, "0"));

  if (actualValue < expectedValue) return { ok: true, cmp: -1 };
  if (actualValue > expectedValue) return { ok: true, cmp: 1 };
  return { ok: true, cmp: 0 };
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

  // Hash chain — always recompute from live content — never trust a
  // self-reported hash field, which may be stale if the upstream object was
  // mutated after stamping without re-stamping (tamper-evidence bypass).
  const expectedDecisionHash = computeDecisionHash(decision);
  if (execution.decisionHash !== expectedDecisionHash) {
    errors.push("Execution decisionHash does not match decision");
  }

  const expectedProposalHash = computeProposalHash(proposal);
  if (execution.proposalHash !== expectedProposalHash) {
    errors.push("Execution proposalHash does not match proposal");
  }

  const expectedPolicyHash = computePolicyHash(policy);
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

  // Output reconciliation
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
        const amountCheck = compareAmounts(actual.amount, expected.amount);
        if (!amountCheck.ok) {
          errors.push(`Output ${i}: ${amountCheck.error}`);
        } else if (amountCheck.cmp !== 0) {
          errors.push(`Output ${i}: amount mismatch (expected ${expected.amount}, got ${actual.amount})`);
        }
        if (actual.asset !== expected.asset) {
          errors.push(`Output ${i}: asset mismatch (expected ${expected.asset}, got ${actual.asset})`);
        }
      }
    }
  } else {
    // Partial payouts are allowed, but every executed output must still be
    // authorized by the proposal: it must match an approved address+asset
    // pair, and its amount must not exceed the amount proposed for that
    // pair. Each proposal output can back at most one executed output (it
    // is consumed from `remaining` on match), so replaying the same
    // proposal output against multiple executed outputs cannot be used to
    // exceed what governance actually approved.
    const remaining = proposal.outputs.map((o) => ({ ...o }));
    for (let i = 0; i < execution.executedOutputs.length; i++) {
      const actual = execution.executedOutputs[i];
      const matchIndex = remaining.findIndex(
        (o) => o.address === actual.address && o.asset === actual.asset
      );
      if (matchIndex === -1) {
        errors.push(
          `Executed output ${i}: address/asset pair (${actual.address}, ${actual.asset}) is not in the approved proposal`
        );
        continue;
      }
      const expected = remaining[matchIndex];
      const amountCheck = compareAmounts(actual.amount, expected.amount);
      if (!amountCheck.ok) {
        errors.push(`Executed output ${i}: ${amountCheck.error}`);
      } else if (amountCheck.cmp > 0) {
        errors.push(
          `Executed output ${i}: amount ${actual.amount} exceeds proposed amount ${expected.amount} for ${actual.address}`
        );
      }
      // Consume this proposal output so it cannot authorize a second payment.
      remaining.splice(matchIndex, 1);
    }
  }

  return { valid: errors.length === 0, errors };
}
