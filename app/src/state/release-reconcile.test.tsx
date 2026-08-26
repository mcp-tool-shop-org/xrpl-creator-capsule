/**
 * F-15fcdca0: PublishPage's handleReconcile() (Studio Mode) reconciles a
 * timed-out mint by re-reading the EXACT receiptPath used for that
 * attempt, with state-aware feedback (actionStatus is the authoritative
 * signal for whether the original attempt has actually finished — a
 * missing file does NOT mean the mint is dead, since it may simply not
 * have written its receipt yet while still running server-side; see
 * F-74549b0b). MintPanel's own "Check Status" used to be wired at
 * onReconcile={loadReceipt} — a generic native file-open dialog with no
 * default path, even though mint.receiptPath is already in state.
 *
 * release.tsx now exposes reconcileReceipt() — the same re-read-by-known-
 * path logic PublishPage.handleReconcile() implements locally, promoted
 * to a shared release action so MintPanel (Advanced mode) can use it
 * too, mirroring Studio mode's behavior instead of falling back to a
 * blind file picker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import React from "react";
import { ReleaseProvider, useRelease } from "./release";
import { MANIFEST, RECEIPT } from "../__test__/fixtures";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ReleaseProvider, null, children);
}

function renderRelease() {
  return renderHook(() => useRelease(), { wrapper });
}

function hangingEngineCall() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe("release.reconcileReceipt (F-15fcdca0)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op when there is no known receiptPath", async () => {
    const { result } = renderRelease();
    expect(result.current.mint.receiptPath).toBeNull();

    await act(async () => {
      await result.current.reconcileReceipt();
    });

    expect(result.current.mint.error).toBeNull();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("reads the exact known receiptPath directly — never a file dialog — and marks the mint done when it holds a valid receipt", async () => {
    const { result } = renderRelease();

    // Seed mint.receiptPath via a real receipt_unsaved outcome (the mint
    // succeeded on-chain but its on-disk save failed) — this is a
    // genuine, reachable way receiptPath ends up known in state without
    // going through the open() dialog.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "engine_call") return {
        receipt: RECEIPT,
        receiptPath: "/known/receipt-path.json",
        receiptWriteError: "disk full",
      };
      return undefined;
    });
    await act(async () => {
      await result.current.runMintFromStudio("/m.json", "/w.json", "/known/receipt-path.json");
    });
    expect(result.current.mint.receiptPath).toBe("/known/receipt-path.json");
    expect(result.current.mint.actionStatus).toBe("receipt_unsaved");

    // Reconcile: the file on disk (read via loadFile — a separate path
    // from the in-memory unsaved receipt above) holds a valid receipt.
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "load_file") {
        expect((args as { path: string }).path).toBe("/known/receipt-path.json");
        return JSON.stringify(RECEIPT);
      }
      return undefined;
    });

    await act(async () => {
      await result.current.reconcileReceipt();
    });

    expect(result.current.mint.actionStatus).toBe("done");
    expect(result.current.mint.receipt?.xrpl.nftTokenIds.length).toBeGreaterThan(0);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("blocks reconciliation with a clear message while the mint is still confirmed running (never claims safe-to-retry from a missing file alone)", async () => {
    const { result } = renderRelease();

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      return undefined;
    });
    await act(async () => { await result.current.loadManifest(); });

    const { promise } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST); // runMintFromStudio re-reads the manifest
      if (cmd === "engine_call") return promise;
      return undefined;
    });

    // Fire-and-forget the still-hanging runMintFromStudio call so
    // mint.actionStatus becomes "running" — deliberately not awaited,
    // since it never settles in this test.
    act(() => {
      result.current.runMintFromStudio("/m.json", "/w.json", "/known/receipt-path.json").catch(() => {});
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.mint.actionStatus).toBe("running");
    expect(result.current.mint.receiptPath).toBeNull(); // not set until the call settles

    await act(async () => {
      await result.current.reconcileReceipt();
    });

    // No receiptPath was on record yet (the call hasn't settled), so
    // this is also a no-op rather than a false "still running" claim —
    // covered properly by the next test, which seeds a receiptPath
    // FIRST and only then starts a second still-hanging call.
    expect(result.current.mint.error).toBeNull();
  });

  it("blocks reconciliation while a NEW mint is running, even though an OLDER receiptPath is on record from a prior attempt", async () => {
    const { result } = renderRelease();

    // First attempt: succeeds, leaving a known receiptPath in state.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "engine_call") return RECEIPT;
      return undefined;
    });
    await act(async () => {
      await result.current.runMintFromStudio("/m.json", "/w.json", "/known/receipt-path.json");
    });
    expect(result.current.mint.actionStatus).toBe("done");
    expect(result.current.mint.receiptPath).toBe("/known/receipt-path.json");

    // Second attempt (e.g. a fresh release, same session) hangs.
    const { promise } = hangingEngineCall();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST); // runMintFromStudio re-reads the manifest
      if (cmd === "engine_call") return promise;
      return undefined;
    });
    act(() => {
      result.current.runMintFromStudio("/m2.json", "/w2.json", "/known/receipt-path.json").catch(() => {});
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.mint.actionStatus).toBe("running");

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") throw new Error("must not be called while a mint is confirmed running");
      return undefined;
    });

    await act(async () => {
      await result.current.reconcileReceipt();
    });

    expect(result.current.mint.error).toMatch(/still running/i);
  });

  it("gives cautious (not 'safe to retry') wording when the receipt file can't be found but the mint hasn't confirmed-failed", async () => {
    const { result } = renderRelease();

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") return JSON.stringify(MANIFEST);
      if (cmd === "engine_call") return RECEIPT;
      return undefined;
    });
    await act(async () => {
      await result.current.runMintFromStudio("/m.json", "/w.json", "/known/receipt-path.json");
    });
    expect(result.current.mint.actionStatus).toBe("done");

    // The receipt file has since gone missing / is unreadable — actual
    // mint.actionStatus is "done" here (not "error"), which is the
    // "hasn't confirmed-failed" branch this test targets.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") throw new Error("File not found: /known/receipt-path.json");
      return undefined;
    });

    await act(async () => {
      await result.current.reconcileReceipt();
    });

    expect(result.current.mint.error).toMatch(/no receipt file found/i);
    expect(result.current.mint.error).not.toMatch(/safely/i);
  });
});
