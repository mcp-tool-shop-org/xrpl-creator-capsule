/**
 * F-08116633: ExecutionForm gated "Record Execution" only on
 * executedBy.trim() && txHashes.every((h) => h.trim()) — any non-empty
 * string passed, with no format check against a real 64-hex-character
 * XRPL transaction hash. Since the governance/payout chain never calls
 * any XRPL read function (unlike mint/verify-release/recover-release),
 * nothing downstream ever checks these hashes against the ledger
 * either — a typo'd hash becomes a permanent part of the hash-chained,
 * self-described "canonical" audit artifact for a real payout, with no
 * check at entry and no check ever afterward.
 *
 * Fix: validate each tx hash as 64 hex chars before enabling/accepting,
 * with an inline error showing what a real hash looks like; normalize
 * to uppercase (the canonical case this app's real XRPL tx hashes use —
 * see fixtures/direct-rail-receipt.json's mintTxHashes,
 * "07459A93BFA5817727416FE969F6A4F17E0A9064E37690174DF01E8DC505B698" —
 * while still accepting lowercase input); and surface a self-attested/
 * not-chain-verified notice on ExecutionCard, since nothing downstream
 * ever checks these against the real ledger.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GovernancePanel } from "./GovernancePanel";
import * as releaseModule from "../../state/release";
import { MANIFEST, GOV_POLICY } from "../../__test__/fixtures";
import type { ManifestState, GovernanceState } from "../../state/release";

const LOADED_MANIFEST: ManifestState = {
  status: "loaded", path: "/m.json", data: MANIFEST, validation: null, resolution: null, stamp: null, error: null,
};

const APPROVED_PROPOSAL = {
  schemaVersion: "1.0.0",
  kind: "payout-proposal",
  manifestId: "manifest-abc-123",
  policyHash: "gov-hash-abc",
  proposalId: "payout-1",
  network: "testnet",
  treasuryAddress: "rTreasury123",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "rSigner1",
  outputs: [{ address: "rArtist123", amount: "10", asset: "XRP", role: "artist" as const, reason: "share" }],
  proposalHash: "proposal-hash-abc",
};

const APPROVED_DECISION = {
  schemaVersion: "1.0.0",
  kind: "payout-decision",
  manifestId: "manifest-abc-123",
  policyHash: "gov-hash-abc",
  proposalId: "payout-1",
  proposalHash: "proposal-hash-abc",
  network: "testnet",
  treasuryAddress: "rTreasury123",
  approvals: [{ signerAddress: "rSigner1", approved: true, decidedAt: "2026-01-01T00:00:00.000Z" }],
  decision: { outcome: "approved" as const, thresholdMet: true, approvedCount: 1, rejectedCount: 0 },
  decidedAt: "2026-01-01T00:00:00.000Z",
  decidedBy: "rSigner1",
  decisionHash: "decision-hash-abc",
};

function readyGovernanceState(overrides?: Partial<GovernanceState>): GovernanceState {
  return {
    policyStatus: "loaded", policyPath: "/policy.json", policy: GOV_POLICY,
    proposalStatus: "loaded", proposalPath: "/proposal.json", proposal: APPROVED_PROPOSAL,
    decisionStatus: "loaded", decisionPath: "/decision.json", decision: APPROVED_DECISION,
    executionStatus: "empty", executionPath: null, execution: null,
    verifyStatus: "idle", verifyResult: null,
    error: null,
    ...overrides,
  };
}

function mockUseRelease(governance: GovernanceState) {
  const createExecution = vi.fn();
  vi.spyOn(releaseModule, "useRelease").mockReturnValue({
    manifest: LOADED_MANIFEST,
    governance,
    loadGovPolicy: vi.fn(),
    createGovPolicy: vi.fn(),
    loadProposal: vi.fn(),
    createProposal: vi.fn(),
    loadDecision: vi.fn(),
    createDecision: vi.fn(),
    loadExecution: vi.fn(),
    createExecution,
    runVerifyPayout: vi.fn(),
  } as unknown as ReturnType<typeof releaseModule.useRelease>);
  return { createExecution };
}

const REAL_HASH_UPPER = "07459A93BFA5817727416FE969F6A4F17E0A9064E37690174DF01E8DC505B698";
const REAL_HASH_LOWER = REAL_HASH_UPPER.toLowerCase();

describe("GovernancePanel ExecutionForm tx hash validation (F-08116633)", () => {
  it("keeps 'Record Execution' disabled for a non-hash placeholder string, even though the field is non-empty", () => {
    mockUseRelease(readyGovernanceState());
    render(<GovernancePanel />);

    const txInput = screen.getByPlaceholderText(/tx hash/i);
    fireEvent.change(txInput, { target: { value: "not-a-real-hash" } });
    const executedByInput = screen.getByPlaceholderText(/executor name or address/i);
    fireEvent.change(executedByInput, { target: { value: "capsule-cli" } });

    const button = screen.getByRole("button", { name: /record execution/i });
    expect(button).toBeDisabled();
  });

  it("shows an inline error describing what a real XRPL tx hash looks like when the value is invalid", () => {
    mockUseRelease(readyGovernanceState());
    render(<GovernancePanel />);

    const txInput = screen.getByPlaceholderText(/tx hash/i);
    fireEvent.change(txInput, { target: { value: "not-a-real-hash" } });

    expect(screen.getByText(/64.*hex|hex.*64/i)).toBeInTheDocument();
  });

  it("enables 'Record Execution' and normalizes a valid lowercase hash to uppercase on submit", () => {
    const { createExecution } = mockUseRelease(readyGovernanceState());
    render(<GovernancePanel />);

    const txInput = screen.getByPlaceholderText(/tx hash/i);
    fireEvent.change(txInput, { target: { value: REAL_HASH_LOWER } });
    const executedByInput = screen.getByPlaceholderText(/executor name or address/i);
    fireEvent.change(executedByInput, { target: { value: "capsule-cli" } });

    const button = screen.getByRole("button", { name: /record execution/i });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(createExecution).toHaveBeenCalledTimes(1);
    const call = createExecution.mock.calls[0][0];
    expect(call.txHashes).toEqual([REAL_HASH_UPPER]);
  });

  it("accepts an already-uppercase hash unchanged", () => {
    const { createExecution } = mockUseRelease(readyGovernanceState());
    render(<GovernancePanel />);

    fireEvent.change(screen.getByPlaceholderText(/tx hash/i), { target: { value: REAL_HASH_UPPER } });
    fireEvent.change(screen.getByPlaceholderText(/executor name or address/i), { target: { value: "capsule-cli" } });
    fireEvent.click(screen.getByRole("button", { name: /record execution/i }));

    expect(createExecution).toHaveBeenCalledTimes(1);
    expect(createExecution.mock.calls[0][0].txHashes).toEqual([REAL_HASH_UPPER]);
  });

  it("rejects a hash of the wrong length even if all characters are valid hex", () => {
    mockUseRelease(readyGovernanceState());
    render(<GovernancePanel />);

    fireEvent.change(screen.getByPlaceholderText(/tx hash/i), { target: { value: "ABCDEF0123456789" } }); // 16 chars, valid hex, wrong length
    fireEvent.change(screen.getByPlaceholderText(/executor name or address/i), { target: { value: "capsule-cli" } });

    expect(screen.getByRole("button", { name: /record execution/i })).toBeDisabled();
  });
});

describe("GovernancePanel ExecutionCard self-attested notice (F-08116633)", () => {
  it("shows a notice that the record is self-attested and not checked against the XRPL ledger", () => {
    mockUseRelease(
      readyGovernanceState({
        executionStatus: "loaded",
        executionPath: "/execution.json",
        execution: {
          schemaVersion: "1.0.0",
          kind: "payout-execution-receipt",
          manifestId: "manifest-abc-123",
          policyHash: "gov-hash-abc",
          proposalId: "payout-1",
          proposalHash: "proposal-hash-abc",
          decisionHash: "decision-hash-abc",
          network: "testnet",
          treasuryAddress: "rTreasury123",
          executedAt: "2026-01-01T00:00:00.000Z",
          executedBy: "capsule-cli",
          xrpl: { txHashes: [REAL_HASH_UPPER] },
          executedOutputs: [{ address: "rArtist123", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
          verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
        },
      })
    );

    render(<GovernancePanel />);

    expect(screen.getByText(/self-attested|not.*(checked|verified).*ledger|has not been checked/i)).toBeInTheDocument();
  });
});
