import type { ReactNode } from "react";

export type Status =
  | "empty"
  | "loading"
  | "loaded"
  | "valid"
  | "invalid"
  | "resolved"
  | "minting"
  | "minted"
  | "verifying"
  | "verified"
  | "mismatch"
  | "error"
  | "canceled"
  | "timed_out";

interface Props {
  title: string;
  status: Status;
  children: ReactNode;
}

const statusColors: Record<Status, string> = {
  empty: "var(--text-dim)",
  loading: "var(--accent)",
  loaded: "var(--accent)",
  valid: "var(--success)",
  invalid: "var(--error)",
  resolved: "var(--success)",
  minting: "var(--accent)",
  minted: "var(--success)",
  verifying: "var(--accent)",
  verified: "var(--success)",
  mismatch: "var(--error)",
  error: "var(--error)",
  canceled: "var(--warning)",
  timed_out: "var(--warning)",
};

const statusLabels: Record<Status, string> = {
  empty: "No artifact",
  loading: "Loading\u2026",
  loaded: "Loaded",
  valid: "Valid",
  invalid: "Invalid",
  resolved: "Resolved",
  minting: "Minting\u2026",
  minted: "Minted",
  verifying: "Verifying\u2026",
  verified: "Verified",
  mismatch: "Mismatch",
  error: "Error",
  canceled: "Canceled",
  timed_out: "Timed Out",
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
        {value || "\u2014"}
      </div>
    </div>
  );
}

export function ActionButton({
  label,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 18px",
        fontSize: 13,
        fontWeight: 600,
        border:
          variant === "primary" ? "none" : "1px solid var(--border)",
        borderRadius: 6,
        background:
          variant === "primary"
            ? disabled
              ? "var(--text-dim)"
              : "var(--accent)"
            : "transparent",
        color:
          variant === "primary" ? "#fff" : "var(--text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
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

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "var(--error)" + "18",
        border: "1px solid var(--error)",
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--error)",
        wordBreak: "break-word",
      }}
    >
      {message}
    </div>
  );
}

export function CancelBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        background: "var(--warning)" + "18",
        border: "1px solid var(--warning)",
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--warning)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "none",
            border: "1px solid var(--warning)",
            borderRadius: 4,
            color: "var(--warning)",
            fontSize: 12,
            padding: "3px 10px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function TimeoutBanner({ message, onRetry, onReconcile }: {
  message: string;
  onRetry?: () => void;
  onReconcile?: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--warning)" + "18",
        border: "1px solid var(--warning)",
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--warning)",
      }}
    >
      <div style={{ marginBottom: onRetry || onReconcile ? 8 : 0 }}>{message}</div>
      {(onRetry || onReconcile) && (
        <div style={{ display: "flex", gap: 8 }}>
          {onReconcile && (
            <button
              onClick={onReconcile}
              style={{
                background: "none",
                border: "1px solid var(--warning)",
                borderRadius: 4,
                color: "var(--warning)",
                fontSize: 12,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              Check Status
            </button>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-dim)",
                fontSize: 12,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CheckRow({
  name,
  passed,
  detail,
}: {
  name: string;
  passed: boolean;
  detail: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          fontSize: 14,
          lineHeight: "20px",
          color: passed ? "var(--success)" : "var(--error)",
          flexShrink: 0,
        }}
      >
        {passed ? "\u2713" : "\u2717"}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{detail}</div>
      </div>
    </div>
  );
}
