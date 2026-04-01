/**
 * Phase D — Governance Failure Drills
 *
 * These drills verify that the governance system correctly rejects
 * every category of invalid operation. Each test tampers with one
 * thing and asserts the system catches it.
 */

import { describe, it, expect } from "vitest";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  stampExecutionHash,
  computePolicyHash,
  checkProposalAgainstPolicy,
  evaluateApprovals,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
} from "@capsule/core";
import type {
  GovernancePolicy,
  PayoutProposal,
  PayoutDecisionReceipt,
  PayoutExecutionReceipt,
} from "@capsule/core";

// ── Fixture builders ─────────────────────────────────────────────

const MANIFEST_ID =
  "303dd8bf6f0afe7aa06e48c1fff3f64b97b39e770c8895197c4b0f6f0208fdb4";
const ISSUER = "rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX";
const OPERATOR = "rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh";
const SIGNER_A = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const SIGNER_B = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const OUTSIDER = "rN7n3473SaZBCG4dFL83w7p1W9cgZw6XRR";

function makePolicy(): GovernancePolicy {
  return stampPolicyHash({
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId: MANIFEST_ID,
    network: "testnet",
    treasuryAddress: ISSUER,
    signerPolicy: {
      signers: [
        { address: SIGNER_A, role: "artist", label: "Signer A" },
        { address: SIGNER_B, role: "producer", label: "Signer B" },
      ],
      threshold: 2,
    },
    payoutPolicy: {
      allowedAssets: ["XRP"],
      allowPartialPayouts: false,
      maxOutputsPerProposal: 5,
    },
    createdAt: "2026-04-01T00:00:00.000Z",
    createdBy: "test",
  });
}

function makeProposal(policy: GovernancePolicy): PayoutProposal {
  return stampProposalHash({
    schemaVersion: "1.0.0",
    kind: "payout-proposal",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: "payout-001",
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    createdAt: "2026-04-01T01:00:00.000Z",
    createdBy: "test",
    outputs: [
      { address: OPERATOR, amount: "50.0", asset: "XRP", role: "producer", reason: "Production fee" },
    ],
  });
}

