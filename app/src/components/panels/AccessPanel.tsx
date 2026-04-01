import { useState } from "react";
import {
  PanelShell,
  ArtifactCard,
  ArtifactField,
  ActionButton,
  ErrorBanner,
  type Status,
} from "./PanelShell";
import { useRelease } from "../../state/release";

function deriveStatus(
  manifest: ReturnType<typeof useRelease>["manifest"],
  mint: ReturnType<typeof useRelease>["mint"],
  access: ReturnType<typeof useRelease>["access"]
): Status {
  if (access.error) return "error";
  if (access.grant?.decision === "allow") return "verified";
  if (access.grant?.decision === "deny") return "mismatch";
  if (access.grantStatus === "running") return "verifying";
  if (access.policy) return "loaded";
  if (!manifest.data || !mint.receipt) return "empty";
  return "loaded";
}

export function AccessPanel() {
  const {
    manifest,
    mint,
    access,
    loadPolicy,
    createPolicy,
    setWalletAddress,
    runGrantAccess,
  } = useRelease();

  const status = deriveStatus(manifest, mint, access);

  // Prerequisite: manifest + receipt
  if (!manifest.data || !mint.receipt) {
    return (
      <PanelShell title="Access" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest and receipt first. The access panel tests whether a
            wallet qualifies for the release's collector benefit.
          </p>
          <div style={{ marginTop: 12 }}>
            <ReadinessItem label="Manifest loaded" ready={!!manifest.data} />
            <ReadinessItem label="Receipt loaded" ready={!!mint.receipt} />
          </div>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Access" status={status}>
      {access.error && <ErrorBanner message={access.error} />}

      {/* Policy section */}
      {!access.policy ? (
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            An access policy defines which benefit is gated, which NFTs qualify,
            and how delivery works. Create one from the manifest + receipt, or
            load an existing policy.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Create Policy" onClick={createPolicy} />
            <ActionButton label="Load Policy" onClick={loadPolicy} variant="secondary" />
          </div>
        </ArtifactCard>
      ) : (
        <>
          {/* Policy details */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Access Policy
            </div>
            <ArtifactField label="Label" value={access.policy.label} />
            <ArtifactField label="Benefit Kind" value={access.policy.benefit.kind} />
            <ArtifactField label="Content Pointer" value={access.policy.benefit.contentPointer} mono />
            <ArtifactField label="Rule" value={access.policy.rule.type} />
            <ArtifactField label="Qualifying Tokens" value={String(access.policy.rule.qualifyingTokenIds.length)} />
            <ArtifactField label="Delivery TTL" value={`${access.policy.delivery.ttlSeconds}s`} />
            {access.policyPath && (
              <ArtifactField label="File" value={access.policyPath} mono />
            )}
          </ArtifactCard>

          {/* Wallet test */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Test Holder Access
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
              Enter a wallet address to test whether it holds a qualifying NFT
              and would be granted access to the benefit.
            </p>
            <WalletInput
              value={access.walletAddress}
              onChange={setWalletAddress}
              onSubmit={runGrantAccess}
              disabled={access.grantStatus === "running"}
            />
          </ArtifactCard>

          {/* Grant result */}
          {access.grant && <GrantResult grant={access.grant} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <ActionButton label="Load Different Policy" onClick={loadPolicy} variant="secondary" />
          </div>
        </>
      )}
    </PanelShell>
  );
}

function WalletInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <input
        type="text"
        placeholder="rWalletAddress..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit();
        }}
        style={{
          flex: 1,
          padding: "8px 12px",
          fontSize: 13,
          fontFamily: "monospace",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          outline: "none",
        }}
      />
      <ActionButton
        label={disabled ? "Checking\u2026" : "Check Access"}
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
      />
    </div>
  );
}

function GrantResult({ grant }: { grant: ReturnType<typeof useRelease>["access"]["grant"] }) {
  if (!grant) return null;

  const allowed = grant.decision === "allow";

  return (
    <ArtifactCard>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: allowed ? "var(--success)" : "var(--error)",
        }}
      >
        {allowed ? "ACCESS GRANTED" : "ACCESS DENIED"}
      </div>

      <ArtifactField label="Wallet" value={grant.subjectAddress} mono />
      <ArtifactField label="Decision" value={grant.decision.toUpperCase()} />
      <ArtifactField label="Reason" value={grant.reason} />
      <ArtifactField label="Network" value={grant.network} />
      <ArtifactField label="Matched Tokens" value={String(grant.ownership.matchedTokenIds.length)} />
      <ArtifactField label="Total NFTs Checked" value={String(grant.ownership.totalNftsChecked)} />

      {grant.ownership.matchedTokenIds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
            Matched Token IDs
          </div>
          {grant.ownership.matchedTokenIds.map((id) => (
            <div key={id} style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all", marginBottom: 2 }}>
              {id}
            </div>
          ))}
        </div>
      )}

      {grant.delivery && (
        <>
          <ArtifactField label="Delivery Mode" value={grant.delivery.mode} />
          <ArtifactField label="Token" value={grant.delivery.token} mono />
          <ArtifactField label="Expires" value={grant.delivery.expiresAt} />
        </>
      )}

      {grant.grantHash && (
        <ArtifactField label="Grant Hash" value={grant.grantHash} mono />
      )}

      <ArtifactField label="Decided At" value={grant.decidedAt} />
    </ArtifactCard>
  );
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: ready ? "var(--success)" : "var(--text-dim)" }}>
        {ready ? "\u2713" : "\u25CB"}
      </span>
      <span style={{ color: ready ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
