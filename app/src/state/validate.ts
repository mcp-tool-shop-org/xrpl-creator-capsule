/**
 * Runtime shape validators for locally-persisted app state (F-343bb92d).
 *
 * capsule-session.json (in appDataDir) and any user-chosen *-draft.json
 * are ordinary user-writable JSON files on disk — unlike the engine
 * layer's artifacts (manifest/receipt/access-policy/etc.), which are
 * validated on every load via assertManifest/assertReceipt/
 * assertAccessPolicy/etc. in bridge-worker.ts, these local files were
 * previously trusted at face value via `JSON.parse(content) as T`. A
 * hand-edited or partially-written file (e.g. from a crash mid-write, or
 * manual editing via the exposed "Load Draft" button) can type-check
 * past the `as` cast while violating the real shape — e.g.
 * `collaborators` not an array, `editionSize` a string — and then throw
 * deep inside a consumer instead of surfacing as a friendly error.
 *
 * These are deliberately hand-rolled structural checks (no schema
 * library, no new dependency) that verify only the field types
 * consumers actually rely on — the ones a `.map`/`.filter`/`.trim`/
 * arithmetic comparison gets called on, or that drive a lookup (e.g.
 * `activeStep` indexes `pageMap` in StudioShell.tsx). Unknown extra
 * fields are deliberately tolerated (not rejected) so a file written by
 * a newer version of the app does not get treated as corrupt by an
 * older one.
 */
import type { StudioDraft, StudioCollaborator, StudioStep } from "./studio";
import type { SessionState } from "./session";

// ── Shared primitives ────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const VALID_STUDIO_STEPS: ReadonlySet<StudioStep> = new Set([
  "create",
  "benefit",
  "review",
  "publish",
  "test",
  "recovery",
  "proof",
]);

// ── StudioDraft ───────────────────────────────────────────────────────

function isValidCollaborator(value: unknown): value is StudioCollaborator {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.role === "string" &&
    typeof value.address === "string" &&
    typeof value.splitPercent === "number"
  );
}

/**
 * Structural check for a parsed *-draft.json (or a SessionState's
 * embedded `draft` field). Checked fields mirror exactly what
 * consumers rely on today:
 *   - title/artist/benefitDescription: `.trim()` in studio.tsx's
 *     readiness checks
 *   - editionSize: `>= 1` numeric comparison
 *   - collaborators: `.map`/`.filter`/`.length` in CreateReleasePage.tsx,
 *     ReviewPage.tsx, PublishPage.tsx — the concrete crash vector named
 *     in F-b69d884a
 *   - the *Path fields: rendered directly or split on path separators
 *     (FileRow in CreateReleasePage.tsx)
 */
export function isValidStudioDraft(value: unknown): value is StudioDraft {
  if (!isPlainObject(value)) return false;

  return (
    typeof value.title === "string" &&
    typeof value.artist === "string" &&
    typeof value.description === "string" &&
    typeof value.editionSize === "number" &&
    isNullableString(value.coverArtPath) &&
    isNullableString(value.mediaFilePath) &&
    typeof value.benefitKind === "string" &&
    typeof value.benefitDescription === "string" &&
    isNullableString(value.benefitContentPath) &&
    typeof value.transferFeePercent === "number" &&
    typeof value.licenseType === "string" &&
    typeof value.licenseSummary === "string" &&
    Array.isArray(value.collaborators) &&
    value.collaborators.every(isValidCollaborator) &&
    typeof value.treasuryAddress === "string" &&
    isNullableString(value.walletsPath) &&
    isNullableString(value.draftPath)
  );
}

// ── SessionState ──────────────────────────────────────────────────────

const ARTIFACT_PATH_KEYS = [
  "manifestPath",
  "receiptPath",
  "accessPolicyPath",
  "recoveryBundlePath",
  "governancePolicyPath",
  "proposalPath",
  "decisionPath",
  "executionPath",
] as const;

const COMPLETED_KEYS = [
  "published",
  "verified",
  "accessTested",
  "recoveryGenerated",
] as const;

/**
 * Structural check for a parsed capsule-session.json. Subsumes the
 * existing `version !== 1` check (loadSession used to check only that)
 * plus every field a consumer actually reads:
 *   - draft: reused via isValidStudioDraft when non-null
 *   - activeStep: indexes `pageMap[activeStep]` in StudioShell.tsx — an
 *     unrecognized value would render `undefined` as a component and
 *     crash, the same class of bug as the draft-shape issue
 *   - mode: drives the Studio/Advanced conditional in App.tsx
 *   - artifactPaths / completed: read field-by-field in session.ts's
 *     own validateSession() and in support/bundle.ts
 */
export function isValidSessionState(value: unknown): value is SessionState {
  if (!isPlainObject(value)) return false;

  if (value.version !== 1) return false;
  if (typeof value.savedAt !== "string") return false;
  if (value.draft !== null && !isValidStudioDraft(value.draft)) return false;
  if (typeof value.activeStep !== "string" || !VALID_STUDIO_STEPS.has(value.activeStep as StudioStep)) {
    return false;
  }
  if (value.mode !== "studio" && value.mode !== "advanced") return false;

  if (!isPlainObject(value.artifactPaths)) return false;
  for (const key of ARTIFACT_PATH_KEYS) {
    if (!isNullableString(value.artifactPaths[key])) return false;
  }

  if (!isPlainObject(value.completed)) return false;
  for (const key of COMPLETED_KEYS) {
    if (typeof value.completed[key] !== "boolean") return false;
  }

  return true;
}
