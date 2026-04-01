import {
  PanelShell,
  ArtifactCard,
  ArtifactField,
  ActionButton,
  ErrorBanner,
  CheckRow,
  type Status,
} from "./PanelShell";
import { useRelease } from "../../state/release";

function deriveStatus(m: ReturnType<typeof useRelease>["manifest"]): Status {
  if (m.error) return "error";
  if (m.resolution?.passed) return "resolved";
  if (m.resolution && !m.resolution.passed) return "invalid";
  if (m.validation?.valid) return "valid";
  if (m.validation && !m.validation.valid) return "invalid";
  if (m.status === "loading") return "loading";
  if (m.data) return "loaded";
  return "empty";
}

export function ManifestPanel() {
  const { manifest, loadManifest, validateManifest, resolveManifest } = useRelease();
  const status = deriveStatus(manifest);

  if (!manifest.data) {
    return (
      <PanelShell title="Manifest" status={status}>
        {manifest.error && <ErrorBanner message={manifest.error} />}
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            A release manifest defines the creator's intent — title, artist, editions,
            benefit, and content pointers. Loading a manifest is the first step.
          </p>
          <ActionButton label="Load Manifest" onClick={loadManifest} />
        </ArtifactCard>
      </PanelShell>
    );
  }

  const m = manifest.data;

  return (
    <PanelShell title="Manifest" status={status}>
      {manifest.error && <ErrorBanner message={manifest.error} />}

      {/* Release identity */}
      <ArtifactCard>
        <ArtifactField label="Title" value={m.title} />
        <ArtifactField label="Artist" value={m.artist} />
        <ArtifactField label="Format" value={m.license?.type ?? ""} />
        <ArtifactField label="Editions" value={String(m.editionSize)} />
        <ArtifactField label="Transfer Fee" value={`${m.transferFeePercent}%`} />
      </ArtifactCard>

      {/* Computed identity (from stamp) */}
      <ArtifactCard>
        <ArtifactField
          label="Manifest ID"
          value={manifest.stamp?.manifestId ?? m.id ?? ""}
          mono
        />
        <ArtifactField
          label="Revision Hash"
          value={manifest.stamp?.revisionHash ?? ""}
          mono
        />
        {manifest.path && (
          <ArtifactField label="File" value={manifest.path} mono />
        )}
      </ArtifactCard>

      {/* Addresses */}
      <ArtifactCard>
        <ArtifactField label="Issuer" value={m.issuerAddress} mono />
        <ArtifactField label="Operator" value={m.operatorAddress} mono />
        <ArtifactField label="Benefit" value={m.benefit?.kind ?? ""} />
        <ArtifactField
          label="Content Pointer"
          value={m.benefit?.contentPointer ?? ""}
          mono
        />
      </ArtifactCard>

      {/* Pointers */}
      <ArtifactCard>
        <ArtifactField label="Metadata URI" value={m.metadataEndpoint} mono />
        <ArtifactField label="License URI" value={m.license?.uri ?? ""} mono />
        <ArtifactField label="Cover CID" value={m.coverCid} mono />
        <ArtifactField label="Media CID" value={m.mediaCid} mono />
      </ArtifactCard>

      {/* Validation results */}
      {manifest.validation && (
        <ArtifactCard>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
              color: manifest.validation.valid ? "var(--success)" : "var(--error)",
            }}
          >
            Schema Validation: {manifest.validation.valid ? "PASSED" : "FAILED"}
          </div>
          {manifest.validation.errors.map((e, i) => (
            <div
              key={i}
              style={{ fontSize: 12, color: "var(--error)", marginBottom: 4 }}
            >
              {e}
            </div>
          ))}
        </ArtifactCard>
      )}

      {/* Resolution results */}
      {manifest.resolution && (
        <ArtifactCard>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
              color: manifest.resolution.passed ? "var(--success)" : "var(--error)",
            }}
          >
            Pointer Resolution: {manifest.resolution.passed ? "ALL PASSED" : "ISSUES FOUND"}
          </div>
          {manifest.resolution.checks.map((c) => (
            <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
          ))}
        </ArtifactCard>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionButton label="Load Different" onClick={loadManifest} variant="secondary" />
        <ActionButton
          label="Validate"
          onClick={validateManifest}
          disabled={!manifest.data}
        />
        <ActionButton
          label="Resolve Pointers"
          onClick={resolveManifest}
          disabled={!manifest.validation?.valid}
        />
      </div>
    </PanelShell>
  );
}
