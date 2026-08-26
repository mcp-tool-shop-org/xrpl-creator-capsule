/**
 * F-7a08ed4a: "show an explicit error before falling back to the file
 * picker if [the sample] truly can't be found" — this half of the fix
 * needs the bundled sample import itself to be invalid, which requires
 * mocking the JSON module at the top level. That mock would leak into
 * every other test in StudioShell.test.tsx if it lived in the same
 * file (vi.mock is file-scoped but affects the WHOLE file's module
 * registry), so this scenario gets its own dedicated file instead —
 * same pattern already used elsewhere in this suite (release-timeout
 * .test.tsx / release-trust.test.tsx split out of release.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import React from "react";

// Must be declared before the StudioShell import below — vitest hoists
// vi.mock calls to the top of the file automatically, but this ordering
// documents the real dependency regardless.
vi.mock("../../../sample/demo-draft.json", () => ({
  default: { thisIsNotAValidStudioDraftShape: true },
}));

import { StudioProvider } from "../../state/studio";
import { ReleaseProvider } from "../../state/release";
import { StudioShell } from "./StudioShell";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

function renderStudioApp() {
  return render(
    React.createElement(
      ReleaseProvider,
      null,
      React.createElement(StudioProvider, null, React.createElement(StudioShell, null))
    )
  );
}

describe("Load Sample — malformed bundled sample (F-7a08ed4a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_file") throw new Error("File not found: no session yet");
      if (cmd === "save_file_atomic") return undefined;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an explicit, friendly error instead of silently falling back to the file picker when the bundled sample fails shape validation", async () => {
    renderStudioApp();
    await act(async () => { await vi.runAllTimersAsync(); });

    fireEvent.click(screen.getByText(/try the demo/i));
    await act(async () => { await Promise.resolve(); });

    expect(mockOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/missing or malformed/i)).toBeInTheDocument();
  });
});
