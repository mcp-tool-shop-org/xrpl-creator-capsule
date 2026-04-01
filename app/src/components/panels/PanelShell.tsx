import type { ReactNode } from "react";

type Status = "empty" | "loaded" | "verified" | "error";

interface Props {
  title: string;
  status: Status;
  children: ReactNode;
}

const statusColors: Record<Status, string> = {
  empty: "var(--text-dim)",
  loaded: "var(--accent)",
  verified: "var(--success)",
  error: "var(--error)",
};

const statusLabels: Record<Status, string> = {
  empty: "No artifact",
  loaded: "Loaded",
  verified: "Verified",
  error: "Error",
};

export function PanelShell({ title, status, children }: Props) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 4,
            background: statusColors[status] + "18",
            color: statusColors[status],
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {statusLabels[status]}
        </span>
      </div>
      {children}
    </div>
  );
}

export function ArtifactField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: value ? "var(--text)" : "var(--text-dim)",
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

export function ActionButton({
  label,
  onClick,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 18px",
        fontSize: 13,
        fontWeight: 600,
        border:
          variant === "primary"
            ? "none"
            : "1px solid var(--border)",
        borderRadius: 6,
        background:
          variant === "primary"
            ? "var(--accent)"
            : "transparent",
        color:
          variant === "primary"
            ? "#fff"
            : "var(--text-muted)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export function ArtifactCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--panel-radius)",
        padding: 16,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}
