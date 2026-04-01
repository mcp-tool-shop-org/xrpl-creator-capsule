import { useState, useCallback, useRef } from "react";
import { useStudio } from "../../state/studio";
import { useRelease, logAction, type ActionEvent } from "../../state/release";
import { ArtifactCard, ActionButton, ErrorBanner, CancelBanner, TimeoutBanner } from "../panels/PanelShell";
import { saveFile } from "../../bridge/engine";
import { saveSession } from "../../state/session";
import { save } from "@tauri-apps/plugin-dialog";
import type { ReleaseManifest } from "../../bridge/engine";

/**
 * Convert the artist-facing draft into a canonical ReleaseManifest.
 * Technical fields get sensible defaults. CIDs use file paths as
 * placeholders until IPFS upload is wired.
 */
function draftToManifest(
  draft: ReturnType<typeof useStudio>["draft"],
  issuerAddress: string,
  operatorAddress: string,
): ReleaseManifest {
  const coverCid = draft.coverArtPath
    ? `file://${draft.coverArtPath.replace(/\\/g, "/")}`
    : "placeholder:cover";
  const mediaCid = draft.mediaFilePath
    ? `file://${draft.mediaFilePath.replace(/\\/g, "/")}`
    : "placeholder:media";
  const contentPointer = draft.benefitContentPath
    ? `file://${draft.benefitContentPath.replace(/\\/g, "/")}`
    : mediaCid;

  const licenseUris: Record<string, string> = {
    "personal-use": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    "cc-by": "https://creativecommons.org/licenses/by/4.0/",
    "cc-by-nc": "https://creativecommons.org/licenses/by-nc/4.0/",
    "all-rights": "https://example.com/all-rights-reserved",
  };

  return {
    schemaVersion: "1.0.0",
    title: draft.title,
    artist: draft.artist,
    editionSize: draft.editionSize,
    coverCid,
    mediaCid,
    metadataEndpoint: `https://metadata.capsule.local/${encodeURIComponent(draft.title.toLowerCase().replace(/\s+/g, "-"))}`,
    license: {
      type: draft.licenseType,
      summary: draft.licenseSummary,
      uri: licenseUris[draft.licenseType] ?? licenseUris["personal-use"],
    },
    benefit: {
      kind: draft.benefitKind,
      description: draft.benefitDescription,
      contentPointer,
    },
    priceDrops: "none",
    transferFeePercent: draft.transferFeePercent,
    payoutPolicy: {
      treasuryAddress: draft.treasuryAddress || operatorAddress,
      multiSig: draft.collaborators.length > 0,
      terms: draft.collaborators.length > 0
        ? `${draft.collaborators.length} collaborator(s), governed by on-chain policy`
        : "Single creator, direct payout",
    },
    issuerAddress,
    operatorAddress,
    createdAt: new Date().toISOString(),
  };
}

type PublishPhase = "ready" | "wallets" | "building" | "minting" | "done" | "error" | "canceled" | "timed_out";

/** Timeout for XRPL mint operations (90 seconds). */
const MINT_TIMEOUT_MS = 90_000;

