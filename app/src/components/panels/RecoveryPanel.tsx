import { PanelShell, ArtifactCard, ArtifactField, ActionButton } from "./PanelShell";
import { useRelease } from "../../state/release";

export function RecoveryPanel() {
  const { manifest, receipt, recoveryBundle } = useRelease();

  if (!manifest || !receipt) {
    return (
      <PanelShell title="Recovery" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest and receipt first. The recovery panel proves the release
            can be reconstructed without the original app.
          </p>
        </ArtifactCard>
      </PanelShell>
    );
  }

  if (!recoveryBundle) {
    return (
      <PanelShell title="Recovery" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            No recovery bundle found. Generate one to prove durability.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Generate Bundle" onClick={() => {}} />
            <ActionButton label="Load Bundle" onClick={() => {}} variant="secondary" />
          </div>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Recovery" status="verified">
      <ArtifactCard>
        <ArtifactField label="Title" value={recoveryBundle.title ?? ""} />
        <ArtifactField label="Artist" value={recoveryBundle.artist ?? ""} />
        <ArtifactField label="Manifest ID" value={recoveryBundle.manifestId ?? ""} mono />
        <ArtifactField label="Bundle Hash" value={recoveryBundle.bundleHash ?? ""} mono />
      </ArtifactCard>

      <ArtifactCard>
        <ArtifactField label="Metadata URI" value={recoveryBundle.durablePointers?.metadataUri ?? ""} mono />
        <ArtifactField label="License URI" value={recoveryBundle.durablePointers?.licenseUri ?? ""} mono />
        <ArtifactField label="Cover CID" value={recoveryBundle.durablePointers?.coverCid ?? ""} mono />
        <ArtifactField label="Media CID" value={recoveryBundle.durablePointers?.mediaCid ?? ""} mono />
      </ArtifactCard>

      {recoveryBundle.recoveryInstructions && (
        <ArtifactCard>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
            Recovery Instructions
          </div>
          {recoveryBundle.recoveryInstructions.map((instruction: string, i: number) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                padding: "4px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {i + 1}. {instruction}
            </div>
          ))}
        </ArtifactCard>
      )}
    </PanelShell>
  );
}
