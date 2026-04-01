export type AppMode = "studio" | "advanced";

interface Props {
  mode: AppMode;
  onToggleMode: () => void;
}

export function TitleBar({ mode, onToggleMode }: Props) {
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

      <div style={{ flex: 1 }} data-tauri-drag-region />

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
