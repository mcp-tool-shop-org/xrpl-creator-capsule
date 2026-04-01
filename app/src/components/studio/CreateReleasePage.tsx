import { useStudio, type BenefitKind, type StudioCollaborator } from "../../state/studio";
import { ArtifactCard, ActionButton } from "../panels/PanelShell";
import type { SignerRole } from "../../bridge/engine";

const ROLES: SignerRole[] = ["artist", "producer", "label", "manager", "collaborator", "other"];

export function CreateReleasePage() {
  const {
    draft,
    updateDraft,
    pickCoverArt,
    pickMediaFile,
    addCollaborator,
    updateCollaborator,
    removeCollaborator,
    saveDraft,
    loadDraft,
    canProceedToBenefit,
    setActiveStep,
  } = useStudio();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Create Release</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton label="Load Draft" onClick={loadDraft} variant="secondary" />
          <ActionButton label="Save Draft" onClick={saveDraft} variant="secondary" />
        </div>
      </div>

      {/* What is this release? */}
      <ArtifactCard>
        <SectionTitle>What are you releasing?</SectionTitle>
        <HelpText>
          Give your release a name and tell us who made it. This is what
          collectors see first.
        </HelpText>

        <Field label="Release title">
          <input
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
            placeholder="My Amazing Album"
            style={inputStyle}
          />
        </Field>

        <Field label="Artist name">
          <input
            value={draft.artist}
            onChange={(e) => updateDraft({ artist: e.target.value })}
            placeholder="Your name or project name"
            style={inputStyle}
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={draft.description}
            onChange={(e) => updateDraft({ description: e.target.value })}
            placeholder="A few words about this release..."
            style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <Field label="How many editions?">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="number"
              min={1}
              max={10000}
              value={draft.editionSize}
              onChange={(e) => updateDraft({ editionSize: Math.max(1, Number(e.target.value)) })}
              style={{ ...inputStyle, width: 100 }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {draft.editionSize === 1
                ? "1 unique edition (1-of-1)"
                : `${draft.editionSize} editions`}
            </span>
          </div>
        </Field>
      </ArtifactCard>

      {/* Files */}
      <ArtifactCard>
        <SectionTitle>Attach your files</SectionTitle>
        <HelpText>
          Choose the cover art and main media file for this release.
          These will be stored durably so collectors can always access them.
        </HelpText>

        <FileRow
          label="Cover art"
          path={draft.coverArtPath}
          onPick={pickCoverArt}
          hint="PNG, JPG, or WebP"
        />

        <FileRow
          label="Main file"
          path={draft.mediaFilePath}
          onPick={pickMediaFile}
          hint="Audio, video, image, or archive"
        />
      </ArtifactCard>

      {/* Collaborators (optional) */}
      <ArtifactCard>
        <SectionTitle>Collaborators (optional)</SectionTitle>
        <HelpText>
          Add collaborators who should receive payouts from this release.
          You can skip this and add them later.
        </HelpText>

        {draft.collaborators.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {draft.collaborators.map((c, i) => (
              <CollaboratorRow
                key={i}
                collaborator={c}
                onChange={(partial) => updateCollaborator(i, partial)}
                onRemove={() => removeCollaborator(i)}
              />
            ))}
          </div>
        )}

        <button onClick={addCollaborator} style={addStyle}>
          + Add collaborator
        </button>

        {draft.collaborators.length > 0 && (
          <Field label="Treasury address (where funds are held)">
            <input
              value={draft.treasuryAddress}
              onChange={(e) => updateDraft({ treasuryAddress: e.target.value })}
              placeholder="rTreasuryAddress..."
              style={inputStyle}
            />
          </Field>
        )}
      </ArtifactCard>

      {/* Draft status */}
      {draft.draftPath && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
          Draft saved: {draft.draftPath}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <ActionButton
          label="Next: Collector Benefit \u2192"
          onClick={() => setActiveStep("benefit")}
          disabled={!canProceedToBenefit}
        />
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
      {children}
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function FileRow({ label, path, onPick, hint }: {
  label: string;
  path: string | null;
  onPick: () => void;
  hint: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <button
        onClick={onPick}
        style={{
          padding: "8px 16px",
          fontSize: 12,
          fontWeight: 600,
          border: "1px dashed var(--border)",
          borderRadius: 6,
          background: "transparent",
          color: "var(--text-muted)",
          cursor: "pointer",
          minWidth: 120,
        }}
      >
        {path ? "Change" : `Choose ${label}`}
      </button>
      {path ? (
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
          {path.split(/[\\/]/).pop()}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{hint}</span>
      )}
    </div>
  );
}

function CollaboratorRow({ collaborator, onChange, onRemove }: {
  collaborator: StudioCollaborator;
  onChange: (partial: Partial<StudioCollaborator>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={collaborator.name}
        placeholder="Name"
        onChange={(e) => onChange({ name: e.target.value })}
        style={{ ...inputStyle, flex: 1, minWidth: 100 }}
      />
      <select
        value={collaborator.role}
        onChange={(e) => onChange({ role: e.target.value as SignerRole })}
        style={{ ...inputStyle, width: 110 }}
      >
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input
        value={collaborator.address}
        placeholder="rWalletAddress..."
        onChange={(e) => onChange({ address: e.target.value })}
        style={{ ...inputStyle, flex: 2, minWidth: 140 }}
      />
      <input
        type="number"
        min={0}
        max={100}
        value={collaborator.splitPercent}
        onChange={(e) => onChange({ splitPercent: Number(e.target.value) })}
        placeholder="%"
        style={{ ...inputStyle, width: 60 }}
      />
      <button onClick={onRemove} style={removeStyle}>&times;</button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
};

const addStyle: React.CSSProperties = {
  background: "none",
  border: "1px dashed var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "6px 12px",
  fontSize: 12,
  width: "100%",
  marginBottom: 12,
};

const removeStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "4px 8px",
  fontSize: 14,
};
