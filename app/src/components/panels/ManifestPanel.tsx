import { PanelShell, ArtifactCard, ArtifactField, ActionButton } from "./PanelShell";
import { useRelease } from "../../state/release";

export function ManifestPanel() {
  const { manifest, loadRelease, createRelease } = useRelease();

  if (!manifest) {
    return (
      <PanelShell title="Manifest" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            A release manifest defines the creator's intent — title, artist, editions,
            benefit, and content pointers. Loading or creating a manifest is the first step.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Load Manifest" onClick={loadRelease} />
            <ActionButton label="New Release" onClick={createRelease} variant="secondary" />
          </div>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Manifest" status="loaded">
      <ArtifactCard>
        <ArtifactField label="Title" value={manifest.title} />
        <ArtifactField label="Artist" value={manifest.artist} />
        <ArtifactField label="Format" value={manifest.format} />
        <ArtifactField label="Editions" value={String(manifest.editions)} />
        <ArtifactField label="Transfer Fee" value={`${manifest.transferFee} bps`} />
      </ArtifactCard>

      <ArtifactCard>
        <ArtifactField label="Manifest ID" value={manifest.id ?? ""} mono />
        <ArtifactField label="Revision Hash" value={manifest.revisionHash ?? ""} mono />
      </ArtifactCard>

      <ArtifactCard>
        <ArtifactField label="Issuer" value={manifest.issuerAddress} mono />
        <ArtifactField label="Operator" value={manifest.operatorAddress} mono />
        <ArtifactField label="Benefit" value={manifest.benefit?.kind ?? ""} />
        <ArtifactField label="Content Pointer" value={manifest.benefit?.contentPointer ?? ""} mono />
      </ArtifactCard>

      <ArtifactCard>
        <ArtifactField label="Metadata URI" value={manifest.pointers?.metadataUri ?? ""} mono />
        <ArtifactField label="License URI" value={manifest.pointers?.licenseUri ?? ""} mono />
        <ArtifactField label="Cover CID" value={manifest.pointers?.coverCid ?? ""} mono />
        <ArtifactField label="Media CID" value={manifest.pointers?.mediaCid ?? ""} mono />
      </ArtifactCard>
    </PanelShell>
  );
}
