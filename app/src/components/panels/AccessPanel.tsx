import { PanelShell, ArtifactCard, ArtifactField, ActionButton } from "./PanelShell";
import { useRelease } from "../../state/release";

export function AccessPanel() {
  const { manifest, receipt, accessPolicy, accessGrant } = useRelease();

  if (!manifest || !receipt) {
    return (
      <PanelShell title="Access" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest and receipt first. The access panel manages ownership-gated
            benefits — who can access what, and whether a specific wallet qualifies.
          </p>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Access" status={accessPolicy ? "loaded" : "empty"}>
      {!accessPolicy ? (
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            No access policy found. Create one to define holder benefits.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Create Policy" onClick={() => {}} />
            <ActionButton label="Load Policy" onClick={() => {}} variant="secondary" />
          </div>
        </ArtifactCard>
      ) : (
        <>
          <ArtifactCard>
            <ArtifactField label="Policy Label" value={accessPolicy.label ?? ""} />
            <ArtifactField label="Benefit Kind" value={accessPolicy.benefit?.kind ?? ""} />
            <ArtifactField label="Content Pointer" value={accessPolicy.benefit?.contentPointer ?? ""} mono />
            <ArtifactField label="Rule" value={accessPolicy.rule?.type ?? ""} />
            <ArtifactField label="Qualifying Tokens" value={String(accessPolicy.rule?.qualifyingTokenIds?.length ?? 0)} />
            <ArtifactField label="TTL" value={`${accessPolicy.delivery?.ttlSeconds ?? "—"}s`} />
          </ArtifactCard>

          <ArtifactCard>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
              Test holder access against a wallet address.
            </p>
            <ActionButton label="Check Access" onClick={() => {}} />
          </ArtifactCard>

          {accessGrant && (
            <ArtifactCard>
              <ArtifactField label="Decision" value={accessGrant.decision} />
              <ArtifactField label="Reason" value={accessGrant.reason ?? ""} />
              <ArtifactField label="Matched Tokens" value={String(accessGrant.ownership?.matchedTokenIds?.length ?? 0)} />
              <ArtifactField label="Grant Hash" value={accessGrant.grantHash ?? ""} mono />
              {accessGrant.delivery && (
                <>
                  <ArtifactField label="Token" value={accessGrant.delivery.token} mono />
                  <ArtifactField label="Expires" value={accessGrant.delivery.expiresAt} />
                </>
              )}
            </ArtifactCard>
          )}
        </>
      )}
    </PanelShell>
  );
}