export function PublishPage() {
  const studio = useStudio();
  const { draft, canProceedToPublish, setActiveStep } = studio;
  const release = useRelease();

  const [phase, setPhase] = useState<PublishPhase>(
    release.mint.receipt ? "done" : "ready"
  );
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [timeoutReason, setTimeoutReason] = useState<string | null>(null);
  const publishStartRef = useRef<string | null>(null);
  const lastMintPathsRef = useRef<{ manifestPath: string; walletsPath: string; receiptPath: string } | null>(null);

  const handlePublish = useCallback(async () => {
    try {
      setError(null);
      setCancelReason(null);
      setTimeoutReason(null);
      publishStartRef.current = new Date().toISOString();

      logAction({
        action: "publish",
        status: "running",
        startedAt: publishStartRef.current,
        releaseIdentity: draft.title ? `${draft.title} — ${draft.artist}` : undefined,
        mode: "studio",
      });

      // Step 1: Load wallets
      setPhase("wallets");
      if (!draft.walletsPath) {
        await studio.pickWallets();
      }
      // Re-check after picker
      const walletsPath = studio.draft.walletsPath;
      if (!walletsPath) {
        setCancelReason("Wallet selection was canceled. Your draft is safe.");
        setPhase("canceled");
        logAction({
          action: "publish",
          status: "canceled",
          startedAt: publishStartRef.current,
          endedAt: new Date().toISOString(),
          cancelReason: "wallet_picker_dismissed",
          mode: "studio",
        });
        return;
      }

      // Step 2: Choose save location for manifest
      setPhase("building");
      const manifestPath = await save({
        title: "Save Release Manifest",
        defaultPath: `${draft.title.toLowerCase().replace(/\s+/g, "-")}-manifest.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!manifestPath) {
        setCancelReason("Manifest save location was canceled. Nothing was created.");
        setPhase("canceled");
        logAction({
          action: "publish",
          status: "canceled",
          startedAt: publishStartRef.current,
          endedAt: new Date().toISOString(),
          cancelReason: "manifest_save_dismissed",
          mode: "studio",
        });
        return;
      }

      // Read wallet file to extract addresses
      const walletContent = await import("../../bridge/engine").then((m) =>
        m.loadFile(walletsPath)
      );
      const walletData = JSON.parse(walletContent);
      const issuerAddress = walletData.issuer?.classicAddress ?? walletData.issuer?.address ?? "";
      const operatorAddress = walletData.operator?.classicAddress ?? walletData.operator?.address ?? "";

      if (!issuerAddress || !operatorAddress) {
        throw new Error("Wallet file must contain issuer and operator with classicAddress fields");
      }

      // Build manifest from draft
      const manifest = draftToManifest(draft, issuerAddress, operatorAddress);
      await saveFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Choose receipt save location
      const receiptPath = await save({
        title: "Save Issuance Receipt",
        defaultPath: `${draft.title.toLowerCase().replace(/\s+/g, "-")}-receipt.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!receiptPath) {
        setCancelReason("Receipt save location was canceled. Manifest was saved but nothing was minted.");
        setPhase("canceled");
        logAction({
          action: "publish",
          status: "canceled",
          startedAt: publishStartRef.current,
          endedAt: new Date().toISOString(),
          cancelReason: "receipt_save_dismissed",
          artifactPath: manifestPath,
          mode: "studio",
        });
        return;
      }

      // Step 3: Mint through the real engine (with timeout)
      setPhase("minting");
      lastMintPathsRef.current = { manifestPath, walletsPath, receiptPath };

      const mintPromise = release.runMintFromStudio(manifestPath, walletsPath, receiptPath);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__TIMEOUT__")), MINT_TIMEOUT_MS)
      );

      await Promise.race([mintPromise, timeoutPromise]);

      setPhase("done");

      // Persist artifact paths for restart recovery
      saveSession({
        artifactPaths: {
          manifestPath,
          receiptPath,
          accessPolicyPath: null,
          recoveryBundlePath: null,
          governancePolicyPath: null,
          proposalPath: null,
          decisionPath: null,
          executionPath: null,
        },
        completed: { published: true, verified: false, accessTested: false, recoveryGenerated: false },
      }).catch(() => {});

      logAction({
        action: "publish",
        status: "done",
        startedAt: publishStartRef.current,
        endedAt: new Date().toISOString(),
        artifactPath: receiptPath,
        releaseIdentity: `${draft.title} — ${draft.artist}`,
        mode: "studio",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__TIMEOUT__") {
        setTimeoutReason(
          "The mint operation is taking longer than expected. " +
          "It may still complete on the XRPL network. " +
          "Use 'Check Status' to verify, or retry if needed."
        );
        setPhase("timed_out");
        logAction({
          action: "publish",
          status: "timed_out",
          startedAt: publishStartRef.current!,
          endedAt: new Date().toISOString(),
          timeoutReason: `mint exceeded ${MINT_TIMEOUT_MS}ms`,
          artifactPath: lastMintPathsRef.current?.receiptPath,
          mode: "studio",
        });
      } else {
        setError(msg);
        setPhase("error");
        logAction({
          action: "publish",
          status: "error",
          startedAt: publishStartRef.current!,
          endedAt: new Date().toISOString(),
          releaseIdentity: draft.title ? `${draft.title} — ${draft.artist}` : undefined,
          mode: "studio",
        });
      }
    }
  }, [draft, studio, release]);

  /** After a timeout, attempt to reconcile by verifying the receipt file. */
  const handleReconcile = useCallback(async () => {
    if (!lastMintPathsRef.current) return;
    try {
      const { receiptPath } = lastMintPathsRef.current;
      const content = await import("../../bridge/engine").then((m) => m.loadFile(receiptPath));
      const receipt = JSON.parse(content);
      if (receipt?.xrpl?.nftTokenIds?.length > 0) {
        // The mint actually succeeded — the timeout was just slow response
        setPhase("done");
        setTimeoutReason(null);
        logAction({
          action: "publish_reconcile",
          status: "done",
          startedAt: new Date().toISOString(),
          reconciliationResult: "receipt_found_valid",
          artifactPath: receiptPath,
          mode: "studio",
        });
      } else {
        setTimeoutReason("Receipt file exists but contains no token IDs. The mint may not have completed. You can retry safely.");
      }
    } catch {
      setTimeoutReason("No receipt file found. The mint likely did not complete. You can retry safely.");
    }
  }, []);

  if (!canProceedToPublish) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Publish</h2>
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Complete the release info, collector benefit, and review before publishing.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionButton label="\u2190 Back to Review" onClick={() => setActiveStep("review")} variant="secondary" />
          </div>
        </ArtifactCard>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        {phase === "done" ? "Published!" : "Publish your release"}
      </h2>

      {error && <ErrorBanner message={error} />}
      {cancelReason && phase === "canceled" && (
        <CancelBanner message={cancelReason} onRetry={() => { setCancelReason(null); setPhase("ready"); }} />
      )}
      {timeoutReason && phase === "timed_out" && (
        <TimeoutBanner
          message={timeoutReason}
          onReconcile={handleReconcile}
          onRetry={() => { setTimeoutReason(null); setPhase("ready"); }}
        />
      )}

      {/* Pre-publish readiness */}
      {(phase === "ready" || phase === "error" || phase === "canceled") && (
        <>
          <ArtifactCard>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
              Ready to publish?
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              Publishing creates your release on the XRPL Testnet. This mints
              {draft.editionSize === 1 ? " 1 unique NFT" : ` ${draft.editionSize} NFTs`} that
              represent ownership of <strong style={{ color: "var(--text)" }}>{draft.title}</strong>.
            </p>

            <ReadinessCheck label="Release title" ok={!!draft.title} />
            <ReadinessCheck label="Artist name" ok={!!draft.artist} />
            <ReadinessCheck label="Edition size" ok={draft.editionSize >= 1} />
            <ReadinessCheck label="Collector benefit" ok={!!draft.benefitDescription} />
            <ReadinessCheck label="Cover art" ok={!!draft.coverArtPath} warn={!draft.coverArtPath} warnText="Optional but recommended" />
            <ReadinessCheck label="Main file" ok={!!draft.mediaFilePath} warn={!draft.mediaFilePath} warnText="Optional but recommended" />
            <ReadinessCheck
              label="Wallet credentials"
              ok={!!draft.walletsPath}
              warn={!draft.walletsPath}
              warnText="Will be requested during publish"
            />
          </ArtifactCard>

          <ArtifactCard>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              What happens when you publish
            </div>
            <StepPreview number={1} text="Your release details are saved as a manifest file" />
            <StepPreview number={2} text={`${draft.editionSize} NFT${draft.editionSize !== 1 ? "s" : ""} ${draft.editionSize !== 1 ? "are" : "is"} minted on XRPL Testnet`} />
            <StepPreview number={3} text="A receipt is saved with the transaction proof" />
            <StepPreview number={4} text="You can test the collector experience immediately" />
          </ArtifactCard>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <ActionButton label="\u2190 Back to Review" onClick={() => setActiveStep("review")} variant="secondary" />
            <ActionButton label="Publish Release" onClick={handlePublish} />
          </div>
        </>
      )}

      {/* Publishing progress */}
      {(phase === "wallets" || phase === "building" || phase === "minting") && (
        <ArtifactCard>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>
            Publishing your release...
          </div>
          <ProgressStep
            label="Loading wallet credentials"
            sublabel="Securely loading your signing keys"
            active={phase === "wallets"}
            done={phase !== "wallets"}
          />
          <ProgressStep
            label="Building release manifest"
            sublabel="Converting your release into a canonical artifact"
            active={phase === "building"}
            done={phase === "minting"}
          />
          <ProgressStep
            label="Minting on XRPL Testnet"
            sublabel="Submitting your release to the ledger — this may take a moment"
            active={phase === "minting"}
            done={false}
          />
          {phase === "minting" && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
              Your release is being submitted to the XRPL network. This typically takes 10-30 seconds.
              Do not close the app — the transaction is in progress.
            </div>
          )}
        </ArtifactCard>
      )}

      {/* Timeout state — minting took too long */}
      {phase === "timed_out" && (
        <ArtifactCard>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--warning)" }}>
            Publish status uncertain
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            The mint operation timed out before confirming. This does not mean it failed —
            the transaction may still be processing on the XRPL network.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
            Use "Check Status" to look for the receipt file. If it exists with token IDs,
            your release was successfully published.
          </p>
        </ArtifactCard>
      )}

      {/* Success */}
      {phase === "done" && release.mint.receipt && (
        <>
          <ArtifactCard>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--success)",
                marginBottom: 12,
              }}
            >
              Your release is live!
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text)" }}>{draft.title}</strong> by <strong style={{ color: "var(--text)" }}>{draft.artist}</strong> has
              been minted on XRPL Testnet.
              {release.mint.receipt.xrpl.nftTokenIds.length > 0 && (
                <> {release.mint.receipt.xrpl.nftTokenIds.length} NFT{release.mint.receipt.xrpl.nftTokenIds.length !== 1 ? "s" : ""} created.</>
              )}
            </p>

            {release.mint.receipt.xrpl.nftTokenIds.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>First Token ID</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
                  {release.mint.receipt.xrpl.nftTokenIds[0]}
                </div>
              </div>
            )}

            {release.mint.receipt.xrpl.mintTxHashes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Transaction Hash</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
                  {release.mint.receipt.xrpl.mintTxHashes[0]}
                </div>
              </div>
            )}
          </ArtifactCard>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <ActionButton
              label="Test Collector Experience \u2192"
              onClick={() => setActiveStep("test")}
            />
            <ActionButton
              label="View Proof (Advanced)"
              onClick={() => setActiveStep("proof")}
              variant="secondary"
            />
          </div>
        </>
      )}
    </div>
  );
}

