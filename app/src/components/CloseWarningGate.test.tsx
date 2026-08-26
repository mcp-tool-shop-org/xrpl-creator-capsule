/**
 * F-10b68454 (frontend half): lib.rs's on_window_event handler blocks a
 * window close (api.prevent_close()) and emits "bridge-worker-close-
 * warning" when a bridge-worker call (e.g. an in-flight mint) may still
 * be running — a mid-mint worker may have already submitted an
 * irreversible XRPL transaction, so killing it blind on close would
 * destroy the in-flight receipt write, which is worse than the current
 * (invisible but recoverable-on-restart) status quo. CloseWarningGate is
 * the frontend half of that flow: it listens for the warning event and
 * shows a confirm dialog — "Wait" just dismisses it (the window stays
 * open, nothing killed), "Close Anyway" calls confirmCloseAndExit()
 * (kills tracked workers, then exits).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { CloseWarningGate } from "./CloseWarningGate";
import * as engineModule from "../bridge/engine";

const mockListen = vi.mocked(listen);

describe("CloseWarningGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to the bridge-worker-close-warning event on mount", () => {
    mockListen.mockResolvedValue(() => {});
    render(<CloseWarningGate />);

    expect(mockListen).toHaveBeenCalledWith("bridge-worker-close-warning", expect.any(Function));
  });

  it("renders nothing before the warning event fires", () => {
    mockListen.mockResolvedValue(() => {});
    render(<CloseWarningGate />);

    expect(screen.queryByText(/close anyway/i)).not.toBeInTheDocument();
  });

  it("shows a confirm dialog with Wait / Close Anyway when the warning event fires", async () => {
    let handler: (() => void) | undefined;
    mockListen.mockImplementation(async (_event, cb) => {
      handler = () => cb({ event: "bridge-worker-close-warning", id: 1, payload: undefined });
      return () => {};
    });

    render(<CloseWarningGate />);
    await waitFor(() => expect(handler).toBeDefined());
    act(() => { handler!(); });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /close anyway/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /wait/i })).toBeInTheDocument();
  });

  it("'Wait' dismisses the dialog without calling confirmCloseAndExit", async () => {
    const confirmSpy = vi.spyOn(engineModule, "confirmCloseAndExit").mockResolvedValue(undefined);
    let handler: (() => void) | undefined;
    mockListen.mockImplementation(async (_event, cb) => {
      handler = () => cb({ event: "bridge-worker-close-warning", id: 1, payload: undefined });
      return () => {};
    });

    render(<CloseWarningGate />);
    await waitFor(() => expect(handler).toBeDefined());
    act(() => { handler!(); });
    await waitFor(() => screen.getByRole("button", { name: /wait/i }));

    fireEvent.click(screen.getByRole("button", { name: /wait/i }));

    expect(screen.queryByRole("button", { name: /close anyway/i })).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("'Close Anyway' calls confirmCloseAndExit", async () => {
    const confirmSpy = vi.spyOn(engineModule, "confirmCloseAndExit").mockResolvedValue(undefined);
    let handler: (() => void) | undefined;
    mockListen.mockImplementation(async (_event, cb) => {
      handler = () => cb({ event: "bridge-worker-close-warning", id: 1, payload: undefined });
      return () => {};
    });

    render(<CloseWarningGate />);
    await waitFor(() => expect(handler).toBeDefined());
    act(() => { handler!(); });
    await waitFor(() => screen.getByRole("button", { name: /close anyway/i }));

    fireEvent.click(screen.getByRole("button", { name: /close anyway/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);

    const { unmount } = render(<CloseWarningGate />);
    await waitFor(() => expect(mockListen).toHaveBeenCalled());
    unmount();

    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});
