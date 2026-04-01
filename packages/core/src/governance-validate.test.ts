import { describe, it, expect } from "vitest";
import type { GovernancePolicy } from "./governance-policy.js";
import type { PayoutProposal } from "./payout-proposal.js";
import type { PayoutDecisionReceipt } from "./payout-decision.js";
import type { PayoutExecutionReceipt } from "./payout-execution.js";
import {
  validateGovernancePolicy,
  validatePayoutProposal,
  validatePayoutDecision,
  validatePayoutExecution,
  assertGovernancePolicy,
  assertPayoutProposal,
  computePolicyHash,
  stampPolicyHash,
  computeProposalHash,
  stampProposalHash,
  computeDecisionHash,
  stampDecisionHash,
  computeExecutionHash,
  stampExecutionHash,
  checkProposalAgainstPolicy,
  evaluateApprovals,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
} from "./governance-validate.js";

const MANIFEST_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const TREASURY = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const ARTIST = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const PRODUCER = "rBHMbioz9znTCqgjZ6Nx43uWY43kToEPa9";

function makePolicy(): GovernancePolicy {
  return stampPolicyHash({
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId: MANIFEST_ID,
    network: "testnet",
    treasuryAddress: TREASURY,
    signerPolicy: {
      signers: [
        { address: ARTIST, role: "artist", label: "Lead Artist" },
        { address: PRODUCER, role: "producer", label: "Producer" },
      ],
      threshold: 2,
    },
    payoutPolicy: {
      allowedAssets: ["XRP"],
      allowPartialPayouts: false,
      maxOutputsPerProposal: 5,
    },
    createdAt: "2026-04-01T18:00:00Z",
    createdBy: "capsule create-governance-policy",
  });
}

function makeProposal(policy: GovernancePolicy): PayoutProposal {
  return stampProposalHash({
    schemaVersion: "1.0.0",
    kind: "payout-proposal",
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: "payout_001",
    network: "testnet",
    treasuryAddress: TREASURY,
    createdAt: "2026-04-01T18:05:00Z",
    createdBy: "capsule propose-payout",
    memo: "Initial collaborator distribution",
    outputs: [
      { address: ARTIST, amount: "75000000", asset: "XRP", role: "artist", reason: "Primary artist share" },
      { address: PRODUCER, amount: "25000000", asset: "XRP", role: "producer", reason: "Producer share" },
    ],
  });
}