function ReadinessCheck({ label, ok, warn, warnText }: {
  label: string;
  ok: boolean;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
      <span style={{ fontSize: 14, color: ok ? "var(--success)" : warn ? "var(--warning)" : "var(--text-dim)" }}>
        {ok ? "\u2713" : warn ? "\u26A0" : "\u25CB"}
      </span>
      <span style={{ fontSize: 13, color: ok ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
      {!ok && warnText && (
        <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 4 }}>({warnText})</span>
      )}
    </div>
  );
}

function StepPreview({ number, text }: { number: number; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: "var(--accent)",
        width: 20, height: 20, borderRadius: "50%",
        border: "1px solid var(--accent)", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {number}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: "20px" }}>{text}</span>
    </div>
  );
}

function ProgressStep({ label, sublabel, active, done }: {
  label: string;
  sublabel?: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <span style={{
        fontSize: 14,
        lineHeight: "20px",
        color: done ? "var(--success)" : active ? "var(--accent)" : "var(--text-dim)",
      }}>
        {done ? "\u2713" : active ? "\u25CF" : "\u25CB"}
      </span>
      <div>
        <div style={{ fontSize: 13, color: active ? "var(--text)" : done ? "var(--text-muted)" : "var(--text-dim)" }}>
          {label}{active ? "..." : ""}
        </div>
        {sublabel && active && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
