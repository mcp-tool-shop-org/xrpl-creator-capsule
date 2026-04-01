import type { PanelId } from "../App";
import { useRelease } from "../state/release";

interface SidebarProps {
  activePanel: PanelId;
  onSelect: (panel: PanelId) => void;
}

const panels: { id: PanelId; label: string; icon: string; live: boolean }[] = [
  { id: "manifest", label: "Manifest", icon: "\uD83D\uDCCB", live: true },
  { id: "mint", label: "Mint", icon: "\u26CF", live: true },
  { id: "verify", label: "Verify", icon: "\u2713", live: true },
  { id: "access", label: "Access", icon: "\uD83D\uDD11", live: false },
  { id: "recovery", label: "Recovery", icon: "\uD83D\uDEE1", live: false },
  { id: "governance", label: "Governance", icon: "\u2696", live: false },
];

export function Sidebar({ activePanel, onSelect }: SidebarProps) {
  const { manifest, mint, network } = useRelease();

  const statusLine = manifest.data
    ? `${manifest.data.title} \u2014 ${manifest.data.artist}`
    : "No release loaded";

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
              color: active
                ? "var(--text)"
                : p.live
                  ? "var(--text-muted)"
                  : "var(--text-dim)",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
              opacity: p.live ? 1 : 0.5,
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
        <div>{network.charAt(0).toUpperCase() + network.slice(1)}</div>
        <div
          style={{
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {statusLine}
        </div>
        {mint.receipt && (
          <div style={{ color: "var(--success)", marginTop: 2 }}>Minted</div>
        )}
      </div>
    </nav>
  );
}
