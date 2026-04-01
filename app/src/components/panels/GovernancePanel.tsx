import { PanelShell, ArtifactCard } from "./PanelShell";

export function GovernancePanel() {
  return (
    <PanelShell title="Governance" status="empty">
      <ArtifactCard>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          The governance panel manages treasury policies, payout proposals, and
          the multi-signer approval chain. This panel will be wired live in a
          future slice after the core truth loop is proven.
        </p>
      </ArtifactCard>
    </PanelShell>
  );
}
