/**
 * F-b69d884a: no React error boundary existed anywhere in the render
 * tree. This is concretely reachable (not hypothetical): a malformed
 * *-draft.json or capsule-session.json used to pass a JSON.parse cast
 * with no shape validation, land in React state, and crash the first
 * component that touched the bad field — and since the session
 * autosaves every 2s, the same bad shape would be written back and
 * reloaded on the very next launch, locking a non-technical creator out
 * of the whole app with no in-app explanation.
 *
 * F-343bb92d's validators close the specific crash vector this test
 * uses to trigger a render-time throw, but the boundary itself is the
 * general-purpose escape hatch for ANY uncaught render error, not just
 * that one — so it is tested independently, with a component that
 * throws directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { getActionLog, clearActionLog } from "./state/release";

function Bomb(): never {
  throw new Error("collaborators.filter is not a function");
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearActionLog();
    // React itself also logs the caught error to console.error during
    // its own error-boundary handling — silence that noise but keep the
    // spy so we can assert our OWN explicit console.error call happened.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a render-time throw and shows a plain-language fallback instead of a blank/crashed screen", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/your files are safe/i)).toBeInTheDocument();
    // Must not still be trying to render the crashed subtree.
    expect(screen.queryByText("All good")).not.toBeInTheDocument();
  });

  it("offers both a Try Again action and a Start Fresh action", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start fresh/i })).toBeInTheDocument();
  });

  it("logs the caught error into the action log (support-bundle mechanism) and to console.error", () => {
    expect(getActionLog()).toHaveLength(0);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    const entries = getActionLog();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.status === "error")).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("Try Again clears the error and attempts to re-render children", () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("transient");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Simulate the underlying condition having cleared before retrying.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("Start Fresh clears the saved session and reloads the app — the load-bearing escape hatch for a crash-looping malformed draft", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = vi.mocked(invoke);
    const saveCalls: Array<{ path: string; content: string }> = [];
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "save_file") {
        saveCalls.push(args as { path: string; content: string });
        return undefined;
      }
      if (cmd === "load_file") throw new Error("no session yet");
      return undefined;
    });

    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // jsdom's real location.reload throws "not implemented" — replace
    // the whole object so the click handler's call is observable.
    // @ts-expect-error -- intentionally replacing a readonly global for the test
    delete window.location;
    // @ts-expect-error -- reassigning a readonly global for the test
    window.location = { ...originalLocation, reload: reloadSpy };

    try {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByRole("button", { name: /start fresh/i }));

      // clearSession() is async (awaits appDataDir() + saveFile) —
      // let its microtasks/promises settle.
      await vi.waitFor(() => expect(saveCalls.length).toBeGreaterThanOrEqual(1));

      const written = JSON.parse(saveCalls[saveCalls.length - 1].content);
      // clearSession() writes INIT_SESSION — a blank draft, so the very
      // next launch does NOT re-crash on the same malformed data.
      expect(written.draft).toBeNull();
      expect(reloadSpy).toHaveBeenCalled();
    } finally {
      // @ts-expect-error -- restoring the readonly global after the test
      window.location = originalLocation;
    }
  });
});
