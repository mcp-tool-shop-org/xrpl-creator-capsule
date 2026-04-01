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

function deriveStatus(
  manifest: ReturnType<typeof useRelease>["manifest"],
  mint: ReturnType<typeof useRelease>["mint"],
  verify: ReturnType<typeof useRelease>["verify"]
): Status {
  if (verify.error) return "error";
  if (verify.status === "running") return "verifying";
  if (verify.result?.passed) return "verified";
  if (verify.result && !verify.result.passed) return "mismatch";
  if (!manifest.data || !mint.receipt) return "empty";
  return "loaded";
}

export function VerifyPanel() {
  const { manifest, mint, verify, runVerify } = useRelease();
  const status = deriveStatus(manifest, mint, verify);

  const canVerify = !!manifest.path && !!mint.receiptPath;

  if (!manifest.data || !mint.receipt) {
    return (
      <PanelShell title="Verify" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Verification reconciles a manifest against its issuance receipt and the XRPL
            ledger. Load a manifest and a receipt first.
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
    <PanelShell title="Verify" status={status}>
      {verify.error && <ErrorBanner message={verify.error} />}

      {/* What we're verifying */}
      <ArtifactCard>
        <ArtifactField label="Manifest" value={manifest.path ?? ""} mono />
        <ArtifactField label="Receipt" value={mint.receiptPath ?? ""} mono />
        <ArtifactField label="Network" value={mint.receipt?.network ?? ""} />
      </ArtifactCard>

      {/* Verification results */}
      {verify.result && (
        <>
          <ArtifactCard>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: verify.result.passed ? "var(--success)" : "var(--error)",
              }}
            >
              {verify.result.passed
                ? "ALL CHECKS PASSED — Release integrity confirmed"
                : `${verify.result.checks.filter((c) => !c.passed).length} CHECK(S) FAILED`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              {verify.result.checks.length} checks run
            </div>
          </ArtifactCard>

          {/* Local checks */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Local Verification
            </div>
            {verify.result.checks
              .filter((c) => !c.name.startsWith("chain-"))
              .map((c) => (
                <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
              ))}
          </ArtifactCard>

          {/* Chain checks */}
          {verify.result.checks.some((c) => c.name.startsWith("chain-")) && (
            <ArtifactCard>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
                Chain Verification
              </div>
              {verify.result.checks
                .filter((c) => c.name.startsWith("chain-"))
                .map((c) => (
                  <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
                ))}
            </ArtifactCard>
          )}
        </>
      )}

      {/* Action */}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionButton
          label={verify.status === "running" ? "Verifying\u2026" : "Run Verification"}
          onClick={runVerify}
          disabled={!canVerify || verify.status === "running"}
        />
      </div>
    </PanelShell>
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
