import type { PanelId } from "../App";

interface SidebarProps {
  activePanel: PanelId;
  onSelect: (panel: PanelId) => void;
}

const panels: { id: PanelId; label: string; icon: string }[] = [
  { id: "manifest", label: "Manifest", icon: "📋" },
  { id: "mint", label: "Mint", icon: "⛏" },
  { id: "access", label: "Access", icon: "🔑" },
  { id: "recovery", label: "Recovery", icon: "🛡" },
  { id: "governance", label: "Governance", icon: "⚖" },
];

export function Sidebar({ activePanel, onSelect }: SidebarProps) {
  return (
    <nav
      style={{
        width: 180,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        paddingTop: 8,
      }}
    >
      {panels.map((p) => {
        const active = p.id === activePanel;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              border: "none",
              background: active ? "var(--bg-panel-hover)" : "transparent",
              borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            {p.label}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          lineHeight: 1.5,
        }}
      >
        <div>Testnet</div>
        <div style={{ color: "var(--text-muted)" }}>No release loaded</div>
      </div>
    </nav>
  );
}