function makeDecision(policy: GovernancePolicy, proposal: PayoutProposal): PayoutDecisionReceipt {
  return stampDecisionHash({
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: "testnet",
    treasuryAddress: TREASURY,
    approvals: [
      { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" },
      { signerAddress: PRODUCER, approved: true, decidedAt: "2026-04-01T18:11:00Z" },
    ],
    decision: { outcome: "approved", thresholdMet: true, approvedCount: 2, rejectedCount: 0 },
    decidedAt: "2026-04-01T18:11:00Z",
    decidedBy: "capsule decide-payout",
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
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    decisionHash: decision.decisionHash!,
    network: "testnet",
    treasuryAddress: TREASURY,
    executedAt: "2026-04-01T18:15:00Z",
    executedBy: "capsule execute-payout",
    xrpl: { txHashes: ["ABCDEF1234567890"] },
    executedOutputs: [
      { address: ARTIST, amount: "75000000", asset: "XRP", role: "artist", reason: "Primary artist share" },
      { address: PRODUCER, amount: "25000000", asset: "XRP", role: "producer", reason: "Producer share" },
    ],
    verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
  });
}

// ── GovernancePolicy ──────────────────────────────────────────────

describe("GovernancePolicy", () => {
  it("validates a correct policy", () => {
    expect(validateGovernancePolicy(makePolicy()).valid).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(validateGovernancePolicy({}).valid).toBe(false);
  });

  it("rejects threshold > signers", () => {
    const p = makePolicy();
    p.signerPolicy.threshold = 5;
    expect(() => assertGovernancePolicy(p)).toThrow("exceeds signer count");
  });

  it("rejects duplicate signer addresses", () => {
    const p = makePolicy();
    p.signerPolicy.signers[1].address = ARTIST; // duplicate
    expect(() => assertGovernancePolicy(p)).toThrow("unique");
  });

  it("hash is deterministic", () => {
    const p = makePolicy();
    expect(computePolicyHash(p)).toBe(computePolicyHash(p));
  });

  it("hash changes when content changes", () => {
    const p1 = makePolicy();
    const p2 = { ...makePolicy(), treasuryAddress: ARTIST };
    expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
  });

  it("hash covers nested signer fields", () => {
    const p1 = makePolicy();
    const p2 = makePolicy();
    p2.signerPolicy.signers[0].label = "Changed";
    expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
  });
});

// ── PayoutProposal ────────────────────────────────────────────────

describe("PayoutProposal", () => {
  it("validates a correct proposal", () => {
    const policy = makePolicy();
    expect(validatePayoutProposal(makeProposal(policy)).valid).toBe(true);
  });

  it("rejects empty outputs", () => {
    const policy = makePolicy();
    const p = { ...makeProposal(policy), outputs: [] };
    expect(validatePayoutProposal(p).valid).toBe(false);
  });

  it("rejects zero amount", () => {
    const policy = makePolicy();
    const p = makeProposal(policy);
    p.outputs[0].amount = "0";
    expect(() => assertPayoutProposal(p)).toThrow("positive");
  });

  it("hash is deterministic and self-consistent", () => {
    const policy = makePolicy();
    const p = makeProposal(policy);
    expect(p.proposalHash).toBe(computeProposalHash(p));
  });
});

// ── Proposal-Policy relationship ──────────────────────────────────

describe("checkProposalAgainstPolicy", () => {
  it("passes for matching proposal and policy", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    expect(checkProposalAgainstPolicy(proposal, policy).valid).toBe(true);
  });

  it("rejects wrong treasury", () => {
    const policy = makePolicy();
    const proposal = { ...makeProposal(policy), treasuryAddress: ARTIST };
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("treasuryAddress"))).toBe(true);
  });

  it("rejects wrong network", () => {
    const policy = makePolicy();
    const proposal = { ...makeProposal(policy), network: "mainnet" as const };
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
  });

  it("rejects disallowed asset", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    proposal.outputs[0].asset = "USD";
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("allowedAssets"))).toBe(true);
  });

  it("rejects too many outputs", () => {
    const policy = makePolicy();
    policy.payoutPolicy.maxOutputsPerProposal = 1;
    const proposal = makeProposal(policy);
    // proposal has 2 outputs, policy allows 1
    // Need to re-stamp policy hash since we changed it
    const restamped = stampPolicyHash(policy);
    proposal.policyHash = restamped.policyHash!;
    const result = checkProposalAgainstPolicy(proposal, restamped);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("outputs"))).toBe(true);
  });

  it("rejects wrong policyHash", () => {
    const policy = makePolicy();
    const proposal = { ...makeProposal(policy), policyHash: "0".repeat(64) };
    const result = checkProposalAgainstPolicy(proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("policyHash"))).toBe(true);
  });
});

// ── Approval evaluation ───────────────────────────────────────────

