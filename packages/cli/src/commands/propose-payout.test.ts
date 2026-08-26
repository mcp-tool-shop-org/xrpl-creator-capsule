import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWalletPair } from "@capsule/xrpl";
import { stampPolicyHash, type GovernancePolicy } from "@capsule/core";
import { proposePayout } from "./propose-payout.js";

// F-c939eb27: propose-payout.ts — the second link in the governance/payout
// chain (policy -> proposal -> decision -> execution -> verify) — had no
// test file at all. Pure file + hash-chain logic, no @capsule/xrpl network
// calls; generateWalletPair() below is only used for real, checksum-valid
// r-addresses (pure key generation, mirrors verify-payout.test.ts).

const MANIFEST_ID = "a".repeat(64);
const treasuryPair = generateWalletPair();
const signerPair = generateWalletPair();
const recipientPair = generateWalletPair();
const TREASURY = treasuryPair.issuer.address;
const SIGNER = signerPair.issuer.address;
const RECIPIENT = recipientPair.issuer.address;

function buildPolicy(overrides?: Partial<GovernancePolicy>): GovernancePolicy {
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
    ...overrides,
  });
}

let tempDir: string;
let policyPath: string;
let outputPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-propose-payout-test-"));
  policyPath = join(tempDir, "policy.json");
  outputPath = join(tempDir, "payout-proposal.json");
  await writeFile(policyPath, JSON.stringify(buildPolicy()));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function baseOpts() {
  return {
    policyPath,
    proposalId: "prop-1",
    outputs: [
      { address: RECIPIENT, amount: "1000000", asset: "XRP", role: "artist" as const, reason: "Q1 royalties" },
    ],
    createdBy: "test-suite",
    outputPath,
  };
}

describe("proposePayout — happy path", () => {
  it("creates a stamped proposal referencing the policy, and writes it to disk", async () => {
    const proposal = await proposePayout(baseOpts());

    expect(proposal.kind).toBe("payout-proposal");
    expect(proposal.manifestId).toBe(MANIFEST_ID);
    expect(proposal.treasuryAddress).toBe(TREASURY);
    expect(proposal.network).toBe("testnet");
    expect(proposal.outputs).toHaveLength(1);
    expect(proposal.proposalHash).toMatch(/^[a-f0-9]{64}$/);

    const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(onDisk.proposalHash).toBe(proposal.proposalHash);
  });

  it("includes memo only when explicitly provided", async () => {
    const withMemo = await proposePayout({ ...baseOpts(), memo: "quarterly split" });
    expect(withMemo.memo).toBe("quarterly split");

    const withoutMemo = await proposePayout(baseOpts());
    expect(withoutMemo.memo).toBeUndefined();
  });
});

describe("proposePayout — policy violations", () => {
  it("throws when an output asset is not in the policy's allowedAssets", async () => {
    await expect(
      proposePayout({
        ...baseOpts(),
        outputs: [{ address: RECIPIENT, amount: "1000000", asset: "USD", role: "artist", reason: "royalties" }],
      })
    ).rejects.toThrow(/not in policy allowedAssets/);
  });

  it("throws when the proposal exceeds the policy's maxOutputsPerProposal", async () => {
    await writeFile(
      policyPath,
      JSON.stringify(buildPolicy({ payoutPolicy: { allowedAssets: ["XRP"], allowPartialPayouts: false, maxOutputsPerProposal: 1 } }))
    );

    await expect(
      proposePayout({
        ...baseOpts(),
        outputs: [
          { address: RECIPIENT, amount: "500000", asset: "XRP", role: "artist", reason: "half" },
          { address: RECIPIENT, amount: "500000", asset: "XRP", role: "artist", reason: "half" },
        ],
      })
    ).rejects.toThrow(/allows max 1/);
  });
});

describe("proposePayout — structural invariants", () => {
  it("throws when an output amount is not positive", async () => {
    await expect(
      proposePayout({
        ...baseOpts(),
        outputs: [{ address: RECIPIENT, amount: "0", asset: "XRP", role: "artist", reason: "zero" }],
      })
    ).rejects.toThrow(/amount must be positive/);
  });
});

describe("proposePayout — malformed policy file (F-5a0ce89b)", () => {
  it("names the policy file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(policyPath, "{ not valid json");

    let caught: unknown;
    try {
      await proposePayout(baseOpts());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain(policyPath);
  });
});
