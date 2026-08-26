/**
 * F-c1d1c21a: ErrorBanner is the single chokepoint every error path in
 * the app renders through (13 call sites across the panels and Studio
 * pages, all passing a raw `err.message`-shaped string). Rather than
 * touching every call site, ErrorBanner itself now runs the raw text
 * through humanizeError() and renders the plain-language message with a
 * collapsed "Technical details" disclosure holding the untouched raw
 * text — so every existing caller gets humanization for free, and the
 * raw text is never discarded (support bundles / power users still need
 * it verbatim).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBanner } from "./PanelShell";

describe("ErrorBanner", () => {
  it("renders a humanized message instead of a raw developer-facing string", () => {
    const raw =
      "Bridge returned invalid JSON: Unexpected end of JSON input. stdout: '{\"ok\":tr', stderr: ''";
    render(<ErrorBanner message={raw} />);

    // A plain-language explanation must be visible as the primary text.
    expect(screen.getByText(/try again|restart/i)).toBeInTheDocument();
    // The raw dump is preserved (see the next test) but only inside the
    // collapsed technical-details <pre>, never as the headline itself —
    // i.e. it must not be its OWN top-level text node outside <pre>.
    const pre = screen.getByText(raw);
    expect(pre.tagName.toLowerCase()).toBe("pre");
  });

  it("keeps the raw text available, verbatim, behind a collapsed technical-details disclosure", () => {
    const raw = "Failed to read C:\\x\\y.json: The system cannot find the file specified. (os error 2)";
    render(<ErrorBanner message={raw} />);

    // Not deleted — present in the DOM inside the <details> disclosure,
    // even though it is visually collapsed by default.
    expect(screen.getByText(raw)).toBeInTheDocument();
    expect(screen.getByText(/technical details/i)).toBeInTheDocument();
  });

  it("does not mangle an already plain-language, hand-authored message", () => {
    const raw = "A mint is already in progress for this release. Wait for it to finish, or use Check Status.";
    render(<ErrorBanner message={raw} />);
    expect(screen.getByText(raw)).toBeInTheDocument();
  });

  it("renders nothing extra strange for an empty string (defensive)", () => {
    render(<ErrorBanner message="" />);
    // Must not throw; some fallback text should be present.
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
