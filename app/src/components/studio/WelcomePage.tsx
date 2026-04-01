import { useStudio } from "../../state/studio";
import { ArtifactCard, ActionButton } from "../panels/PanelShell";

interface Props {
  onLoadSample: () => void;
  onStartFresh: () => void;
}

export function WelcomePage({ onLoadSample, onStartFresh }: Props) {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Welcome to Capsule
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        Create, publish, and protect your creative releases on the XRPL blockchain.
        Each release is cryptographically signed, verifiable, and recoverable.
      </p>

      {/* Preview notice */}
      <ArtifactCard>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 3,
            background: "var(--warning)" + "25",
            color: "var(--warning)",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            Preview
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Public Preview — Testnet Only
          </span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
          This is an early release candidate. Minting uses XRPL Testnet (free test tokens, no real value).
          Your feedback shapes the product — use the "Report" button in the title bar if anything
          feels confusing or broken.
        </p>
      </ArtifactCard>

      {/* Quick start options */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
          Get started
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}>
          {/* Try the demo */}
          <button
            onClick={onLoadSample}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--accent-dim)",
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>
              Try the demo
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Load a sample release to explore the full workflow.
              See how Studio Mode works before using your own files.
            </div>
          </button>

          {/* Start fresh */}
          <button
            onClick={onStartFresh}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              Create a release
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Start from scratch with your own music, art, or media.
              The guided flow walks you through each step.
            </div>
          </button>
        </div>
      </ArtifactCard>

      {/* How it works */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
          How it works
        </div>
        <Step number={1} title="Describe your release" description="Title, artist, edition size, and files. This becomes your release identity." />
        <Step number={2} title="Set collector benefits" description="Choose what collectors receive — bonus tracks, stems, high-res art, or custom content." />
        <Step number={3} title="Review and publish" description="Check ownership terms, then mint NFTs on XRPL Testnet. Each edition is a real on-chain token." />
        <Step number={4} title="Test and protect" description="Verify collector access works, then generate a recovery bundle that proves ownership forever." />
      </ArtifactCard>

      {/* What Capsule is */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
          What makes this different
        </div>
        <BulletPoint text="Your release lives on-chain — not on a platform that can disappear" />
        <BulletPoint text="Recovery bundles prove ownership even if this app stops existing" />
        <BulletPoint text="Collector access is cryptographically verified, not password-gated" />
        <BulletPoint text="Every artifact is hash-chained — tampering is mathematically detectable" />
        <BulletPoint text="Advanced mode lets you inspect every proof artifact directly" />
      </ArtifactCard>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: "var(--accent)",
        width: 24, height: 24, borderRadius: "50%",
        border: "1px solid var(--accent)", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {number}
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
      <span style={{ color: "var(--success)", fontSize: 12, lineHeight: "18px" }}>{"\u2713"}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
