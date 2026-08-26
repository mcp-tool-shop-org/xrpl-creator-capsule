/**
 * Root-level React error boundary (F-b69d884a).
 *
 * Before this, no error boundary existed anywhere in the render tree
 * (main.tsx rendered ReleaseProvider/App directly), so React would
 * unmount the ENTIRE UI on any uncaught render-time exception, leaving
 * a non-technical creator staring at a blank window with no
 * explanation and no way back in.
 *
 * This was concretely reachable, not hypothetical: studio.tsx's
 * loadDraft() and session.ts's loadSession() used to JSON.parse(...)
 * disk content with no shape validation beyond a version check (see
 * F-343bb92d, now fixed) — a hand-edited or crash-truncated file could
 * pass the cast, land in React state, and crash the first component
 * that touched the bad field (e.g. `draft.collaborators.map(...)`).
 * Because the session autosaves every 2s, the same bad shape would be
 * written straight back to disk and reloaded on the very next launch —
 * so without this boundary, the crash would recur on EVERY subsequent
 * launch with no in-app recovery path.
 *
 * "Start Fresh" is the load-bearing action for exactly that scenario:
 * it clears the saved session (the thing that would otherwise
 * re-trigger the same crash) and reloads, so the next launch starts
 * from a genuinely blank slate instead of the same poisoned data.
 * "Try Again" is offered first for the more common transient case
 * (a bug unrelated to persisted data) where simply re-rendering fixes
 * it without discarding anything.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { logAction } from "./state/release";
import { clearSession } from "./state/session";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const buttonBase: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  cursor: "pointer",
  transition: "all 0.15s",
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The action log is the app's existing support-bundle mechanism
    // (support/bundle.ts reads getActionLog()) — logAction() is a plain
    // module-level function, reachable here with no dependency on
    // whichever provider happened to crash. Best-effort: this must
    // never be why the boundary itself fails to render.
    try {
      logAction({
        action: "render_crash",
        status: "error",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      });
    } catch {
      // ignored — see comment above
    }

    // Always ALSO console.error: the action log is in-memory only and
    // is exportable via the "Report" button in TitleBar, which is
    // itself part of the crashed tree and unavailable while hasError is
    // true — and is lost entirely once "Start Fresh" reloads the page.
    // console output is the durable trail for that case.
    console.error("Capsule crashed:", error, info.componentStack);
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false });
  };

  private handleStartFresh = async () => {
    try {
      await clearSession();
    } catch {
      // best-effort — still reload even if the clear itself failed, so
      // the user is never stuck on the crash screen with no way out
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: 32,
          textAlign: "center",
          gap: 16,
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong.</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 440, lineHeight: 1.6 }}>
          Your files are safe — nothing on your computer was deleted or changed.
          This was a problem inside the app itself.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            onClick={this.handleTryAgain}
            style={{
              ...buttonBase,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            Try Again
          </button>
          <button
            onClick={this.handleStartFresh}
            style={{
              ...buttonBase,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
            }}
          >
            Start Fresh
          </button>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-dim)", maxWidth: 440, marginTop: 8, lineHeight: 1.5 }}>
          "Start Fresh" clears the app's saved session (your in-progress draft) and
          restarts. Files you've already saved to disk — drafts, manifests, receipts —
          are not touched. If the same problem keeps happening on every launch, this is
          usually the fix.
        </div>
      </div>
    );
  }
}
