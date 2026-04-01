import { PanelShell, ArtifactCard } from "./PanelShell";

export function RecoveryPanel() {
  return (
    <PanelShell title="Recovery" status="empty">
      <ArtifactCard>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          The recovery panel proves a release can be reconstructed without the
          original app — durable pointers, bundle hashes, and step-by-step
          reconstruction guides. This panel will be wired live in a future slice.
        </p>
      </ArtifactCard>
    </PanelShell>
  );
}
