/**
 * F-7f36d738: handleExportBundle wrapped exportSupportBundle() in a
 * try/catch with the comment "Silent -- best effort" — if the export
 * failed for any reason, the "Report" button just reverted to its
 * normal label with zero indication anything went wrong. This is the
 * one feature the app explicitly asks users to rely on for reporting
 * problems, so a silent failure here is the worst possible place for
 * one. Both halves of the fix:
 *   1. Success now shows a brief confirmation with the saved path.
 *   2. Failure now shows a visible, humanized error (via ErrorBanner —
 *      F-c1d1c21a) instead of silently reverting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TitleBar } from "./TitleBar";
import * as bundleModule from "../support/bundle";

describe("TitleBar Report button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a success confirmation with the saved path after a successful export", async () => {
    vi.spyOn(bundleModule, "exportSupportBundle").mockResolvedValue("/home/me/capsule-support-123.json");

    render(<TitleBar mode="studio" onToggleMode={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/capsule-support-123\.json/)).toBeInTheDocument();
  });

  it("shows nothing alarming (no error) when the user cancels the save dialog (null path, not a failure)", async () => {
    vi.spyOn(bundleModule, "exportSupportBundle").mockResolvedValue(null);

    render(<TitleBar mode="studio" onToggleMode={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument();
  });

  it("shows a visible, humanized error instead of silently reverting when export fails", async () => {
    vi.spyOn(bundleModule, "exportSupportBundle").mockRejectedValue(
      new Error("Failed to write /home/me/bundle.json: Access is denied. (os error 5)")
    );

    render(<TitleBar mode="studio" onToggleMode={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    await waitFor(() => {
      expect(screen.getByText(/permission/i)).toBeInTheDocument();
    });
    // The raw text must still be available (never discarded), just not
    // as the headline — see PanelShell.test.tsx for the general contract.
    expect(screen.getByText(/technical details/i)).toBeInTheDocument();
  });

  it("returns the button to its normal usable state after a failure (not stuck on 'Exporting...')", async () => {
    vi.spyOn(bundleModule, "exportSupportBundle").mockRejectedValue(new Error("boom"));

    render(<TitleBar mode="studio" onToggleMode={() => {}} />);
    const button = screen.getByRole("button", { name: /report/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
    expect(button).toHaveTextContent(/report/i);
  });
});
