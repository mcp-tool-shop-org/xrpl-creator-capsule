/**
 * GA Hardening — Mode-Switch & Timeout Trust
 *
 * Closes the two remaining trust gaps in the desktop app:
 * 1. Studio ↔ Advanced mode-switch preserves release identity and state
 * 2. Mint timeout lands in timed_out (not generic error), reconciliation
 *    recovers truth, and retry does not create false duplicate-success
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import React from "react";
import {
  ReleaseProvider,
  useRelease,
  getActionLog,
  clearActionLog,
} from "./release";
import { StudioProvider, useStudio } from "./studio";
import { MANIFEST, RECEIPT } from "../__test__/fixtures";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

// ── Wrappers ──────────────────────────────────────────────────────

function CombinedWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    ReleaseProvider, null,
    React.createElement(StudioProvider, null, children),
  );
}

function ReleaseWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ReleaseProvider, null, children);
}

function useCombined() {
  return { release: useRelease(), studio: useStudio() };
}

function renderCombined() {
  return renderHook(() => useCombined(), { wrapper: CombinedWrapper });
}

function renderRelease() {
  return renderHook(() => useRelease(), { wrapper: ReleaseWrapper });
}

// ── Shared setup: load manifest + wallets into ReleaseProvider ────

async function setupMintReady(result: { current: ReturnType<typeof useRelease> }) {
  // Load manifest
  mockOpen.mockResolvedValueOnce({ path: "/m.json" } as any);
  await act(async () => { await result.current.loadManifest(); });

  // Load wallets
  mockOpen.mockResolvedValueOnce({ path: "/w.json" } as any);
  await act(async () => { await result.current.loadWallets(); });
}

// ═══════════════════════════════════════════════════════════════════
// 1. MODE-SWITCH PRESERVATION
// ═══════════════════════════════════════════════════════════════════

describe("mode-switch preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clearActionLog();
    // Default mock: loadFile returns manifest/receipt, saveFile succeeds
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return RECEIPT;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("release identity survives Studio → Advanced switch", async () => {
    const { result } = renderCombined();
    await act(async () => { await vi.runAllTimersAsync(); });

    // Mint via Studio
    await act(async () => {
      await result.current.release.runMintFromStudio("/m.json", "/w.json", "/r.json");
    });

    // Identity is populated
    expect(result.current.release.releaseIdentity.manifestId).toBe("manifest-abc-123");
    expect(result.current.release.releaseIdentity.title).toBe("Test Release");
    expect(result.current.release.releaseIdentity.artist).toBe("Test Artist");
    expect(result.current.release.releaseIdentity.network).toBe("testnet");

    // All release state intact (what Advanced mode reads)
    expect(result.current.release.manifest.status).toBe("loaded");
    expect(result.current.release.mint.actionStatus).toBe("done");
    expect(result.current.release.mint.receipt?.manifestId).toBe("manifest-abc-123");
  });

  it("Studio draft is independent from release state across modes", async () => {
    const { result } = renderCombined();
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { result.current.studio.updateDraft({ title: "My Album", artist: "Me" }); });

    await act(async () => {
      await result.current.release.runMintFromStudio("/m.json", "/w.json", "/r.json");
    });

    // Draft and manifest are independent
    expect(result.current.studio.draft.title).toBe("My Album");
    expect(result.current.release.manifest.data?.title).toBe("Test Release");
  });

  it("loading new manifest in Advanced does not corrupt Studio draft", async () => {
    const { result } = renderCombined();
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => {
      result.current.studio.updateDraft({ title: "Precious", benefitDescription: "Bonus" });
      result.current.studio.setActiveStep("review");
    });

    // Load manifest in Advanced mode
    mockOpen.mockResolvedValueOnce({ path: "/new-manifest.json" } as any);
    await act(async () => { await result.current.release.loadManifest(); });

    // Release downstream reset
    expect(result.current.release.mint.status).toBe("empty");

    // Studio draft untouched
    expect(result.current.studio.draft.title).toBe("Precious");
    expect(result.current.studio.activeStep).toBe("review");
  });

  it("resetAll does not affect Studio draft", async () => {
    const { result } = renderCombined();
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { result.current.studio.updateDraft({ title: "Keep This" }); });
    await act(async () => {
      await result.current.release.runMintFromStudio("/m.json", "/w.json", "/r.json");
    });

    act(() => { result.current.release.resetAll(); });

    expect(result.current.release.manifest.status).toBe("empty");
    expect(result.current.studio.draft.title).toBe("Keep This");
  });

  it("mint done from Release A does not bleed after loading Release B", async () => {
    const { result } = renderCombined();
    await act(async () => { await vi.runAllTimersAsync(); });

    // Mint Release A
    await act(async () => {
      await result.current.release.runMintFromStudio("/m.json", "/w.json", "/r.json");
    });
    expect(result.current.release.mint.actionStatus).toBe("done");

    // Load Release B via picker (triggers downstream reset)
    mockOpen.mockResolvedValueOnce({ path: "/m2.json" } as any);
    await act(async () => { await result.current.release.loadManifest(); });

    // Release A's mint state must be fully cleared
    expect(result.current.release.mint.actionStatus).toBe("idle");
    expect(result.current.release.mint.receipt).toBeNull();
    expect(result.current.release.mint.receiptPath).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. TIMEOUT / RECONCILIATION / RETRY
// ═══════════════════════════════════════════════════════════════════

describe("mint timeout and reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clearActionLog();
    // Default: loadFile returns manifest, saveFile succeeds
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mint times out at 90s and lands in timed_out, not generic error", async () => {
    const { result } = renderRelease();

    await setupMintReady(result);

    // Set up hanging engine call + save dialog
    let hangResolve!: (v: unknown) => void;
    const hangingMint = new Promise((resolve) => { hangResolve = resolve; });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return hangingMint;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/receipt.json");

    // Start mint — don't await, it will hang
    let mintSettled = false;
    act(() => {
      result.current.runMint().finally(() => { mintSettled = true; });
    });

    // Let Promise.race set up
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.mint.actionStatus).toBe("running");

    // Advance past 90s timeout
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    // Must be timed_out, NOT error
    expect(result.current.mint.actionStatus).toBe("timed_out");
    expect(result.current.mint.error).toContain("timed out");
    expect(result.current.mint.error).toContain("may still be processing");

    // Action log records timed_out with reason
    const timeoutEntry = getActionLog().find(e => e.status === "timed_out");
    expect(timeoutEntry).toBeDefined();
    expect(timeoutEntry!.timeoutReason).toBe("90s exceeded");

    hangResolve(RECEIPT); // cleanup
  });

  it("reconciliation: loading receipt after timeout recovers truth", async () => {
    const { result } = renderRelease();

    await setupMintReady(result);

    // Time out a mint
    let hangResolve!: (v: unknown) => void;
    const hang = new Promise((resolve) => { hangResolve = resolve; });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return hang;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/receipt.json");

    act(() => { result.current.runMint().catch(() => {}); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.mint.actionStatus).toBe("timed_out");
    expect(result.current.mint.receipt).toBeNull();

    // RECONCILIATION: load the receipt that actually landed on-chain
    mockOpen.mockResolvedValueOnce({ path: "/out/receipt.json" } as any);
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(RECEIPT);
      if (cmd === "save_file") return undefined;
      return undefined;
    });

    await act(async () => { await result.current.loadReceipt(); });

    // Truth recovered
    expect(result.current.mint.status).toBe("loaded");
    expect(result.current.mint.receipt?.manifestId).toBe("manifest-abc-123");
    expect(result.current.mint.receiptPath).toBe("/out/receipt.json");
    expect(result.current.mint.error).toBeNull();

    hangResolve(RECEIPT);
  });

  it("retry while the original mint is still unresolved is blocked, and the original's result is preserved when it lands (F-74549b0b)", async () => {
    // This replaces a prior version of this test that asserted the
    // OPPOSITE of what's safe: it let a retry "succeed immediately"
    // while the first mint's engine_call promise (hang1) was still
    // unresolved, and only resolved hang1 as post-assertion "cleanup".
    // That is precisely the double-mint hole from F-74549b0b — if both
    // the original and the retry are real mint_release calls, and both
    // eventually succeed, the same release gets minted twice on the
    // XRPL ledger. The correct contract is: no second dispatch is
    // allowed until the first is confirmed settled.
    const { result } = renderRelease();

    await setupMintReady(result);

    // First mint: hangs (simulates a mint that's still running server-side
    // when the client-side 90s timeout fires).
    let hang1Resolve!: (v: unknown) => void;
    const hang1 = new Promise((resolve) => { hang1Resolve = resolve; });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return hang1;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/receipt-1.json");

    act(() => { result.current.runMint().catch(() => {}); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.mint.actionStatus).toBe("timed_out");
    const engineCallsAfterTimeout = mockInvoke.mock.calls.filter(([cmd]) => cmd === "engine_call").length;
    expect(engineCallsAfterTimeout).toBe(1);

    // Attempt an immediate retry WHILE hang1 (the original) is still
    // unresolved — this must be blocked, not dispatched.
    mockSave.mockResolvedValueOnce("/out/receipt-2.json");
    await act(async () => {
      await result.current.runMint();
    });

    // No second engine_call was ever made.
    const engineCallsAfterBlockedRetry = mockInvoke.mock.calls.filter(([cmd]) => cmd === "engine_call").length;
    expect(engineCallsAfterBlockedRetry).toBe(1);
    // The blocked attempt must not fabricate a success.
    expect(result.current.mint.actionStatus).not.toBe("done");
    expect(result.current.mint.error).toMatch(/already in progress/i);

    // NOW let the original settle.
    await act(async () => {
      hang1Resolve(RECEIPT);
      await vi.advanceTimersByTimeAsync(0);
    });

    // The original's own result lands cleanly — nothing was lost, and
    // still only ONE mint was ever actually dispatched.
    expect(result.current.mint.actionStatus).toBe("done");
    expect(result.current.mint.receiptPath).toBe("/out/receipt-1.json");
    expect(result.current.mint.receipt?.manifestId).toBe("manifest-abc-123");
    const engineCallsAfterSettle = mockInvoke.mock.calls.filter(([cmd]) => cmd === "engine_call").length;
    expect(engineCallsAfterSettle).toBe(1);
  });

  it("a genuine retry is allowed once the prior attempt has actually finished (F-74549b0b)", async () => {
    const { result } = renderRelease();

    await setupMintReady(result);

    // The previous test's blocked retry attempt returns before ever
    // calling save() (the guard fires first), which can leave an unused
    // queued mockResolvedValueOnce sitting in this mock's queue —
    // vi.clearAllMocks() clears call history but not queued
    // once-implementations. Start this test with a clean queue.
    mockSave.mockReset();

    // First attempt: fails for a real (non-timeout) reason, so it is
    // definitely, confirmedly finished.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") throw new Error("Insufficient reserve");
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/receipt-1.json");

    await act(async () => { await result.current.runMint(); });
    expect(result.current.mint.actionStatus).toBe("error");

    // Retry now — the prior attempt is confirmed dead, so this must be
    // allowed to actually dispatch and succeed.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return RECEIPT;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/receipt-2.json");

    await act(async () => { await result.current.runMint(); });

    expect(result.current.mint.actionStatus).toBe("done");
    expect(result.current.mint.receiptPath).toBe("/out/receipt-2.json");
    expect(result.current.mint.receipt?.manifestId).toBe("manifest-abc-123");
    expect(result.current.mint.error).toBeNull();
  });

  it("timed_out is distinct from error in both state and action log", async () => {
    const { result } = renderRelease();

    await setupMintReady(result);

    // First: a real error
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") throw new Error("Network unreachable");
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/r1.json");

    await act(async () => { await result.current.runMint(); });
    expect(result.current.mint.actionStatus).toBe("error");
    expect(result.current.mint.error).toBe("Network unreachable");

    // Then: a timeout
    let hangResolve!: (v: unknown) => void;
    const hang = new Promise((resolve) => { hangResolve = resolve; });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "save_file") return undefined;
      if (cmd === "engine_call") return hang;
      return undefined;
    });
    mockSave.mockResolvedValueOnce("/out/r2.json");

    act(() => { result.current.runMint().catch(() => {}); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    // State distinguishes timeout from error
    expect(result.current.mint.actionStatus).toBe("timed_out");
    expect(result.current.mint.error).not.toBe("Network unreachable");
    expect(result.current.mint.error).toContain("timed out");

    hangResolve(RECEIPT);
  });
});
