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
  mint: ReturnType<typeof useRelease>["mint"]
): Status {
  if (mint.error) return "error";
  if (mint.actionStatus === "running") return "minting";
  if (mint.receipt) return "minted";
  if (!manifest.data) return "empty";
  return "loaded";
}

export function MintPanel() {
  const { manifest, mint, loadWallets, loadReceipt, runMint, network } = useRelease();
  const status = deriveStatus(manifest, mint);

  if (!manifest.data) {
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

  // Show receipt if we have one (either from minting or loading)
  if (mint.receipt) {
    const r = mint.receipt;
    return (
      <PanelShell title="Mint / Receipt" status={status}>
        {mint.error && <ErrorBanner message={mint.error} />}

        <ArtifactCard>
          <ArtifactField label="Manifest ID" value={r.manifestId} mono />
          <ArtifactField label="Revision Hash" value={r.manifestRevisionHash} mono />
          <ArtifactField label="Receipt Hash" value={r.receiptHash ?? ""} mono />
        </ArtifactCard>

        <ArtifactCard>
          <ArtifactField label="Network" value={r.network} />
          <ArtifactField label="Issued At" value={r.issuedAt} />
          <ArtifactField label="Issuer" value={r.issuerAddress} mono />
          <ArtifactField label="Operator" value={r.operatorAddress} mono />
          <ArtifactField
            label="Transfer Fee"
            value={`${r.xrpl.transferFee} (${r.xrpl.transferFee / 1000}%)`}
          />
          <ArtifactField
            label="Editions Minted"
            value={String(r.xrpl.nftTokenIds.length)}
          />
        </ArtifactCard>

        {r.xrpl.nftTokenIds.map((tokenId, i) => (
          <ArtifactCard key={tokenId}>
            <ArtifactField label={`Token #${i + 1}`} value={tokenId} mono />
            <ArtifactField label="TX Hash" value={r.xrpl.mintTxHashes?.[i] ?? ""} mono />
          </ArtifactCard>
        ))}

        {mint.receiptPath && (
          <ArtifactCard>
            <ArtifactField label="Receipt File" value={mint.receiptPath} mono />
          </ArtifactCard>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionButton label="Load Different Receipt" onClick={loadReceipt} variant="secondary" />
        </div>
      </PanelShell>
    );
  }

  // No receipt yet — show mint readiness
  return (
    <PanelShell title="Mint / Receipt" status={status}>
      {mint.error && <ErrorBanner message={mint.error} />}

      <ArtifactCard>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
          Mint Readiness
        </div>
        <ReadinessRow
          label="Manifest loaded"
          ready={!!manifest.data}
        />
        <ReadinessRow
          label="Schema validated"
          ready={!!manifest.validation?.valid}
        />
        <ReadinessRow
          label="Pointers resolved"
          ready={!!manifest.resolution?.passed}
        />
        <ReadinessRow
          label="Wallet credentials loaded"
          ready={!!mint.walletsPath}
          value={mint.walletsPath ?? undefined}
        />
        <ReadinessRow
          label={`Network: ${network}`}
          ready={true}
        />
      </ArtifactCard>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionButton
          label={mint.walletsPath ? "Change Wallets" : "Load Wallets"}
          onClick={loadWallets}
          variant={mint.walletsPath ? "secondary" : "primary"}
        />
        <ActionButton
          label="Load Existing Receipt"
          onClick={loadReceipt}
          variant="secondary"
        />
        <ActionButton
          label={mint.actionStatus === "running" ? "Minting\u2026" : "Mint on Testnet"}
          onClick={runMint}
          disabled={
            !manifest.data ||
            !mint.walletsPath ||
            mint.actionStatus === "running"
          }
        />
      </div>
    </PanelShell>
  );
}

function ReadinessRow({
  label,
  ready,
  value,
}: {
  label: string;
  ready: boolean;
  value?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: ready ? "var(--success)" : "var(--text-dim)" }}>
        {ready ? "\u2713" : "\u25CB"}
      </span>
      <span style={{ color: ready ? "var(--text)" : "var(--text-muted)" }}>
        {label}
      </span>
      {value && (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            fontFamily: "monospace",
            marginLeft: "auto",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}
