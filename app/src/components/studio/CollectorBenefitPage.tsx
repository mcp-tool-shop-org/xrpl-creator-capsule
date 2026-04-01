import { useStudio, type BenefitKind } from "../../state/studio";
import { ArtifactCard, ActionButton } from "../panels/PanelShell";

const BENEFIT_TEMPLATES: { kind: BenefitKind; label: string; description: string; icon: string }[] = [
  {
    kind: "bonus-track",
    label: "Bonus Track",
    description: "An extra song, remix, or acoustic version only collectors can access.",
    icon: "\uD83C\uDFB6",
  },
  {
    kind: "stems",
    label: "Stems Pack",
    description: "Individual instrument tracks so collectors can remix or study the production.",
    icon: "\uD83C\uDFDB",
  },
  {
    kind: "high-res-artwork",
    label: "High-Res Artwork",
    description: "Full-resolution cover art, behind-the-scenes visuals, or alternate covers.",
    icon: "\uD83D\uDDBC\uFE0F",
  },
  {
    kind: "private-note",
    label: "Private Note",
    description: "A personal message, story behind the work, or thank-you note for collectors.",
    icon: "\u2709\uFE0F",
  },
  {
    kind: "custom",
    label: "Custom Benefit",
    description: "Something unique — early access, physical goods, experiences, or anything else.",
    icon: "\u2728",
  },
];

export function CollectorBenefitPage() {
  const {
    draft,
    updateDraft,
    pickBenefitContent,
    canProceedToBenefit,
    canProceedToReview,
    setActiveStep,
  } = useStudio();

  if (!canProceedToBenefit) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Collector Access</h2>
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Complete the release info first. You need at least a title, artist name,
            and edition size before setting up what collectors receive.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionButton label="\u2190 Back to Release" onClick={() => setActiveStep("create")} variant="secondary" />
          </div>
        </ArtifactCard>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        What do collectors get?
      </h2>

      {/* Benefit picker */}
      <ArtifactCard>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          Choose what unlocks for people who collect <strong style={{ color: "var(--text)" }}>{draft.title}</strong>.
          This is the reason someone collects — make it worth it.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {BENEFIT_TEMPLATES.map((t) => {
            const selected = draft.benefitKind === t.kind;
            return (
              <button
                key={t.kind}
                onClick={() => updateDraft({ benefitKind: t.kind })}
                style={{
                  padding: 14,
                  border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: 8,
                  background: selected ? "var(--accent)" + "12" : "var(--bg)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "var(--accent)" : "var(--text)", marginBottom: 4 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {t.description}
                </div>
              </button>
            );
          })}
        </div>
      </ArtifactCard>

      {/* Benefit details */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          Describe the benefit
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          Tell collectors exactly what they're getting. Be specific — "3 bonus
          tracks from the studio sessions" is better than "bonus content."
        </p>

        <textarea
          value={draft.benefitDescription}
          onChange={(e) => updateDraft({ benefitDescription: e.target.value })}
          placeholder={placeholderFor(draft.benefitKind)}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 13,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            outline: "none",
            boxSizing: "border-box",
            minHeight: 80,
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
      </ArtifactCard>

      {/* Benefit file */}
      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          Attach the content (optional for now)
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          The file that collectors will be able to download or access.
          You can add this later before publishing.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={pickBenefitContent}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px dashed var(--border)",
              borderRadius: 6,
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {draft.benefitContentPath ? "Change file" : "Choose file"}
          </button>
          {draft.benefitContentPath && (
            <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)" }}>
              {draft.benefitContentPath.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
      </ArtifactCard>

      {/* Preview */}
      {draft.benefitDescription && (
        <ArtifactCard>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text)" }}>
            Collector preview
          </div>
          <div style={{
            padding: 16,
            background: "var(--bg)",
            borderRadius: 6,
            border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              What you get as a collector
            </div>
            <div style={{ fontSize: 18, marginBottom: 6 }}>
              {BENEFIT_TEMPLATES.find((t) => t.kind === draft.benefitKind)?.icon}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              {BENEFIT_TEMPLATES.find((t) => t.kind === draft.benefitKind)?.label}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {draft.benefitDescription}
            </div>
          </div>
        </ArtifactCard>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <ActionButton label="\u2190 Back to Release" onClick={() => setActiveStep("create")} variant="secondary" />
        <ActionButton
          label="Next: Review \u2192"
          onClick={() => setActiveStep("review")}
          disabled={!canProceedToReview}
        />
      </div>
    </div>
  );
}

function placeholderFor(kind: BenefitKind): string {
  switch (kind) {
    case "bonus-track":
      return "e.g., 3 unreleased tracks from the studio sessions, available as lossless WAV...";
    case "stems":
      return "e.g., Individual stems for all 12 tracks — drums, bass, vocals, synths...";
    case "high-res-artwork":
      return "e.g., 4000x4000px cover art plus 6 behind-the-scenes photos from the shoot...";
    case "private-note":
      return "e.g., A personal note about what inspired this album and what it means to me...";
    case "custom":
      return "Describe exactly what collectors receive...";
  }
}
