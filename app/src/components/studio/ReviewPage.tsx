import { useStudio } from "../../state/studio";
import { ArtifactCard, ActionButton } from "../panels/PanelShell";

const BENEFIT_LABELS: Record<string, string> = {
  "bonus-track": "Bonus Track",
  "stems": "Stems Pack",
  "high-res-artwork": "High-Res Artwork",
  "private-note": "Private Note",
  "custom": "Custom Benefit",
};

const LICENSE_LABELS: Record<string, string> = {
  "personal-use": "Personal, non-commercial use",
  "cc-by": "Creative Commons Attribution",
  "cc-by-nc": "Creative Commons Non-Commercial",
  "all-rights": "All rights reserved",
};

export function ReviewPage() {
  const { draft, updateDraft, canProceedToReview, setActiveStep } = useStudio();

  if (!canProceedToReview) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Review</h2>
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Complete the release info and collector benefit first.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionButton label="\u2190 Back" onClick={() => setActiveStep("create")} variant="secondary" />
          </div>
        </ArtifactCard>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        Review before publishing
      </h2>

      {/* Release summary */}
      <ArtifactCard>
        <SectionTitle>Your release</SectionTitle>
        <ReviewRow label="Title" value={draft.title} />
        <ReviewRow label="Artist" value={draft.artist} />
        <ReviewRow label="Editions" value={`${draft.editionSize} ${draft.editionSize === 1 ? "unique edition" : "editions"}`} />
        {draft.description && <ReviewRow label="Description" value={draft.description} />}
        <ReviewRow label="Cover art" value={draft.coverArtPath ? fileName(draft.coverArtPath) : "Not selected"} dim={!draft.coverArtPath} />
        <ReviewRow label="Main file" value={draft.mediaFilePath ? fileName(draft.mediaFilePath) : "Not selected"} dim={!draft.mediaFilePath} />
      </ArtifactCard>

      {/* Collector benefit */}
      <ArtifactCard>
        <SectionTitle>What collectors receive</SectionTitle>
        <ReviewRow label="Benefit type" value={BENEFIT_LABELS[draft.benefitKind] ?? draft.benefitKind} />
        <ReviewRow label="Description" value={draft.benefitDescription} />
        <ReviewRow
          label="Bonus content"
          value={draft.benefitContentPath ? fileName(draft.benefitContentPath) : "Not attached yet"}
          dim={!draft.benefitContentPath}
        />
      </ArtifactCard>

      {/* Ownership & rights */}
      <ArtifactCard>
        <SectionTitle>Ownership & safety</SectionTitle>
        <HelpText>
          These settings define who issues the release and what rights collectors
          receive. You can adjust them before publishing.
        </HelpText>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            License terms
          </div>
          <select
            value={draft.licenseType}
            onChange={(e) => {
              const type = e.target.value;
              const summaries: Record<string, string> = {
                "personal-use": "Personal, non-commercial use. No redistribution.",
                "cc-by": "Creative Commons Attribution 4.0. Credit required.",
                "cc-by-nc": "Creative Commons Non-Commercial. No commercial use without permission.",
                "all-rights": "All rights reserved by the artist.",
              };
              updateDraft({ licenseType: type, licenseSummary: summaries[type] ?? "" });
            }}
            style={selectStyle}
          >
            <option value="personal-use">Personal use only</option>
            <option value="cc-by">Creative Commons (attribution)</option>
            <option value="cc-by-nc">Creative Commons (non-commercial)</option>
            <option value="all-rights">All rights reserved</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Creator royalty on resale
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={draft.transferFeePercent}
              onChange={(e) => updateDraft({ transferFeePercent: Number(e.target.value) })}
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
          </div>
        </div>

        <div style={{ padding: 12, background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <SafetyItem label="Collectors receive" value={`Access to ${BENEFIT_LABELS[draft.benefitKind] ?? draft.benefitKind}`} />
          <SafetyItem label="Collectors do not own" value="The master recording or underlying IP" />
          <SafetyItem label="License" value={LICENSE_LABELS[draft.licenseType] ?? draft.licenseSummary} />
          <SafetyItem label="Resale royalty" value={`${draft.transferFeePercent}% goes back to the creator`} />
          <SafetyItem label="Recovery" value="Release can be reconstructed without the app" />
          <SafetyItem label="Network" value="XRPL Testnet" />
        </div>
      </ArtifactCard>

      {/* Collaborators */}
      {draft.collaborators.length > 0 && (
        <ArtifactCard>
          <SectionTitle>Collaborators</SectionTitle>
          {draft.collaborators.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text)" }}>{c.name || "Unnamed"}</span>
              <span style={{ color: "var(--text-muted)" }}>{c.role}</span>
              <span style={{ marginLeft: "auto", color: "var(--text-dim)" }}>{c.splitPercent}%</span>
            </div>
          ))}
          {draft.treasuryAddress && (
            <div style={{ marginTop: 8 }}>
              <SafetyItem label="Treasury" value={draft.treasuryAddress} mono />
            </div>
          )}
        </ArtifactCard>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <ActionButton label="\u2190 Back to Benefit" onClick={() => setActiveStep("benefit")} variant="secondary" />
        <ActionButton
          label="Ready to Publish \u2192"
          onClick={() => setActiveStep("publish")}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text)" }}>
      {children}
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function ReviewRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: dim ? "var(--text-dim)" : "var(--text)", fontStyle: dim ? "italic" : "normal" }}>
        {value}
      </span>
    </div>
  );
}

function SafetyItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: mono ? "monospace" : "inherit" }}>{value}</div>
    </div>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
};
