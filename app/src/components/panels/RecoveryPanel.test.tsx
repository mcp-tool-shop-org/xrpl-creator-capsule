/**
 * F-51fa8088: the Token IDs section maps over recovery.result.bundle
 * .tokenIds and reads txHashes[i] ?? "" alongside each one with no check
 * that the two arrays share a length — a receipt/bundle with mismatched
 * array lengths rendered a blank Tx Hash for the affected token with no
 * indication the mismatch itself is a data-integrity problem worth
 * investigating (a malformed bundle was invisible, not visible).
 *
 * Fix: guard mismatched lengths — render an explicit missing-value
 * marker (not "") so a gap is visibly a gap, and flag the mismatch
 * itself as its own check row, consistent with the panel's other check
 * rows (Bundle Consistency / Chain Verification).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryPanel } from "./RecoveryPanel";
import * as releaseModule from "../../state/release";
import { MANIFEST, RECEIPT, RECOVERY_BUNDLE, RECOVER_RESULT } from "../../__test__/fixtures";
import type { ManifestState, MintState, AccessState, RecoveryState } from "../../state/release";

const LOADED_MANIFEST: ManifestState = {
  status: "loaded", path: "/m.json", data: MANIFEST, validation: null, resolution: null, stamp: null, error: null,
};
const LOADED_MINT: MintState = {
  status: "loaded", actionStatus: "done", walletsPath: null, receiptPath: "/r.json", receipt: RECEIPT, error: null,
};
const EMPTY_ACCESS: AccessState = {
  policyStatus: "empty", policyPath: null, policy: null, grantStatus: "idle", grant: null, walletAddress: "", error: null,
};

function mockUseRelease(recovery: RecoveryState) {
  vi.spyOn(releaseModule, "useRelease").mockReturnValue({
    manifest: LOADED_MANIFEST,
    mint: LOADED_MINT,
    access: EMPTY_ACCESS,
    recovery,
    runRecover: vi.fn(),
    runReplay: vi.fn(),
  } as unknown as ReturnType<typeof releaseModule.useRelease>);
}

describe("RecoveryPanel tokenIds/txHashes mismatch (F-51fa8088)", () => {
  it("renders normally with no mismatch warning when arrays share a length", () => {
    mockUseRelease({
      status: "done",
      result: RECOVER_RESULT,
      bundlePath: "/recovery.json",
      replayHolder: null,
      replayNonHolder: null,
      replayStatus: "idle",
      error: null,
    });

    render(<RecoveryPanel />);

    expect(screen.queryByText(/mismatch/i)).not.toBeInTheDocument();
  });

  it("flags a mismatch as its own check row when tokenIds and txHashes have different lengths", () => {
    const mismatchedBundle = {
      ...RECOVERY_BUNDLE,
      tokenIds: ["TOKEN_A", "TOKEN_B", "TOKEN_C"],
      txHashes: ["TX_A"],
    };
    mockUseRelease({
      status: "done",
      result: { ...RECOVER_RESULT, bundle: mismatchedBundle },
      bundlePath: "/recovery.json",
      replayHolder: null,
      replayNonHolder: null,
      replayStatus: "idle",
      error: null,
    });

    render(<RecoveryPanel />);

    expect(screen.getAllByText(/mismatch/i).length).toBeGreaterThan(0);
    // The genuinely-present pair (index 0) still renders normally.
    expect(screen.getByText("TOKEN_A")).toBeInTheDocument();
    expect(screen.getByText("TX_A")).toBeInTheDocument();
  });

  it("renders an explicit, mismatch-specific missing-value marker (distinct from ArtifactField's generic '—' for an ordinarily-absent value) for a token with no corresponding tx hash", () => {
    const mismatchedBundle = {
      ...RECOVERY_BUNDLE,
      tokenIds: ["TOKEN_A", "TOKEN_B"],
      txHashes: ["TX_A"],
    };
    mockUseRelease({
      status: "done",
      result: { ...RECOVER_RESULT, bundle: mismatchedBundle },
      bundlePath: "/recovery.json",
      replayHolder: null,
      replayNonHolder: null,
      replayStatus: "idle",
      error: null,
    });

    render(<RecoveryPanel />);

    expect(screen.getByText("TOKEN_B")).toBeInTheDocument();
    // Specifically tied to the mismatch — not a bare "—", which
    // ArtifactField already renders for ANY empty value and would be
    // indistinguishable from "this entry legitimately has no hash".
    expect(screen.getByText(/missing.*mismatch|mismatch.*missing/i)).toBeInTheDocument();
  });

  it("does not silently drop an ORPHANED tx hash that has no corresponding token ID (txHashes longer than tokenIds)", () => {
    // The original .map() iterated over tokenIds only — an extra
    // txHashes entry beyond tokenIds.length was never rendered at all,
    // not even as a blank row. This is the more severe direction of the
    // same bug: total invisibility, not just a blank value.
    const mismatchedBundle = {
      ...RECOVERY_BUNDLE,
      tokenIds: ["TOKEN_A"],
      txHashes: ["TX_A", "TX_ORPHANED"],
    };
    mockUseRelease({
      status: "done",
      result: { ...RECOVER_RESULT, bundle: mismatchedBundle },
      bundlePath: "/recovery.json",
      replayHolder: null,
      replayNonHolder: null,
      replayStatus: "idle",
      error: null,
    });

    render(<RecoveryPanel />);

    expect(screen.getByText("TX_ORPHANED")).toBeInTheDocument();
    expect(screen.getAllByText(/mismatch/i).length).toBeGreaterThan(0);
  });
});
