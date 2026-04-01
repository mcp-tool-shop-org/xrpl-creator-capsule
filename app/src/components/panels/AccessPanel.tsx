import { PanelShell, ArtifactCard } from "./PanelShell";

export function AccessPanel() {
  return (
    <PanelShell title="Access" status="empty">
      <ArtifactCard>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          The access panel manages ownership-gated benefits — who can access what,
          and whether a specific wallet qualifies. This panel will be wired live
          in a future slice after the Manifest &rarr; Mint &rarr; Verify truth loop
          is proven.
        </p>
      </ArtifactCard>
    </PanelShell>
  );
}
