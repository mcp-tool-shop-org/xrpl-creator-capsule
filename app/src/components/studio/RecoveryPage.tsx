import { useState } from "react";
import { useStudio } from "../../state/studio";
import { useRelease, logAction } from "../../state/release";
import { ArtifactCard, ActionButton, CheckRow, ErrorBanner, CancelBanner } from "../panels/PanelShell";

export function RecoveryPage() {
  const { setActiveStep } = useStudio();
  const release = useRelease();
  const { mint, recovery } = release;

  if (!mint.receipt) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Recovery & Safety</h2>
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Publish your release first. Once live, you can generate a recovery
            bundle that proves ownership even if this app disappears.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionButton label="\u2190 Go to Publish" onClick={() => setActiveStep("publish")} variant="secondary" />
          </div>
        </ArtifactCard>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        Recovery & Safety
      </h2>

      {recovery.error && <ErrorBanner message={recovery.error} />}
      {recovery.status === "canceled" && (
        <CancelBanner
          message="Recovery bundle save was canceled. No file was created. You can try again anytime."
          onRetry={release.runRecover}
        />
      )}

      {/* What recovery means */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          Your release can be recovered
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          A recovery bundle is a self-contained proof file that contains everything
          needed to reconstruct your release — even if this app disappears entirely.
          It includes your release details, transaction proof, and chain verification.
        </p>

        <div style={{ padding: 12, background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 16 }}>
          <SafetyPoint label="What survives" value="Title, artist, edition details, transaction hashes, token IDs, all URIs" />
          <SafetyPoint label="What proves ownership" value="Manifest identity, revision hash, receipt hash — all cryptographically chained" />
          <SafetyPoint label="What verifies on-chain" value="NFT existence, authorized minter status, metadata URI match" />
          <SafetyPoint label="What this doesn't do" value="The bundle doesn't contain the actual media files — those live on IPFS/storage" />
        </div>

        {!recovery.result && (
          <>
            <ActionButton
              label={recovery.status === "running" ? "Generating..." : "Generate Recovery Bundle"}
              onClick={release.runRecover}
              disabled={recovery.status === "running"}
            />
            {recovery.status === "running" && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
                Building your recovery bundle. This verifies consistency between your manifest,
                receipt, and on-chain data. Usually takes a few seconds.
              </div>
            )}
          </>
        )}
      </ArtifactCard>

      {/* Recovery result */}
      {recovery.result && (
        <>
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
                ? "RECOVERY BUNDLE VERIFIED"
                : "VERIFICATION ISSUES FOUND"}
            </div>

            {/* Consistency checks */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                Consistency Checks
              </div>
              {recovery.result.verification.checks.map((c) => (
                <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
              ))}
            </div>

            {/* Chain checks */}
            {recovery.result.chainChecks.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                  Chain Verification
                </div>
                {recovery.result.chainChecks.map((c) => (
                  <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
                ))}
              </div>
            )}
          </ArtifactCard>

          {recovery.bundlePath && (
            <ArtifactCard>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
                Bundle saved
              </div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)", wordBreak: "break-all" }}>
                {recovery.bundlePath}
              </div>
              <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                Keep this file safe. It's your proof of release ownership independent of any app or service.
              </p>
            </ArtifactCard>
          )}
        </>
      )}

      {/* Plain language summary */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text)" }}>
          What happens if...
        </div>
        <QARow
          question="...this app disappears?"
          answer="Your release still exists on the XRPL ledger. The recovery bundle proves you created it."
        />
        <QARow
          question="...the storage provider goes down?"
          answer="The token IDs and transaction hashes on-chain prove the release happened. Re-upload content to any new provider."
        />
        <QARow
          question="...someone claims your release?"
          answer="The manifest hash chain and on-chain issuer address are cryptographic proof of authorship."
        />
        <QARow
          question="...I want to see all the technical proof?"
          answer="Switch to Advanced mode to inspect every artifact, hash, and verification check."
        />
      </ArtifactCard>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <ActionButton label="\u2190 Back to Test" onClick={() => setActiveStep("test")} variant="secondary" />
        <ActionButton label="Generate Another Bundle" onClick={release.runRecover} variant="secondary" />
      </div>
    </div>
  );
}

function SafetyPoint({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{value}</div>
    </div>
  );
}

function QARow({ question, answer }: { question: string; answer: string }) {
  return (
    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
        {question}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {answer}
      </div>
    </div>
  );
}
