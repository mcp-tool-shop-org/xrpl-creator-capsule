/**
 * F-dba2ccb6 — every network-touching engine call gets the same
 * client-side timeout protection the mint path already had, instead of
 * being able to spin a button's "running" state forever.
 *
 * Before this fix: runMint/runMintFromStudio raced a 90s timeout
 * specifically so a hung bridge-worker/XRPL call couldn't spin the UI
 * forever (release.tsx, F-74549b0b). That protection was never
 * generalized — runVerify, runGrantAccess, runRecover, runReplay,
 * createPolicy, and the governance actions called engineCall() (via
 * their typed wrappers in bridge/engine.ts) directly with no timeout at
 * all, even though several make live XRPL network calls inside the
 * bridge worker. A hang on any of them left the corresponding button
 * "running" indefinitely with no cancel affordance — indistinguishable
 * from "still working" to a non-technical user.
 *
 * Each test below proves the SAME shared wrapper mint already used
 * (factored out here) now protects the other call sites: the promise
 * that never resolves within the timeout window still leaves the
 * action's status flipped away from "running"/"loading" with an honest
 * message ("timed out", NOT "failed") that points at retrying — mint's
 * own wording, reused rather than re-invented per call site.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import React from "react";
import { ReleaseProvider, useRelease } from "./release";
import { MANIFEST, RECEIPT, ACCESS_POLICY, GOV_POLICY } from "../__test__/fixtures";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ReleaseProvider, null, children);
}

function renderRelease() {
  return renderHook(() => useRelease(), { wrapper });
}

/** A never-settling engine_call response, plus a resolve function to
 *  clean it up at the end of each test (so no dangling timers/promises
 *  leak between tests). */
function hangingEngineCall() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function setupVerifyReady(result: { current: ReturnType<typeof useRelease> }) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "load_file") return JSON.stringify(MANIFEST);
    if (cmd === "save_file") return undefined;
    if (cmd === "engine_call") return RECEIPT;
    return undefined;
  });
  await act(async () => {
    await result.current.runMintFromStudio("/m.json", "/w.json", "/r.json");
  });
  expect(result.current.mint.actionStatus).toBe("done");
}

async function setupAccessReady(result: { current: ReturnType<typeof useRelease> }) {
  await setupVerifyReady(result);
  mockOpen.mockResolvedValueOnce({ path: "/policy.json" } as any);
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "load_file") return JSON.stringify(ACCESS_POLICY);
    if (cmd === "save_file") return undefined;
    return undefined;
  });
  await act(async () => { await result.current.loadPolicy(); });
  expect(result.current.access.policyPath).toBe("/policy.json");
  act(() => { result.current.setWalletAddress("rTestWallet123"); });
}

