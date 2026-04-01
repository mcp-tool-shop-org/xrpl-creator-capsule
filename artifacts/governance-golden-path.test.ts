/**
 * Phase D — Governance Golden Path
 *
 * Exercises the full governance chain using real Testnet fixture data:
 * Policy → Proposal → Decision → Execution → Verify
 *
 * This proves the governance system works end-to-end with
 * real manifest/receipt addresses from the live Testnet proof.
 */

import { describe, it, expect } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  assertManifest,
  computeManifestId,
  assertGovernancePolicy,
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  stampExecutionHash,
  computePolicyHash,
  computeProposalHash,
  computeDecisionHash,
  computeExecutionHash,
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

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");
const OUTPUT_DIR = join(import.meta.dirname, "..", "artifacts", "direct-rail");

// Real addresses from Testnet proof
const ISSUER = "rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX";
const OPERATOR = "rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh";
const SIGNER_A = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"; // simulated signer (artist)
const SIGNER_B = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"; // simulated signer (producer)

describe("Phase D Governance Golden Path", () => {
  let manifestId: string;
  let policy: GovernancePolicy;
  let proposal: PayoutProposal;
  let decision: PayoutDecisionReceipt;
  let execution: PayoutExecutionReceipt;

  it("loads manifest and computes manifestId", async () => {
    const raw = JSON.parse(await readFile(join(FIXTURE_DIR, "direct-rail-manifest.json"), "utf-8"));
    const manifest = assertManifest(raw);
    manifestId = computeManifestId(manifest);
    expect(manifestId).toBe("303dd8bf6f0afe7aa06e48c1fff3f64b97b39e770c8895197c4b0f6f0208fdb4");
  });

  it("creates governance policy", () => {
    policy = stampPolicyHash({
      schemaVersion: "1.0.0",
      kind: "governance-policy",
      manifestId,
      network: "testnet",
      treasuryAddress: ISSUER,
      signerPolicy: {
        signers: [
          { address: SIGNER_A, role: "artist", label: "Artist (creator)" },
          { address: SIGNER_B, role: "producer", label: "Producer" },
        ],
        threshold: 2,
      },
      payoutPolicy: {
        allowedAssets: ["XRP"],
        allowPartialPayouts: false,
        maxOutputsPerProposal: 10,
      },
      createdAt: "2026-04-01T00:00:00.000Z",
      createdBy: "capsule-cli",
    });

    assertGovernancePolicy(policy);
    expect(policy.policyHash).toBeDefined();
    expect(policy.policyHash).toBe(computePolicyHash(policy));
  });

  it("creates payout proposal", () => {
    proposal = stampProposalHash({
      schemaVersion: "1.0.0",
      kind: "payout-proposal",
      manifestId: policy.manifestId,
      policyHash: policy.policyHash!,
      proposalId: "payout-001-golden",
      network: policy.network,
      treasuryAddress: policy.treasuryAddress,
      createdAt: "2026-04-01T01:00:00.000Z",
      createdBy: "capsule-cli",
      memo: "Phase D golden path — split revenue 60/40",
      outputs: [
        {
          address: SIGNER_A,
          amount: "60.0",
          asset: "XRP",
          role: "artist",
          reason: "Creator share (60%)",
        },
        {
          address: SIGNER_B,
          amount: "40.0",
          asset: "XRP",
          role: "producer",
          reason: "Producer share (40%)",
        },
      ],
    });

    expect(proposal.proposalHash).toBeDefined();

    const check = checkProposalAgainstPolicy(proposal, policy);
    expect(check.valid).toBe(true);
    expect(check.errors).toHaveLength(0);
  });

  it("evaluates approvals (2/2 threshold)", () => {
    const approvals = [
      { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z", note: "Looks good" },
      { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-04-01T02:05:00.000Z", note: "Confirmed" },
    ];

    const result = evaluateApprovals(proposal, policy, approvals);
    expect(result.outcome).toBe("approved");
    expect(result.thresholdMet).toBe(true);
    expect(result.approvedCount).toBe(2);
    expect(result.rejectedCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("creates decision receipt", () => {
    decision = stampDecisionHash({
      schemaVersion: "1.0.0",
      kind: "payout-decision-receipt",
      manifestId: policy.manifestId,
      policyHash: policy.policyHash!,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash!,
      network: policy.network,
      treasuryAddress: policy.treasuryAddress,
      approvals: [
        { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-04-01T02:00:00.000Z", note: "Looks good" },
        { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-04-01T02:05:00.000Z", note: "Confirmed" },
      ],
      decision: {
        outcome: "approved",
        thresholdMet: true,
        approvedCount: 2,
        rejectedCount: 0,
      },
      decidedAt: "2026-04-01T02:10:00.000Z",
      decidedBy: "capsule-cli",
    });

    expect(decision.decisionHash).toBeDefined();

    const check = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(check.valid).toBe(true);
    expect(check.errors).toHaveLength(0);
  });

  it("creates execution receipt", () => {
    execution = stampExecutionHash({
      schemaVersion: "1.0.0",
      kind: "payout-execution-receipt",
      manifestId: policy.manifestId,
      policyHash: policy.policyHash!,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash!,
      decisionHash: decision.decisionHash!,
      network: policy.network,
      treasuryAddress: policy.treasuryAddress,
      executedAt: "2026-04-01T03:00:00.000Z",
      executedBy: "capsule-cli",
      xrpl: {
        txHashes: [
          "AABB0001000000000000000000000000000000000000000000000000GOLDEN01",
          "AABB0002000000000000000000000000000000000000000000000000GOLDEN02",
        ],
      },
      executedOutputs: [
        { address: SIGNER_A, amount: "60.0", asset: "XRP", role: "artist", reason: "Creator share (60%)" },
        { address: SIGNER_B, amount: "40.0", asset: "XRP", role: "producer", reason: "Producer share (40%)" },
      ],
      verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
    });

    expect(execution.executionHash).toBeDefined();

    const check = checkExecutionAgainstDecision(execution, decision, proposal, policy);
    expect(check.valid).toBe(true);
    expect(check.errors).toHaveLength(0);
  });

  it("full hash chain is valid", () => {
    // Every hash recomputes to the stamped value
    expect(computePolicyHash(policy)).toBe(policy.policyHash);
    expect(computeProposalHash(proposal)).toBe(proposal.proposalHash);
    expect(computeDecisionHash(decision)).toBe(decision.decisionHash);
    expect(computeExecutionHash(execution)).toBe(execution.executionHash);

    // Cross-references all valid
    expect(proposal.policyHash).toBe(policy.policyHash);
    expect(decision.proposalHash).toBe(proposal.proposalHash);
    expect(decision.policyHash).toBe(policy.policyHash);
    expect(execution.decisionHash).toBe(decision.decisionHash);
    expect(execution.proposalHash).toBe(proposal.proposalHash);
    expect(execution.policyHash).toBe(policy.policyHash);
  });

  it("writes governance artifacts to disk", async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });

    await writeFile(
      join(OUTPUT_DIR, "governance-policy.json"),
      JSON.stringify(policy, null, 2) + "\n"
    );
    await writeFile(
      join(OUTPUT_DIR, "payout-proposal.json"),
      JSON.stringify(proposal, null, 2) + "\n"
    );
    await writeFile(
      join(OUTPUT_DIR, "payout-decision.json"),
      JSON.stringify(decision, null, 2) + "\n"
    );
    await writeFile(
      join(OUTPUT_DIR, "payout-execution.json"),
      JSON.stringify(execution, null, 2) + "\n"
    );

    // Verify written files round-trip
    const rePolicy = JSON.parse(await readFile(join(OUTPUT_DIR, "governance-policy.json"), "utf-8"));
    expect(rePolicy.policyHash).toBe(policy.policyHash);
    expect(computePolicyHash(rePolicy)).toBe(policy.policyHash);
  });
});
