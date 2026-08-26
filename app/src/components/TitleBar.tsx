import { useEffect, useRef, useState } from "react";
import type { ReleaseIdentity } from "../state/release";
import { exportSupportBundle } from "../support/bundle";
import { ErrorBanner } from "./panels/PanelShell";

export type AppMode = "studio" | "advanced";

interface Props {
  mode: AppMode;
  onToggleMode: () => void;
  releaseIdentity?: ReleaseIdentity;
}

/** How long the success confirmation stays visible before auto-dismissing. */
const SUCCESS_NOTICE_MS = 5000;

type ExportResult = { type: "success"; path: string } | { type: "error"; message: string };

export function TitleBar({ mode, onToggleMode, releaseIdentity }: Props) {
  const hasRelease = !!(releaseIdentity?.title);
  const releaseLabel = hasRelease
    ? `${releaseIdentity!.title} — ${releaseIdentity!.artist}`
    : null;
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  /**
   * F-7f36d738: the "Report" button is the one feature this Public
   * Preview product explicitly asks users to rely on for reporting
   * problems — a try/catch with the comment "Silent -- best effort" that
   * left the button just reverting to its normal label on failure, with
   * zero indication anything went wrong, was exactly the wrong place for
   * that pattern. Both outcomes are now visible: success shows the saved
   * path, failure shows a real (humanized — F-c1d1c21a) error. A `null`
   * return (the user dismissed the save dialog) is deliberately NOT an
   * error — nothing was attempted, so nothing failed.
   */
  const handleExportBundle = async () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setExportResult(null);
    setExporting(true);
    try {
      const path = await exportSupportBundle(mode);
      if (path) {
        setExportResult({ type: "success", path });
        dismissTimer.current = setTimeout(() => setExportResult(null), SUCCESS_NOTICE_MS);
      }
    } catch (err) {
      setExportResult({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    setExporting(false);
  };

  return (
    <header
      data-tauri-drag-region
      style={{
        height: 38,
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-muted)",
        letterSpacing: "0.5px",
      }}
    >
      <span style={{ color: "var(--accent)" }}>CAPSULE</span>
      <span style={{ color: "var(--text-dim)" }}>|</span>
      <span>{mode === "studio" ? "Studio" : "Advanced"}</span>

      {/* Preview badge */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 3,
          background: "var(--warning)" + "25",
          color: "var(--warning)",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        Preview
      </span>

      {/* Active release indicator — always visible when a release is loaded */}
      {releaseLabel && (
        <>
          <span style={{ color: "var(--text-dim)" }}>|</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "var(--text-muted)",
              maxWidth: 300,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {releaseLabel}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} data-tauri-drag-region />

      {/* Support bundle export */}
      <div style={{ position: "relative" }}>
        <button
          onClick={handleExportBundle}
          disabled={exporting}
          title="Export support bundle for issue reports"
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-dim)",
            fontSize: 11,
            padding: "3px 8px",
            cursor: exporting ? "wait" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {exporting ? "Exporting..." : "Report"}
        </button>

        {/* F-7f36d738: feedback renders as a dropdown anchored below the
            button (the header itself is a fixed 38px strip with no room
            for a block-level banner) — success shows the saved path,
            failure shows a real, humanized error via ErrorBanner
            instead of the button silently reverting with no trace. */}
        {exportResult && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              width: 320,
              zIndex: 50,
              textAlign: "left",
            }}
          >
            {exportResult.type === "success" ? (
              <div
                style={{
                  background: "var(--success)" + "18",
                  border: "1px solid var(--success)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--success)",
                  wordBreak: "break-word",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Saved</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", wordBreak: "break-all" }}>
                  {exportResult.path}
                </div>
              </div>
            ) : (
              <ErrorBanner message={exportResult.message} />
            )}
          </div>
        )}
      </div>

      <button
        onClick={onToggleMode}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-dim)",
          fontSize: 11,
          padding: "3px 10px",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {mode === "studio" ? "Advanced" : "Studio"}
      </button>
    </header>
  );
}