function makeApprovals() {
  return [
    { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z" },
    { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-04-01T02:01:00.000Z" },
  ];
}

function makeDecision(
  policy: GovernancePolicy,
  proposal: PayoutProposal
): PayoutDecisionReceipt {
  return stampDecisionHash({
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    approvals: makeApprovals(),
    decision: {
      outcome: "approved",
      thresholdMet: true,
      approvedCount: 2,
      rejectedCount: 0,
    },
    decidedAt: "2026-04-01T03:00:00.000Z",
    decidedBy: "test",
  });
}

function makeExecution(
  policy: GovernancePolicy,
  proposal: PayoutProposal,
  decision: PayoutDecisionReceipt
): PayoutExecutionReceipt {
  return stampExecutionHash({
    schemaVersion: "1.0.0",
    kind: "payout-execution-receipt",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    decisionHash: decision.decisionHash!,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    executedAt: "2026-04-01T04:00:00.000Z",
    executedBy: "test",
    xrpl: { txHashes: ["AABBCCDD11223344AABBCCDD11223344AABBCCDD11223344AABBCCDD11223344"] },
    executedOutputs: [
      { address: OPERATOR, amount: "50.0", asset: "XRP", role: "producer", reason: "Production fee" },
    ],
    verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
  });
}

// ── Failure Drills ───────────────────────────────────────────────

describe("Phase D Governance Failure Drills", () => {
  // ── Policy invariants ──

  it("rejects threshold exceeding signer count", () => {
    const raw = {
      ...makePolicy(),
      policyHash: undefined,
      signerPolicy: {
        signers: [{ address: SIGNER_A, role: "artist" as const }],
        threshold: 3,
      },
    };
    expect(() => assertGovernancePolicy(raw)).toThrow("Threshold (3) exceeds signer count (1)");
  });

  it("rejects duplicate signer addresses", () => {
    const raw = {
      ...makePolicy(),
      policyHash: undefined,
      signerPolicy: {
        signers: [
          { address: SIGNER_A, role: "artist" as const },
          { address: SIGNER_A, role: "producer" as const },
        ],
        threshold: 1,
      },
    };
    expect(() => assertGovernancePolicy(raw)).toThrow("Signer addresses must be unique");
  });

  // ── Proposal vs Policy ──

  it("rejects proposal with wrong manifestId", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.manifestId = "0".repeat(64);
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Proposal manifestId does not match policy");
  });

  it("rejects proposal with wrong treasury", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.treasuryAddress = OUTSIDER;
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Proposal treasuryAddress does not match policy");
  });

  it("rejects proposal with disallowed asset", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.outputs[0].asset = "USD";
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"USD"'))).toBe(true);
  });

  it("rejects proposal exceeding max outputs", () => {
    const policy = makePolicy();
    policy.payoutPolicy.maxOutputsPerProposal = 1;
    // Re-stamp after mutation
    const rePolicy = stampPolicyHash({ ...policy, policyHash: undefined });
    const proposal = makeProposal(rePolicy);
    proposal.outputs.push(
      { address: SIGNER_A, amount: "10.0", asset: "XRP", role: "artist", reason: "Bonus" }
    );
    proposal.policyHash = rePolicy.policyHash!;
    const result = checkProposalAgainstPolicy(proposal, rePolicy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("outputs"))).toBe(true);
  });

  it("rejects proposal with stale policyHash", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.policyHash = "f".repeat(64); // tampered
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Proposal policyHash does not match policy");
  });

  it("rejects proposal with wrong network", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.network = "mainnet";
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Proposal network does not match policy");
  });

  // ── Approval evaluation ──

  it("rejects signer not in policy", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const approvals = [
      { signerAddress: OUTSIDER, approved: true, decidedAt: "2026-04-01T02:00:00.000Z" },
    ];
    const result = evaluateApprovals(proposal, policy, approvals);
    expect(result.errors.some((e) => e.includes(OUTSIDER))).toBe(true);
    expect(result.outcome).toBe("rejected");
  });

  it("threshold not met with only 1 of 2 approvals", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const approvals = [
      { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z" },
    ];
    const result = evaluateApprovals(proposal, policy, approvals);
    expect(result.thresholdMet).toBe(false);
    expect(result.outcome).toBe("rejected");
  });

  it("deduplicates same signer voting twice", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const approvals = [
      { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z" },
      { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:01:00.000Z" },
      { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-04-01T02:02:00.000Z" },
    ];
    const result = evaluateApprovals(proposal, policy, approvals);
    expect(result.approvedCount).toBe(2); // not 3
    expect(result.thresholdMet).toBe(true);
  });

  // ── Decision vs Proposal ──

  it("rejects decision with wrong proposalHash", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.proposalHash = "0".repeat(64);
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Decision proposalHash does not match proposal");
  });

  it("rejects decision with bogus approvedCount", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.decision.approvedCount = 99;
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("approvedCount"))).toBe(true);
  });

  it("rejects decision claiming approved but threshold not met", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    // Only 1 approval, but claim approved
    decision.approvals = [
      { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z" },
    ];
    decision.decision = { outcome: "approved", thresholdMet: true, approvedCount: 1, rejectedCount: 0 };
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ThresholdMet") || e.includes("threshold"))).toBe(true);
  });

  // ── Execution vs Decision ──

  it("rejects execution of unapproved proposal", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.decision.outcome = "rejected";
    const execution = makeExecution(policy, proposal, decision);
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Cannot execute an unapproved proposal");
  });

  it("rejects execution with wrong decisionHash", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.decisionHash = "0".repeat(64);
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Execution decisionHash does not match decision");
  });

  it("rejects execution with wrong amount", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.executedOutputs[0].amount = "999.0"; // wrong amount
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("amount mismatch"))).toBe(true);
  });

  it("rejects execution with wrong address", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.executedOutputs[0].address = OUTSIDER;
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("address mismatch"))).toBe(true);
  });

  it("rejects execution with wrong network", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.network = "mainnet";
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Execution network does not match policy");
  });

  it("rejects execution with wrong treasury", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.treasuryAddress = OUTSIDER;
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Execution treasuryAddress does not match policy");
  });

  // ── Hash tamper detection ──

  it("detects tampered policy hash", () => {
    const policy = makePolicy();
    const recomputed = computePolicyHash(policy);
    expect(policy.policyHash).toBe(recomputed);

    // Mutate and re-check
    const tampered = { ...policy, treasuryAddress: OUTSIDER };
    const newHash = computePolicyHash(tampered);
    expect(newHash).not.toBe(policy.policyHash);
  });
});
