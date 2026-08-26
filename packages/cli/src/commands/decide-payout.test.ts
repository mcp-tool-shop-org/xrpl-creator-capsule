import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWalletPair } from "@capsule/xrpl";
import {
  stampPolicyHash,
  stampProposalHash,
  type GovernancePolicy,
  type PayoutProposal,
} from "@capsule/core";
import { decidePayout } from "./decide-payout.js";

// F-c939eb27: decide-payout.ts — the third link in the governance/payout
// chain (policy -> proposal -> decision -> execution -> verify) — had no
// test file at all. Pure file + hash-chain logic, no @capsule/xrpl network
// calls; generateWalletPair() is only used for real, checksum-valid
// r-addresses (mirrors verify-payout.test.ts / propose-payout.test.ts).

const MANIFEST_ID = "a".repeat(64);
const treasuryPair = generateWalletPair();
const signerAPair = generateWalletPair();
const signerBPair = generateWalletPair();
const outsiderPair = generateWalletPair();
const recipientPair = generateWalletPair();
const TREASURY = treasuryPair.issuer.address;
const SIGNER_A = signerAPair.issuer.address;
const SIGNER_B = signerBPair.issuer.address;
const OUTSIDER = outsiderPair.issuer.address;
const RECIPIENT = recipientPair.issuer.address;

function buildPolicy(threshold = 2): GovernancePolicy {
  return stampPolicyHash({
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId: MANIFEST_ID,
    network: "testnet",
    treasuryAddress: TREASURY,
    signerPolicy: {
      signers: [
        { address: SIGNER_A, role: "artist" },
        { address: SIGNER_B, role: "manager" },
      ],
      threshold,
    },
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
    outputs: [{ address: RECIPIENT, amount: "1000000", asset: "XRP", role: "artist", reason: "Q1 royalties" }],
  });
}

let tempDir: string;
let policyPath: string;
let proposalPath: string;
let outputPath: string;
let policy: GovernancePolicy;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-decide-payout-test-"));
  policyPath = join(tempDir, "policy.json");
  proposalPath = join(tempDir, "proposal.json");
  outputPath = join(tempDir, "payout-decision.json");

  policy = buildPolicy(2);
  await writeFile(policyPath, JSON.stringify(policy));
  await writeFile(proposalPath, JSON.stringify(buildProposal(policy)));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function baseOpts(approvals: Array<{ signerAddress: string; approved: boolean; decidedAt: string }>) {
  return {
    policyPath,
    proposalPath,
    approvals,
    decidedBy: "test-suite",
    outputPath,
  };
}

describe("decidePayout — threshold met", () => {
  it("records an approved decision when enough signers approve, and writes it to disk", async () => {
    const decision = await decidePayout(
      baseOpts([
        { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-01-03T00:00:00Z" },
        { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-01-03T00:01:00Z" },
      ])
    );

    expect(decision.decision.outcome).toBe("approved");
    expect(decision.decision.thresholdMet).toBe(true);
    expect(decision.decision.approvedCount).toBe(2);
    expect(decision.decisionHash).toMatch(/^[a-f0-9]{64}$/);

    const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(onDisk.decisionHash).toBe(decision.decisionHash);
  });
});

describe("decidePayout — threshold not met", () => {
  it("records a rejected decision when too few signers approve", async () => {
    const decision = await decidePayout(
      baseOpts([{ signerAddress: SIGNER_A, approved: true, decidedAt: "2026-01-03T00:00:00Z" }])
    );

    expect(decision.decision.outcome).toBe("rejected");
    expect(decision.decision.thresholdMet).toBe(false);
    expect(decision.decision.approvedCount).toBe(1);
  });

  it("dedupes repeat votes from the same signer — first vote wins", async () => {
    // Signer A votes reject, then a later (forged or duplicate) row claims
    // approve for the same address — evaluateApprovals's contract is that
    // the FIRST entry per signer counts, so this must still resolve as
    // only 1 real approval (Signer B), one short of the threshold of 2.
    const decision = await decidePayout(
      baseOpts([
        { signerAddress: SIGNER_A, approved: false, decidedAt: "2026-01-03T00:00:00Z" },
        { signerAddress: SIGNER_A, approved: true, decidedAt: "2026-01-03T00:05:00Z" },
        { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-01-03T00:01:00Z" },
      ])
    );

    expect(decision.decision.approvedCount).toBe(1);
    expect(decision.decision.rejectedCount).toBe(1);
    expect(decision.decision.outcome).toBe("rejected");
  });
});

describe("decidePayout — approval errors", () => {
  it("throws when an approval comes from a signer outside the governance policy", async () => {
    await expect(
      decidePayout(
        baseOpts([
          { signerAddress: OUTSIDER, approved: true, decidedAt: "2026-01-03T00:00:00Z" },
          { signerAddress: SIGNER_B, approved: true, decidedAt: "2026-01-03T00:01:00Z" },
        ])
      )
    ).rejects.toThrow(/not in governance policy/);
  });
});

describe("decidePayout — malformed artifact files (F-5a0ce89b)", () => {
  it("names the policy file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(policyPath, "{ not valid json");

    let caught: unknown;
    try {
      await decidePayout(baseOpts([{ signerAddress: SIGNER_A, approved: true, decidedAt: "2026-01-03T00:00:00Z" }]));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("Failed to parse");
    expect((caught as Error).message).toContain(policyPath);
  });

  it("names the proposal file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(proposalPath, "{ not valid json");

    let caught: unknown;
    try {
      await decidePayout(baseOpts([{ signerAddress: SIGNER_A, approved: true, decidedAt: "2026-01-03T00:00:00Z" }]));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("Failed to parse");
    expect((caught as Error).message).toContain(proposalPath);
  });
});