describe("timeout protection — generalized from the mint flow (F-dba2ccb6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── runVerify ─────────────────────────────────────────────────

  it("runVerify: hangs past 90s -> status flips to timed_out with honest, non-'failed' wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    act(() => { result.current.runVerify(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.verify.status).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.verify.status).toBe("timed_out");
    expect(result.current.verify.error).toMatch(/timed out/i);
    expect(result.current.verify.error).toMatch(/retry|try again|check/i);
    expect(result.current.verify.error).not.toMatch(/\bfailed\b/i);

    resolve(RECEIPT);
  });

  it("runVerify: a late-arriving real result after timeout still lands (result not dropped)", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    act(() => { result.current.runVerify(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_100); });
    expect(result.current.verify.status).toBe("timed_out");

    const lateResult = { passed: true, checks: [{ name: "hash", passed: true, detail: "OK" }] };
    await act(async () => { resolve(lateResult); await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.verify.status).toBe("done");
    expect(result.current.verify.result?.passed).toBe(true);
  });

  // ── runGrantAccess (both TestAccessPage call sites share this one fn) ──

  it("runGrantAccess: hangs past 90s -> grantStatus flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupAccessReady(result);

    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    act(() => { result.current.runGrantAccess(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.access.grantStatus).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.access.grantStatus).toBe("timed_out");
    expect(result.current.access.error).toMatch(/timed out/i);
    expect(result.current.access.error).not.toMatch(/\bfailed\b/i);

    resolve(null);
  });

  // ── createPolicy ─────────────────────────────────────────────

  it("createPolicy: hangs past 90s -> policyStatus flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/access-policy.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => { result.current.createPolicy(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.access.policyStatus).toBe("loading");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.access.policyStatus).toBe("timed_out");
    expect(result.current.access.error).toMatch(/timed out/i);
    expect(result.current.access.error).not.toMatch(/\bfailed\b/i);

    resolve(ACCESS_POLICY);
  });

  // ── runRecover ───────────────────────────────────────────────

  it("runRecover: hangs past 90s -> status flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/recovery-bundle.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => { result.current.runRecover(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.recovery.status).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.recovery.status).toBe("timed_out");
    expect(result.current.recovery.error).toMatch(/timed out/i);
    expect(result.current.recovery.error).not.toMatch(/\bfailed\b/i);

    resolve(null);
  });

  // ── runReplay (two sequential engineGrant calls, one shared budget) ──

  it("runReplay: the first (holder) check hanging past 90s -> replayStatus times out honestly", async () => {
    const { result } = renderRelease();
    await setupAccessReady(result);

    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    act(() => { result.current.runReplay("rHolder123", "rNonHolder456"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.recovery.replayStatus).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.recovery.replayStatus).toBe("timed_out");
    expect(result.current.recovery.error).toMatch(/timed out/i);
    expect(result.current.recovery.error).not.toMatch(/\bfailed\b/i);

    resolve(null);
  });

  // ── Governance actions ───────────────────────────────────────

  it("createGovPolicy: hangs past 90s -> policyStatus flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/governance-policy.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => {
      result.current.createGovPolicy({
        treasuryAddress: "rTreasury123",
        signers: [{ address: "rSigner1", role: "artist" }],
        threshold: 1,
        createdBy: "rSigner1",
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.governance.policyStatus).toBe("loading");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.governance.policyStatus).toBe("timed_out");
    expect(result.current.governance.error).toMatch(/timed out/i);
    expect(result.current.governance.error).not.toMatch(/\bfailed\b/i);

    resolve(GOV_POLICY);
  });

  it("createProposal: hangs past 90s -> proposalStatus flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/governance-policy.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return GOV_POLICY;
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createGovPolicy({
        treasuryAddress: "rTreasury123",
        signers: [{ address: "rSigner1", role: "artist" }],
        threshold: 1,
        createdBy: "rSigner1",
      });
    });
    expect(result.current.governance.policyStatus).toBe("loaded");

    mockSave.mockResolvedValueOnce("/payout-proposal.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => {
      result.current.createProposal({
        proposalId: "payout-1",
        outputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        createdBy: "rSigner1",
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.governance.proposalStatus).toBe("loading");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.governance.proposalStatus).toBe("timed_out");
    expect(result.current.governance.error).toMatch(/timed out/i);
    expect(result.current.governance.error).not.toMatch(/\bfailed\b/i);

    resolve(null);
  });

  it("runVerifyPayout: hangs past 90s -> verifyStatus flips to timed_out with honest wording", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    // Build the full governance chain with successful (non-hanging) calls.
    mockSave.mockResolvedValueOnce("/governance-policy.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return GOV_POLICY;
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createGovPolicy({
        treasuryAddress: "rTreasury123",
        signers: [{ address: "rSigner1", role: "artist" }],
        threshold: 1,
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-proposal.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { proposalId: "payout-1" };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createProposal({
        proposalId: "payout-1",
        outputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-decision.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { decision: { outcome: "approved" } };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createDecision({
        approvals: [{ signerAddress: "rSigner1", approved: true, decidedAt: "2026-01-01T00:00:00Z" }],
        decidedBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-execution.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { executedBy: "rSigner1" };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createExecution({
        txHashes: ["TX1"],
        executedOutputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        executedBy: "rSigner1",
      });
    });

    expect(result.current.governance.executionPath).toBe("/payout-execution.json");

    // Now the actual timeout probe.
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    act(() => { result.current.runVerifyPayout(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.governance.verifyStatus).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.governance.verifyStatus).toBe("timed_out");
    expect(result.current.governance.error).toMatch(/timed out/i);
    expect(result.current.governance.error).not.toMatch(/\bfailed\b/i);

    resolve(null);
  });

  // ── createDecision / createExecution: same pattern, lighter proof ──
  // (identical dialog+ArtifactStatus shape to createPolicy/createGovPolicy/
  // createProposal, already proven above — these two confirm the
  // wrapper was actually wired at these two remaining call sites too,
  // not just structurally similar in theory.)

  it("createDecision: hangs past 90s -> decisionStatus flips to timed_out", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/governance-policy.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return GOV_POLICY;
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createGovPolicy({
        treasuryAddress: "rTreasury123",
        signers: [{ address: "rSigner1", role: "artist" }],
        threshold: 1,
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-proposal.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { proposalId: "payout-1" };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createProposal({
        proposalId: "payout-1",
        outputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-decision.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => {
      result.current.createDecision({
        approvals: [{ signerAddress: "rSigner1", approved: true, decidedAt: "2026-01-01T00:00:00Z" }],
        decidedBy: "rSigner1",
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_100); });

    expect(result.current.governance.decisionStatus).toBe("timed_out");
    expect(result.current.governance.error).toMatch(/timed out/i);

    resolve(null);
  });

  it("createExecution: hangs past 90s -> executionStatus flips to timed_out", async () => {
    const { result } = renderRelease();
    await setupVerifyReady(result);

    mockSave.mockResolvedValueOnce("/governance-policy.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return GOV_POLICY;
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createGovPolicy({
        treasuryAddress: "rTreasury123",
        signers: [{ address: "rSigner1", role: "artist" }],
        threshold: 1,
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-proposal.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { proposalId: "payout-1" };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createProposal({
        proposalId: "payout-1",
        outputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        createdBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-decision.json");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return { decision: { outcome: "approved" } };
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    await act(async () => {
      await result.current.createDecision({
        approvals: [{ signerAddress: "rSigner1", approved: true, decidedAt: "2026-01-01T00:00:00Z" }],
        decidedBy: "rSigner1",
      });
    });

    mockSave.mockResolvedValueOnce("/payout-execution.json");
    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "engine_call") return promise;
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    act(() => {
      result.current.createExecution({
        txHashes: ["TX1"],
        executedOutputs: [{ address: "rOut1", amount: "10", asset: "XRP", role: "artist", reason: "share" }],
        executedBy: "rSigner1",
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_100); });

    expect(result.current.governance.executionStatus).toBe("timed_out");
    expect(result.current.governance.error).toMatch(/timed out/i);

    resolve(null);
  });

  // ── Mint's own 90s semantics must be byte-for-byte unchanged ────
  // (release-trust.test.tsx already covers this exhaustively; this is
  // a single targeted check that the refactor into the shared wrapper
  // didn't alter mint's specific wording, which other tests assert on.)

  it("mint's own timeout wording is unchanged after factoring the race into the shared wrapper", async () => {
    const { result } = renderRelease();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      return undefined;
    });
    mockOpen.mockResolvedValueOnce({ path: "/m.json" } as any);
    await act(async () => { await result.current.loadManifest(); });
    mockOpen.mockResolvedValueOnce({ path: "/w.json" } as any);
    await act(async () => { await result.current.loadWallets(); });

    const { promise, resolve } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return promise;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/receipt.json");

    act(() => { result.current.runMint(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_100); });

    expect(result.current.mint.actionStatus).toBe("timed_out");
    expect(result.current.mint.error).toContain("Mint timed out. The transaction may still be processing. Check the receipt file or retry.");

    resolve(RECEIPT);
  });
});
