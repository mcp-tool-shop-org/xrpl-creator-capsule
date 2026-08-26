import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWalletPair } from "@capsule/xrpl";
import {
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  stampExecutionHash,
  type GovernancePolicy,
  type PayoutProposal,
  type PayoutDecisionReceipt,
  type PayoutExecutionReceipt,
} from "@capsule/core";

const { mockConnect, mockDisconnect, mockRequest } = vi.hoisted(() => {
  return {
    mockConnect: vi.fn(),
    mockDisconnect: vi.fn(),
    mockRequest: vi.fn(),
  };
});

// Mirrors packages/xrpl/src/mint.test.ts's mocking style: replace only the
// networked Client class while keeping every other real "xrpl" export.
vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      request: mockRequest,
    })),
  };
});

import { verifyPayout } from "./verify-payout.js";

const MANIFEST_ID = "a".repeat(64);

// Real, checksum-valid XRPL addresses (no network calls — Wallet.generate()
// is pure), so the r-address schema pattern is satisfied without guessing
// at hand-written base58 strings.
const treasuryPair = generateWalletPair();
const signerPair = generateWalletPair();
const recipientPair = generateWalletPair();
const otherPair = generateWalletPair();
const TREASURY = treasuryPair.issuer.address;
const SIGNER = signerPair.issuer.address;
const RECIPIENT = recipientPair.issuer.address;
const WRONG_RECIPIENT = otherPair.issuer.address;

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
    outputs: [
      { address: RECIPIENT, amount: AMOUNT_DROPS, asset: "XRP", role: "artist", reason: "Q1 royalties" },
    ],
  });
}

function buildDecision(policy: GovernancePolicy, proposal: PayoutProposal): PayoutDecisionReceipt {
  return stampDecisionHash({
    schemaVersion: "1.0.0",
    kind: "payout-decision-receipt",
    manifestId: MANIFEST_ID,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: "testnet",
    treasuryAddress: TREASURY,
    approvals: [{ signerAddress: SIGNER, approved: true, decidedAt: "2026-01-03T00:00:00Z" }],
    decision: { outcome: "approved", thresholdMet: true, approvedCount: 1, rejectedCount: 0 },
    decidedAt: "2026-01-03T00:00:00Z",
    decidedBy: "test",
  });
}

function buildExecution(
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
    executedAt: "2026-01-04T00:00:00Z",
    executedBy: "test",
    xrpl: { txHashes: [TX_HASH] },
    executedOutputs: [
      { address: RECIPIENT, amount: AMOUNT_DROPS, asset: "XRP", role: "artist", reason: "Q1 royalties" },
    ],
    verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
  });
}

let tempDir: string;
let paths: { policyPath: string; proposalPath: string; decisionPath: string; executionPath: string };

async function writeArtifacts() {
  const policy = buildPolicy();
  const proposal = buildProposal(policy);
  const decision = buildDecision(policy, proposal);
  const execution = buildExecution(policy, proposal, decision);

  const policyPath = join(tempDir, "policy.json");
  const proposalPath = join(tempDir, "proposal.json");
  const decisionPath = join(tempDir, "decision.json");
  const executionPath = join(tempDir, "execution.json");

  await writeFile(policyPath, JSON.stringify(policy));
  await writeFile(proposalPath, JSON.stringify(proposal));
  await writeFile(decisionPath, JSON.stringify(decision));
  await writeFile(executionPath, JSON.stringify(execution));

  return { policyPath, proposalPath, decisionPath, executionPath };
}

function validatedTesSuccessTx(overrides?: {
  destination?: string;
  deliveredAmount?: string;
  txResult?: string;
  validated?: boolean;
}) {
  return {
    result: {
      hash: TX_HASH,
      validated: overrides?.validated ?? true,
      meta: {
        TransactionResult: overrides?.txResult ?? "tesSUCCESS",
        delivered_amount: overrides?.deliveredAmount ?? AMOUNT_DROPS,
      },
      tx_json: {
        TransactionType: "Payment",
        Destination: overrides?.destination ?? RECIPIENT,
        Amount: overrides?.deliveredAmount ?? AMOUNT_DROPS,
      },
    },
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-verify-payout-test-"));
  paths = await writeArtifacts();
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockRequest.mockReset();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("verifyPayout — chain verification (F-7ebc796c)", () => {
  // Before this fix, every one of verifyPayout's checks compared the 4
  // local JSON files against each other's own self-reported hashes. None
  // ever asked the XRPL ledger whether the claimed payout actually
  // happened, so a receipt whose txHashes were entirely fabricated (never
  // submitted, or submitted and never validated) verified identically to a
  // real payout: "Governance verification PASSED — full hash chain valid".

  it("does not report PASSED for a txHash that was never confirmed on the ledger", async () => {
    // Simulates the worst case named in the finding: a fabricated tx hash
    // that doesn't exist on-ledger at all (rippled's real behavior for an
    // unknown hash is to reject the "tx" request outright).
    mockRequest.mockRejectedValueOnce(new Error("txnNotFound"));

    const result = await verifyPayout(paths);

    expect(result.passed).toBe(false);
    expect(
      result.checks.some((c) => c.name.startsWith("chain-") && !c.passed)
    ).toBe(true);
  });

  it("reports PASSED, with a passing chain check, for a genuinely validated on-chain payment", async () => {
    mockRequest.mockResolvedValueOnce(validatedTesSuccessTx());

    const result = await verifyPayout(paths);

    expect(result.passed).toBe(true);
    // Proves the mechanism actually ran (not just that nothing failed) —
    // this is what distinguishes a real chain check from there being none
    // at all.
    expect(
      result.checks.some((c) => c.name.startsWith("chain-") && c.passed)
    ).toBe(true);
  });

  it("fails verification when the on-chain payment went to the wrong destination", async () => {
    mockRequest.mockResolvedValueOnce(
      validatedTesSuccessTx({ destination: WRONG_RECIPIENT })
    );

    const result = await verifyPayout(paths);

    expect(result.passed).toBe(false);
    expect(
      result.checks.some((c) => c.name.startsWith("chain-") && !c.passed)
    ).toBe(true);
  });

  it("fails verification when the transaction did not succeed on-chain (tesSUCCESS required)", async () => {
    mockRequest.mockResolvedValueOnce(
      validatedTesSuccessTx({ txResult: "tecNO_PERMISSION" })
    );

    const result = await verifyPayout(paths);

    expect(result.passed).toBe(false);
    expect(
      result.checks.some((c) => c.name.startsWith("chain-") && !c.passed)
    ).toBe(true);
  });
});
