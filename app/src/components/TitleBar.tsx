export function TitleBar() {
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
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-muted)",
        letterSpacing: "0.5px",
      }}
    >
      <span style={{ color: "var(--accent)" }}>CAPSULE</span>
      <span style={{ color: "var(--text-dim)" }}>|</span>
      <span>Release Chamber</span>
    </header>
  );
}
