import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWalletPair } from "@capsule/xrpl";
import {
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  type GovernancePolicy,
  type PayoutProposal,
  type PayoutDecisionReceipt,
} from "@capsule/core";
import { executePayout } from "./execute-payout.js";

// F-c939eb27: execute-payout.ts is named FIRST in the finding's own fix
// priority list ("execute-payout, decide-payout, propose-payout,
// verify-payout, mint-release, configure-minter") as the most value-moving
// command in the chain — it records the receipt that later verify-payout
// treats as ledger-backed truth — and had no test file at all. No
// @capsule/xrpl network calls happen here (actual XRPL Payment submission is
// explicitly out of scope per this file's own header comment; tx hashes are
// supplied by the caller from a real submission done elsewhere), so no
// mocking boundary is needed. generateWalletPair() is only used for real,
// checksum-valid r-addresses (mirrors verify-payout.test.ts).

const MANIFEST_ID = "a".repeat(64);
const treasuryPair = generateWalletPair();
const signerPair = generateWalletPair();
const recipientPair = generateWalletPair();
const wrongRecipientPair = generateWalletPair();
const TREASURY = treasuryPair.issuer.address;
const SIGNER = signerPair.issuer.address;
const RECIPIENT = recipientPair.issuer.address;
const WRONG_RECIPIENT = wrongRecipientPair.issuer.address;
const TX_HASH = "A1B2C3D4E5F6000000000000000000000000000000000000000000000000ABCD";
const AMOUNT_DROPS = "1000000";

function buildPolicy(): GovernancePolicy {
  return stampPolicyHash({
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId: MANIFEST_ID,
    network: "testnet",
    treasuryAddress: TREASURY,
    signerPolicy: { signers: [{ address: SIGNER, role: "artist" }], threshold: 1 },
    payoutPolicy: { allowedAssets: ["XRP"], allowPartialPayouts: false },
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: "test",
  });
}

function buildProposal(policy: GovernancePolicy): PayoutProposal {
  return stampProposalHash({
    schemaVersion: "1.0.0",
    kind: "payout-proposal",
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: "prop-1",
    network: "testnet",
    treasuryAddress: TREASURY,
    createdAt: "2026-01-02T00:00:00Z",
    createdBy: "test",
    outputs: [{ address: RECIPIENT, amount: AMOUNT_DROPS, asset: "XRP", role: "artist", reason: "Q1 royalties" }],
  });
}

function buildDecision(
  policy: GovernancePolicy,
  proposal: PayoutProposal,
  outcome: "approved" | "rejected" = "approved"
): PayoutDecisionReceipt {
  return stampDecisionHash({
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: "testnet",
    treasuryAddress: TREASURY,
    approvals: [{ signerAddress: SIGNER, approved: outcome === "approved", decidedAt: "2026-01-03T00:00:00Z" }],
    decision: {
      outcome,
      thresholdMet: outcome === "approved",
      approvedCount: outcome === "approved" ? 1 : 0,
      rejectedCount: outcome === "approved" ? 0 : 1,
    },
    decidedAt: "2026-01-03T00:00:00Z",
    decidedBy: "test",
  });
}

let tempDir: string;
let policyPath: string;
let proposalPath: string;
let decisionPath: string;
let outputPath: string;
let policy: GovernancePolicy;
let proposal: PayoutProposal;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-execute-payout-test-"));
  policyPath = join(tempDir, "policy.json");
  proposalPath = join(tempDir, "proposal.json");
  decisionPath = join(tempDir, "decision.json");
  outputPath = join(tempDir, "payout-execution.json");

  policy = buildPolicy();
  proposal = buildProposal(policy);
  await writeFile(policyPath, JSON.stringify(policy));
  await writeFile(proposalPath, JSON.stringify(proposal));
  await writeFile(decisionPath, JSON.stringify(buildDecision(policy, proposal)));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function baseOpts() {
  return {
    policyPath,
    proposalPath,
    decisionPath,
    txHashes: [TX_HASH],
    executedOutputs: [{ address: RECIPIENT, amount: AMOUNT_DROPS, asset: "XRP", role: "artist" as const, reason: "Q1 royalties" }],
    executedBy: "test-suite",
    outputPath,
  };
}

describe("executePayout — happy path", () => {
  it("records a verified execution matching the approved proposal, and writes it to disk", async () => {
    const execution = await executePayout(baseOpts());

    expect(execution.xrpl.txHashes).toEqual([TX_HASH]);
    expect(execution.verification.matchesApprovedProposal).toBe(true);
    expect(execution.verification.errors).toEqual([]);
    expect(execution.executionHash).toMatch(/^[a-f0-9]{64}$/);

    const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(onDisk.executionHash).toBe(execution.executionHash);
  });

  it("includes ledgerIndexes only when explicitly provided", async () => {
    const withIndexes = await executePayout({ ...baseOpts(), ledgerIndexes: [12345] });
    expect(withIndexes.xrpl.ledgerIndexes).toEqual([12345]);

    const withoutIndexes = await executePayout(baseOpts());
    expect(withoutIndexes.xrpl.ledgerIndexes).toBeUndefined();
  });
});

describe("executePayout — cannot execute an unapproved proposal", () => {
  it("refuses to record an execution when the decision was rejected", async () => {
    await writeFile(decisionPath, JSON.stringify(buildDecision(policy, proposal, "rejected")));

    await expect(executePayout(baseOpts())).rejects.toThrow(
      "Cannot execute: proposal was not approved"
    );
  });
});

describe("executePayout — hash-chain mismatch", () => {
  it("throws (and never writes a file) when executed outputs don't match the approved proposal", async () => {
    await expect(
      executePayout({
        ...baseOpts(),
        executedOutputs: [{ address: WRONG_RECIPIENT, amount: AMOUNT_DROPS, asset: "XRP", role: "artist", reason: "Q1 royalties" }],
      })
    ).rejects.toThrow(/Execution violates hash chain/);

    // A rejected execution must never land on disk looking like a real one.
    await expect(readFile(outputPath, "utf-8")).rejects.toThrow(/ENOENT/);
  });
});

describe("executePayout — malformed artifact files (F-5a0ce89b)", () => {
  it("names the policy file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(policyPath, "{ not valid json");
    let caught: unknown;
    try {
      await executePayout(baseOpts());
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toContain("Failed to parse");
    expect((caught as Error).message).toContain(policyPath);
  });

  it("names the proposal file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(proposalPath, "{ not valid json");
    let caught: unknown;
    try {
      await executePayout(baseOpts());
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toContain("Failed to parse");
    expect((caught as Error).message).toContain(proposalPath);
  });

  it("names the decision file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(decisionPath, "{ not valid json");
    let caught: unknown;
    try {
      await executePayout(baseOpts());
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toContain("Failed to parse");
    expect((caught as Error).message).toContain(decisionPath);
  });
});
