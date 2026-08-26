/**
 * Integration coverage for F-bd945889 (resetDraft/resetAll were fully
 * implemented and unit-tested but never wired to any discoverable UI)
 * and its interplay with StudioShell's welcome-screen visibility.
 *
 * StudioSidebar and StudioShell are siblings under the same
 * StudioProvider/ReleaseProvider (mirroring App.tsx's real nesting) —
 * this is the first component-render test in this codebase (existing
 * coverage is all renderHook-based), used here because the bug is
 * specifically about UI *discoverability* and cross-component state
 * agreement, which a hook test cannot observe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { StudioProvider } from "../../state/studio";
import { ReleaseProvider } from "../../state/release";
import { StudioSidebar } from "./StudioSidebar";
import { StudioShell } from "./StudioShell";

const mockInvoke = vi.mocked(invoke);

function renderStudioApp() {
  return render(
    React.createElement(
      ReleaseProvider,
      null,
      React.createElement(
        StudioProvider,
        null,
        React.createElement(StudioSidebar, { onSwitchToAdvanced: () => {} }),
        React.createElement(StudioShell, null)
      )
    )
  );
}

describe("Start a new release (F-bd945889)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") throw new Error("No session");
      if (cmd === "save_file") return undefined;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is discoverable: a 'Start a New Release' action exists in the persistent sidebar", async () => {
    renderStudioApp();
    await act(async () => { await vi.runAllTimersAsync(); });

    // Dismiss the initial welcome screen so we're looking at ordinary
    // in-progress-release chrome, same as any repeat user.
    fireEvent.click(screen.getByText(/create a release/i));

    expect(screen.getByText(/start a new release/i)).toBeInTheDocument();
  });

  it("asks for confirmation before destroying the current draft", async () => {
    renderStudioApp();
    await act(async () => { await vi.runAllTimersAsync(); });

    fireEvent.click(screen.getByText(/create a release/i));

    const titleInput = screen.getByPlaceholderText(/my amazing album/i);
    fireEvent.change(titleInput, { target: { value: "Precious Unsaved Work" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); }); // let autosave settle

    fireEvent.click(screen.getByText(/start a new release/i));

    // Draft must NOT be cleared yet — only after explicit confirmation.
    expect(screen.getByDisplayValue("Precious Unsaved Work")).toBeInTheDocument();
    expect(screen.getByText(/clears the current draft/i)).toBeInTheDocument();
  });

  it("confirming clears the draft, calls resetAll, and brings the Welcome screen back", async () => {
    renderStudioApp();
    await act(async () => { await vi.runAllTimersAsync(); });

    // Dismiss welcome, type something so there's a real draft to lose.
    fireEvent.click(screen.getByText(/create a release/i));
    const titleInput = screen.getByPlaceholderText(/my amazing album/i);
    fireEvent.change(titleInput, { target: { value: "Precious Unsaved Work" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    // Confirm the reset.
    fireEvent.click(screen.getByText(/start a new release/i));
    fireEvent.click(screen.getByText(/^start new$/i));

    // WelcomePage's distinctive copy is back — this is the concrete,
    // previously-broken interplay: StudioShell used to gate on a
    // component-local "welcomed" flag that resetDraft() had no way to
    // reach, so Welcome would NOT reappear after a reset. The reset
    // itself is synchronous, so no extra waiting is needed — findBy*'s
    // polling wait interacts badly with fake timers in this suite.
    expect(screen.getByText(/welcome to capsule/i)).toBeInTheDocument();
  });

  it("cancelling the confirmation leaves the draft untouched", async () => {
    renderStudioApp();
    await act(async () => { await vi.runAllTimersAsync(); });

    fireEvent.click(screen.getByText(/create a release/i));
    const titleInput = screen.getByPlaceholderText(/my amazing album/i);
    fireEvent.change(titleInput, { target: { value: "Precious Unsaved Work" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    fireEvent.click(screen.getByText(/start a new release/i));
    fireEvent.click(screen.getByText(/^cancel$/i));

    expect(screen.getByDisplayValue("Precious Unsaved Work")).toBeInTheDocument();
    expect(screen.queryByText(/welcome to capsule/i)).not.toBeInTheDocument();
  });
});
