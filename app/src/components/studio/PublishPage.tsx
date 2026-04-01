import { useState, useCallback } from "react";
import { useStudio } from "../../state/studio";
import { useRelease } from "../../state/release";
import { ArtifactCard, ActionButton, ErrorBanner, CheckRow } from "../panels/PanelShell";
import { saveFile } from "../../bridge/engine";
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

type PublishPhase = "ready" | "wallets" | "building" | "minting" | "done" | "error";

export function PublishPage() {
  const studio = useStudio();
  const { draft, canProceedToPublish, setActiveStep } = studio;
  const release = useRelease();

  const [phase, setPhase] = useState<PublishPhase>(
    release.mint.receipt ? "done" : "ready"
  );
  const [error, setError] = useState<string | null>(null);

  const handlePublish = useCallback(async () => {
    try {
      setError(null);

      // Step 1: Load wallets
      setPhase("wallets");
      if (!draft.walletsPath) {
        await studio.pickWallets();
      }
      // Re-check after picker
      const walletsPath = studio.draft.walletsPath;
      if (!walletsPath) {
        setPhase("ready");
        return; // User cancelled
      }

      // Step 2: Choose save location for manifest
      setPhase("building");
      const manifestPath = await save({
        title: "Save Release Manifest",
        defaultPath: `${draft.title.toLowerCase().replace(/\s+/g, "-")}-manifest.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!manifestPath) {
        setPhase("ready");
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
        setPhase("ready");
        return;
      }

      // Step 3: Mint through the real engine
      setPhase("minting");
      await release.runMintFromStudio(manifestPath, walletsPath, receiptPath);

      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [draft, studio, release]);

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

      {/* Pre-publish readiness */}
      {(phase === "ready" || phase === "error") && (
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
            Publishing...
          </div>
          <ProgressStep label="Loading wallet credentials" active={phase === "wallets"} done={phase !== "wallets"} />
          <ProgressStep label="Building release manifest" active={phase === "building"} done={phase === "minting" || phase === "done"} />
          <ProgressStep label="Minting on XRPL Testnet" active={phase === "minting"} done={phase === "done"} />
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

function ProgressStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ fontSize: 14, color: done ? "var(--success)" : active ? "var(--accent)" : "var(--text-dim)" }}>
        {done ? "\u2713" : active ? "\u25CF" : "\u25CB"}
      </span>
      <span style={{ fontSize: 13, color: active ? "var(--text)" : done ? "var(--text-muted)" : "var(--text-dim)" }}>
        {label}{active ? "..." : ""}
      </span>
    </div>
  );
}
