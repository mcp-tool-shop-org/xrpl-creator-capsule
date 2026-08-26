import { useState } from "react";
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
  recovery: ReturnType<typeof useRelease>["recovery"]
): Status {
  if (recovery.error) return "error";
  if (recovery.result?.allPassed) return "verified";
  if (recovery.result && !recovery.result.allPassed) return "mismatch";
  if (recovery.status === "running") return "verifying";
  if (!manifest.data || !mint.receipt) return "empty";
  return "loaded";
}

export function RecoveryPanel() {
  const { manifest, mint, access, recovery, runRecover, runReplay } = useRelease();
  const status = deriveStatus(manifest, mint, recovery);

  const [holderAddr, setHolderAddr] = useState("");
  const [nonHolderAddr, setNonHolderAddr] = useState("");

  // F-51fa8088: tokenIds and txHashes are two independently-derived
  // arrays in the bundle — nothing in the schema enforces they stay the
  // same length, and a malformed/corrupted bundle can legitimately have
  // them differ. Computed once here so both the check row and the
  // token/tx-hash listing below agree on the same answer.
  const tokenTxHashLengthsMatch =
    !recovery.result || recovery.result.bundle.tokenIds.length === recovery.result.bundle.txHashes.length;

  // Prerequisite: manifest + receipt
  if (!manifest.data || !mint.receipt) {
    return (
      <PanelShell title="Recovery" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            The recovery panel proves a release survives platform death. Load a
            manifest and receipt to generate a recovery bundle.
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
    <PanelShell title="Recovery" status={status}>
      {recovery.error && <ErrorBanner message={recovery.error} />}

      {/* Generate section */}
      {!recovery.result ? (
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            Generate a recovery bundle to prove this release can be reconstructed
            without the original app. The bundle contains all canonical pointers,
            provenance data, and verification checks.
          </p>
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <ReadinessItem label="Manifest loaded" ready={!!manifest.data} />
            <ReadinessItem label="Receipt loaded" ready={!!mint.receipt} />
            <ReadinessItem label="Access policy loaded" ready={!!access.policy} />
          </div>
          <ActionButton
            label={recovery.status === "running" ? "Generating\u2026" : "Generate Recovery Bundle"}
            onClick={runRecover}
            disabled={recovery.status === "running"}
          />
        </ArtifactCard>
      ) : (
        <>
          {/* Provenance summary */}
          <ArtifactCard>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: recovery.result.allPassed ? "var(--success)" : "var(--error)",
              }}
            >
              {recovery.result.allPassed
                ? "RECOVERY VERIFIED \u2014 Release is durable"
                : "RECOVERY ISSUES FOUND"}
            </div>
            <ArtifactField label="Title" value={recovery.result.bundle.title} />
            <ArtifactField label="Artist" value={recovery.result.bundle.artist} />
            <ArtifactField label="Network" value={recovery.result.bundle.network} />
            <ArtifactField label="Editions" value={String(recovery.result.bundle.editionSize)} />
            <ArtifactField label="Manifest ID" value={recovery.result.bundle.manifestId} mono />
            <ArtifactField label="Revision Hash" value={recovery.result.bundle.revisionHash} mono />
            <ArtifactField label="Receipt Hash" value={recovery.result.bundle.receiptHash} mono />
            {recovery.result.bundle.bundleHash && (
              <ArtifactField label="Bundle Hash" value={recovery.result.bundle.bundleHash} mono />
            )}
          </ArtifactCard>

          {/* Durable pointers */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Durable Pointers
            </div>
            <ArtifactField label="Metadata URI" value={recovery.result.bundle.metadataUri} mono />
            <ArtifactField label="License URI" value={recovery.result.bundle.licenseUri} mono />
            <ArtifactField label="Cover CID" value={recovery.result.bundle.coverCid} mono />
            <ArtifactField label="Media CID" value={recovery.result.bundle.mediaCid} mono />
          </ArtifactCard>

          {/* Benefit */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Collector Benefit
            </div>
            <ArtifactField label="Kind" value={recovery.result.bundle.benefit.kind} />
            <ArtifactField label="Description" value={recovery.result.bundle.benefit.description} />
            <ArtifactField label="Content Pointer" value={recovery.result.bundle.benefit.contentPointer} mono />
            {recovery.result.bundle.accessPolicyLabel && (
              <ArtifactField label="Access Policy" value={recovery.result.bundle.accessPolicyLabel} />
            )}
          </ArtifactCard>

          {/* Consistency checks */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Bundle Consistency ({recovery.result.verification.checks.length} checks)
            </div>
            {recovery.result.verification.checks.map((c) => (
              <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
            ))}
            {/* F-51fa8088: tokenIds/txHashes length parity is checked
                client-side (the engine's own verification.checks never
                covers it) and surfaced as its own row, consistent with
                the panel's other checks — a length mismatch is itself a
                data-integrity problem worth flagging, independent of
                whether any individual pair happens to render fine. */}
            <CheckRow
              name="Token/TX hash array length parity"
              passed={tokenTxHashLengthsMatch}
              detail={
                tokenTxHashLengthsMatch
                  ? `${recovery.result.bundle.tokenIds.length} tokens, ${recovery.result.bundle.txHashes.length} tx hashes`
                  : `Mismatch: ${recovery.result.bundle.tokenIds.length} token ID(s) vs ${recovery.result.bundle.txHashes.length} tx hash(es) — this bundle may be malformed or corrupted.`
              }
            />
          </ArtifactCard>

          {/* Chain checks */}
          {recovery.result.chainChecks.length > 0 && (
            <ArtifactCard>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
                Chain Verification
              </div>
              {recovery.result.chainChecks.map((c) => (
                <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
              ))}
            </ArtifactCard>
          )}

          {/* Token IDs */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Mint Facts ({recovery.result.bundle.tokenIds.length} token{recovery.result.bundle.tokenIds.length !== 1 ? "s" : ""})
            </div>
            {/*
              F-51fa8088: iterating tokenIds.map(...) alone silently
              DROPPED any txHashes entries beyond tokenIds.length —
              total invisibility for an orphaned hash, not just a blank
              value. Iterating the longer of the two arrays instead means
              every recorded value from EITHER array is always shown, and
              each side renders an explicit, mismatch-specific marker
              (not ArtifactField's generic "—", which already covers an
              ordinarily-absent single value and would be indistinguishable
              from this actually-a-data-integrity-problem case) when it
              runs out before the other.
            */}
            {Array.from(
              { length: Math.max(recovery.result.bundle.tokenIds.length, recovery.result.bundle.txHashes.length) },
              (_, i) => {
                const tokenId = recovery.result!.bundle.tokenIds[i];
                const txHash = recovery.result!.bundle.txHashes[i];
                const missingMarker = "(missing — array length mismatch)";
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <ArtifactField label={`Token #${i + 1}`} value={tokenId ?? missingMarker} mono />
                    <ArtifactField label="TX Hash" value={txHash ?? missingMarker} mono />
                  </div>
                );
              }
            )}
          </ArtifactCard>

          {/* Instructions */}
          <ArtifactCard>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Recovery Instructions
            </div>
            {recovery.result.bundle.instructions.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  padding: "3px 0",
                  borderBottom: i < recovery.result!.bundle.instructions.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                {line}
              </div>
            ))}
          </ArtifactCard>

          {/* Replay section */}
          {access.policy && (
            <ArtifactCard>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
                Access Replay
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
                Prove that access control still works from the recovery artifacts.
                Enter a holder wallet (should pass) and a non-holder wallet (should fail).
              </p>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  Holder wallet (should be granted)
                </label>
                <input
                  type="text"
                  placeholder="rHolderAddress..."
                  value={holderAddr}
                  onChange={(e) => setHolderAddr(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  Non-holder wallet (should be denied)
                </label>
                <input
                  type="text"
                  placeholder="rNonHolderAddress..."
                  value={nonHolderAddr}
                  onChange={(e) => setNonHolderAddr(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <ActionButton
                label={recovery.replayStatus === "running" ? "Replaying\u2026" : "Run Replay"}
                onClick={() => runReplay(holderAddr, nonHolderAddr)}
                disabled={
                  recovery.replayStatus === "running" ||
                  !holderAddr.trim() ||
                  !nonHolderAddr.trim()
                }
              />
            </ArtifactCard>
          )}

          {/* Replay results */}
          {recovery.replayHolder && (
            <ReplayResult
              label="Holder Replay"
              grant={recovery.replayHolder}
              expectedDecision="allow"
            />
          )}
          {recovery.replayNonHolder && (
            <ReplayResult
              label="Non-Holder Replay"
              grant={recovery.replayNonHolder}
              expectedDecision="deny"
            />
          )}

          {/* Regenerate */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <ActionButton
              label="Regenerate Bundle"
              onClick={runRecover}
              variant="secondary"
              disabled={recovery.status === "running"}
            />
          </div>

          {recovery.bundlePath && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
              Saved to: {recovery.bundlePath}
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "monospace",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
};

function ReplayResult({
  label,
  grant,
  expectedDecision,
}: {
  label: string;
  grant: ReturnType<typeof useRelease>["recovery"]["replayHolder"];
  expectedDecision: "allow" | "deny";
}) {
  if (!grant) return null;

  const correct = grant.decision === expectedDecision;

  return (
    <ArtifactCard>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 8,
          color: correct ? "var(--success)" : "var(--error)",
        }}
      >
        {label}: {grant.decision.toUpperCase()}
        {correct ? " (expected)" : ` (UNEXPECTED \u2014 expected ${expectedDecision})`}
      </div>
      <ArtifactField label="Wallet" value={grant.subjectAddress} mono />
      <ArtifactField label="Reason" value={grant.reason} />
      <ArtifactField label="Matched Tokens" value={String(grant.ownership.matchedTokenIds.length)} />
    </ArtifactCard>
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
