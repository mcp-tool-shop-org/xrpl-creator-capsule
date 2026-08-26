/**
 * F-15fcdca0: MintPanel's "Check Status" button (the TimeoutBanner's
 * onReconcile prop) was wired at onReconcile={loadReceipt} — a generic
 * native file-open dialog with no default path — even though
 * mint.receiptPath is already sitting in state. MintPanel now uses
 * release.reconcileReceipt() (re-reads the known path directly, mirrors
 * PublishPage's handleReconcile), falling back to the file picker only
 * when no receiptPath is on record at all.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { MintPanel } from "./MintPanel";
import * as releaseModule from "../../state/release";
import { MANIFEST } from "../../__test__/fixtures";
import type { ManifestState, MintState } from "../../state/release";

const mockOpen = vi.mocked(open);

const EMPTY_MANIFEST: ManifestState = {
  status: "loaded",
  path: "/m.json",
  data: MANIFEST,
  validation: null,
  resolution: null,
  stamp: null,
  error: null,
};

function baseMint(overrides: Partial<MintState>): MintState {
  return {
    status: "loaded",
    actionStatus: "idle",
    walletsPath: "/wallets.json",
    receiptPath: null,
    receipt: null,
    error: null,
    ...overrides,
  };
}

function mockUseRelease(mint: MintState, extra?: Partial<ReturnType<typeof releaseModule.useRelease>>) {
  vi.spyOn(releaseModule, "useRelease").mockReturnValue({
    manifest: EMPTY_MANIFEST,
    mint,
    loadWallets: vi.fn(),
    loadReceipt: vi.fn(),
    runMint: vi.fn(),
    saveReceiptTo: vi.fn(),
    reconcileReceipt: vi.fn(),
    network: "testnet",
    ...extra,
  } as unknown as ReturnType<typeof releaseModule.useRelease>);
}

describe("MintPanel Check Status (F-15fcdca0)", () => {
  it("calls reconcileReceipt (not the generic file dialog) when a receiptPath is already known", () => {
    const reconcileReceipt = vi.fn();
    const loadReceipt = vi.fn();
    mockUseRelease(
      baseMint({ actionStatus: "timed_out", receiptPath: "/known/receipt.json", error: "Mint timed out." }),
      { reconcileReceipt, loadReceipt }
    );

    render(<MintPanel />);
    fireEvent.click(screen.getByRole("button", { name: /check status/i }));

    expect(reconcileReceipt).toHaveBeenCalledTimes(1);
    expect(loadReceipt).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("falls back to the file picker (loadReceipt) only when no receiptPath is on record", () => {
    const reconcileReceipt = vi.fn();
    const loadReceipt = vi.fn();
    mockUseRelease(
      baseMint({ actionStatus: "timed_out", receiptPath: null, error: "Mint timed out." }),
      { reconcileReceipt, loadReceipt }
    );

    render(<MintPanel />);
    fireEvent.click(screen.getByRole("button", { name: /check status/i }));

    expect(loadReceipt).toHaveBeenCalledTimes(1);
    expect(reconcileReceipt).not.toHaveBeenCalled();
  });
});