describe("evaluateApprovals", () => {
  it("approves when threshold met", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const result = evaluateApprovals(proposal, policy, [
      { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" },
      { signerAddress: PRODUCER, approved: true, decidedAt: "2026-04-01T18:11:00Z" },
    ]);
    expect(result.outcome).toBe("approved");
    expect(result.thresholdMet).toBe(true);
    expect(result.approvedCount).toBe(2);
  });

  it("rejects when threshold not met", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const result = evaluateApprovals(proposal, policy, [
      { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" },
      { signerAddress: PRODUCER, approved: false, decidedAt: "2026-04-01T18:11:00Z" },
    ]);
    expect(result.outcome).toBe("rejected");
    expect(result.thresholdMet).toBe(false);
    expect(result.approvedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
  });

  it("ignores duplicate signer (first vote counts)", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const result = evaluateApprovals(proposal, policy, [
      { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" },
      { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:01Z" },
    ]);
    expect(result.approvedCount).toBe(1);
    expect(result.thresholdMet).toBe(false);
  });

  it("rejects unknown signer", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const result = evaluateApprovals(proposal, policy, [
      { signerAddress: "r3kmLJN5D28dHuH8vZNUcopvoB9UnaFTdn", approved: true, decidedAt: "2026-04-01T18:10:00Z" },
    ]);
    expect(result.errors.some((e) => e.includes("not in governance policy"))).toBe(true);
    expect(result.approvedCount).toBe(0);
  });
});

// ── Decision-Proposal relationship ────────────────────────────────

describe("checkDecisionAgainstProposal", () => {
  it("passes for correct decision chain", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    expect(checkDecisionAgainstProposal(decision, proposal, policy).valid).toBe(true);
  });

  it("rejects wrong proposalHash", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = { ...makeDecision(policy, proposal), proposalHash: "0".repeat(64) };
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
  });

  it("rejects unknown signer in approvals", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.approvals[0].signerAddress = "r3kmLJN5D28dHuH8vZNUcopvoB9UnaFTdn";
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not in governance policy"))).toBe(true);
  });

  it("rejects incorrect approvedCount", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.decision.approvedCount = 99;
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("approvedCount"))).toBe(true);
  });

  it("rejects approved outcome when threshold not met", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.approvals = [{ signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" }];
    decision.decision = { outcome: "approved", thresholdMet: true, approvedCount: 1, rejectedCount: 0 };
    const result = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(result.valid).toBe(false);
  });
});

// ── Execution-Decision relationship ───────────────────────────────

describe("checkExecutionAgainstDecision", () => {
  it("passes for correct execution chain", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    expect(checkExecutionAgainstDecision(execution, decision, proposal, policy).valid).toBe(true);
  });

  it("rejects unapproved proposal execution", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    decision.decision.outcome = "rejected";
    const execution = makeExecution(policy, proposal, decision);
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unapproved"))).toBe(true);
  });

  it("rejects wrong decisionHash", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = { ...makeExecution(policy, proposal, decision), decisionHash: "0".repeat(64) };
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong output amount", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.executedOutputs[0].amount = "99999999";
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("amount mismatch"))).toBe(true);
  });

  it("rejects wrong output address", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.executedOutputs[0].address = "r3kmLJN5D28dHuH8vZNUcopvoB9UnaFTdn";
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("address mismatch"))).toBe(true);
  });

  it("rejects wrong output count", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = makeExecution(policy, proposal, decision);
    execution.executedOutputs = [execution.executedOutputs[0]];
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("outputs"))).toBe(true);
  });

  it("rejects wrong treasury", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = { ...makeExecution(policy, proposal, decision), treasuryAddress: ARTIST };
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("treasuryAddress"))).toBe(true);
  });

  it("rejects wrong network", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const execution = { ...makeExecution(policy, proposal, decision), network: "mainnet" as const };
    const result = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(result.valid).toBe(false);
  });
});

// ── Hash integrity ────────────────────────────────────────────────

describe("Hash integrity", () => {
  it("policy hash is self-consistent", () => {
    const p = makePolicy();
    expect(p.policyHash).toBe(computePolicyHash(p));
  });

  it("proposal hash is self-consistent", () => {
    const policy = makePolicy();
    const p = makeProposal(policy);
    expect(p.proposalHash).toBe(computeProposalHash(p));
  });

  it("decision hash is self-consistent", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const d = makeDecision(policy, proposal);
    expect(d.decisionHash).toBe(computeDecisionHash(d));
  });

  it("execution hash is self-consistent", () => {
    const policy = makePolicy();
    const proposal = makeProposal(policy);
    const decision = makeDecision(policy, proposal);
    const e = makeExecution(policy, proposal, decision);
    expect(e.executionHash).toBe(computeExecutionHash(e));
  });
});
