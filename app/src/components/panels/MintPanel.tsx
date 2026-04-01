import { PanelShell, ArtifactCard, ArtifactField, ActionButton } from "./PanelShell";
import { useRelease } from "../../state/release";

export function MintPanel() {
  const { manifest, receipt } = useRelease();

  if (!manifest) {
    return (
      <PanelShell title="Mint / Receipt" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest first. The mint panel shows issuance receipts — what was
            actually minted on the XRPL ledger.
          </p>
        </ArtifactCard>
      </PanelShell>
    );
  }

  if (!receipt) {
    return (
      <PanelShell title="Mint / Receipt" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            Manifest loaded. No issuance receipt found. Mint editions or load an existing receipt.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Mint Editions" onClick={() => {}} />
            <ActionButton label="Load Receipt" onClick={() => {}} variant="secondary" />
          </div>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Mint / Receipt" status="loaded">
      <ArtifactCard>
        <ArtifactField label="Manifest ID" value={receipt.manifestId} mono />
        <ArtifactField label="Revision Hash" value={receipt.manifestRevisionHash} mono />
        <ArtifactField label="Receipt Hash" value={receipt.receiptHash ?? ""} mono />
        <ArtifactField label="Network" value={receipt.xrpl?.network ?? ""} />
        <ArtifactField label="Editions Minted" value={String(receipt.xrpl?.nftTokenIds?.length ?? 0)} />
      </ArtifactCard>

      {receipt.xrpl?.nftTokenIds?.map((tokenId: string, i: number) => (
        <ArtifactCard key={tokenId}>
          <ArtifactField label={`Token #${i + 1}`} value={tokenId} mono />
          <ArtifactField label="TX Hash" value={receipt.xrpl?.txHashes?.[i] ?? ""} mono />
        </ArtifactCard>
      ))}
    </PanelShell>
  );
}
