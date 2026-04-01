import { useState } from "react";
import type { ReleaseIdentity } from "../state/release";
import { exportSupportBundle } from "../support/bundle";

export type AppMode = "studio" | "advanced";

interface Props {
  mode: AppMode;
  onToggleMode: () => void;
  releaseIdentity?: ReleaseIdentity;
}

export function TitleBar({ mode, onToggleMode, releaseIdentity }: Props) {
  const hasRelease = !!(releaseIdentity?.title);
  const releaseLabel = hasRelease
    ? `${releaseIdentity!.title} — ${releaseIdentity!.artist}`
    : null;
  const [exporting, setExporting] = useState(false);

  const handleExportBundle = async () => {
    setExporting(true);
    try {
      await exportSupportBundle(mode);
    } catch {
      // Silent — best effort
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
