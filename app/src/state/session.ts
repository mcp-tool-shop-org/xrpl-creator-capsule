/**
 * Session persistence — saves and restores app state across restarts.
 *
 * Stores session state in the Tauri app data directory as JSON.
 * Distinguishes between:
 *   - Draft state (artist intent, pre-manifest)
 *   - Artifact paths (post-publish references to real files)
 *   - Completion flags (what has been published/verified)
 *
 * Published state is NEVER inferred from cache alone — it's only
 * marked true when an artifact file at the recorded path can be
 * read back and contains valid data.
 */

import { appDataDir } from "@tauri-apps/api/path";
import { loadFile, saveFile, saveFileAtomic } from "../bridge/engine";
import { isValidSessionState } from "./validate";
import { isNotFoundFsError } from "../errors/humanize";
import { logAction } from "./release";
import type { StudioDraft, StudioStep } from "./studio";

// ── Persisted shape ─────────────────────────────────────────────────

export interface SessionState {
  version: 1;
  savedAt: string;

  // Studio state
  draft: StudioDraft | null;
  activeStep: StudioStep;
  mode: "studio" | "advanced";

  // Artifact paths (references to files on disk)
  artifactPaths: {
    manifestPath: string | null;
    receiptPath: string | null;
    accessPolicyPath: string | null;
    recoveryBundlePath: string | null;
    governancePolicyPath: string | null;
    proposalPath: string | null;
    decisionPath: string | null;
    executionPath: string | null;
  };

  // Completion flags — only true when artifacts exist and are valid
  completed: {
    published: boolean;
    verified: boolean;
    accessTested: boolean;
    recoveryGenerated: boolean;
  };
}

const INIT_SESSION: SessionState = {
  version: 1,
  savedAt: "",
  draft: null,
  activeStep: "create",
  mode: "studio",
  artifactPaths: {
    manifestPath: null,
    receiptPath: null,
    accessPolicyPath: null,
    recoveryBundlePath: null,
    governancePolicyPath: null,
    proposalPath: null,
    decisionPath: null,
    executionPath: null,
  },
  completed: {
    published: false,
    verified: false,
    accessTested: false,
    recoveryGenerated: false,
  },
};

const SESSION_FILENAME = "capsule-session.json";

// ── Helpers ─────────────────────────────────────────────────────────

async function sessionFilePath(): Promise<string> {
  const dataDir = await appDataDir();
  // Normalize path separators for cross-platform
  const dir = dataDir.replace(/\\/g, "/").replace(/\/$/, "");
  return `${dir}/${SESSION_FILENAME}`;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * F-27abf0dc: previously wrapped in try/catch with a comment reading
 * "Silent fail — session persistence is best-effort" and NO logging on
 * any failure anywhere. Best-effort semantics are preserved — a failed
 * autosave must never throw, and must never block editing, since the
 * draft itself already lives safely in React state regardless of
 * whether this particular write lands — but the failure is no longer
 * invisible: it is logged via the action log (support/bundle.ts's
 * "Report" export reads the same log — see F-7f36d738), and the
 * resolved `{ ok }` flag lets a caller that cares (studio.tsx's autosave
 * loop) surface a non-blocking "autosave isn't working" notice instead
 * of the failure vanishing with zero trail.
 *
 * The write itself is now atomic (temp file + rename via
 * save_file_atomic) rather than a plain in-place write, so a crash
 * mid-write can no longer leave a torn JSON file for the NEXT
 * loadSession() to trip over — closing the other half of this finding.
 */
export async function saveSession(state: Partial<SessionState>): Promise<{ ok: boolean }> {
  try {
    const path = await sessionFilePath();
    const existing = await loadSession();
    const merged: SessionState = {
      ...existing,
      ...state,
      savedAt: new Date().toISOString(),
      version: 1,
    };
    await saveFileAtomic(path, JSON.stringify(merged, null, 2));
    return { ok: true };
  } catch {
    logAction({
      action: "session_autosave",
      status: "error",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
    return { ok: false };
  }
}

/**
 * F-27abf0dc: distinguishes two previously-conflated cases that used to
 * both fall into the same silent INIT_SESSION fallback:
 *
 *   1. "Never saved yet" (first launch, or right after a reset) — the
 *      normal, expected, non-problem case. Stays completely silent: no
 *      log, no throw.
 *   2. "A session file EXISTS but could not be read or parsed" (a
 *      permission problem, or — the concrete motivating scenario — a
 *      torn/truncated file from an interrupted non-atomic write, which
 *      saveSession's new atomic write now prevents going forward, but
 *      old on-disk files or non-autosave writers could still produce).
 *      This is a real problem worth knowing about: it is now logged AND
 *      rethrown, so the ALREADY-EXISTING sessionError catch in
 *      studio.tsx's session-restore effect — previously dead code,
 *      since loadSession() never threw — can finally fire and tell the
 *      user something instead of just silently starting them on a blank
 *      Studio Mode with no explanation.
 *
 * A third case — the file reads and parses fine as JSON but fails
 * isValidSessionState()'s shape check — is deliberately left on the
 * QUIET path, unchanged from before. That check (F-343bb92d) already
 * tolerates unknown extra fields specifically so a file written by a
 * NEWER app version doesn't read as "corrupt" to an older one; treating
 * every shape mismatch as a loud user-facing error would undermine that
 * forward-compatibility goal for what usually isn't real corruption.
 */
export async function loadSession(): Promise<SessionState> {
  const path = await sessionFilePath();

  let content: string;
  try {
    content = await loadFile(path);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (isNotFoundFsError(raw)) {
      return INIT_SESSION;
    }
    logAction({
      action: "session_load",
      status: "error",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    logAction({
      action: "session_load",
      status: "error",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
    throw err;
  }

  // F-343bb92d: capsule-session.json is an ordinary user-writable file
  // (crash mid-write, manual edit) — a structural shape check runs
  // here instead of a bare `as SessionState` cast. See the module-level
  // note above for why this specific case stays on the quiet path.
  if (!isValidSessionState(parsed)) return INIT_SESSION;
  return parsed;
}

export async function clearSession(): Promise<void> {
  try {
    const path = await sessionFilePath();
    await saveFile(path, JSON.stringify(INIT_SESSION, null, 2));
  } catch {
    // Silent fail
  }
}

/**
 * Validate that artifact paths still point to readable files.
 * Returns a copy with broken paths set to null and completion
 * flags cleared for missing artifacts.
 */
export async function validateSession(session: SessionState): Promise<SessionState> {
  const validated = { ...session };
  const paths = { ...session.artifactPaths };
  const completed = { ...session.completed };

  // Check each artifact path
  const checks: [keyof typeof paths, () => void][] = [
    ["manifestPath", () => { }],
    ["receiptPath", () => { completed.published = false; }],
    ["accessPolicyPath", () => { completed.accessTested = false; }],
    ["recoveryBundlePath", () => { completed.recoveryGenerated = false; }],
    ["governancePolicyPath", () => { }],
    ["proposalPath", () => { }],
    ["decisionPath", () => { }],
    ["executionPath", () => { }],
  ];

  for (const [key, onFail] of checks) {
    const p = paths[key];
    if (p) {
      try {
        await loadFile(p);
      } catch {
        paths[key] = null;
        onFail();
      }
    }
  }

  // Published must have both manifest AND receipt
  if (!paths.manifestPath || !paths.receiptPath) {
    completed.published = false;
  }

  validated.artifactPaths = paths;
  validated.completed = completed;
  return validated;
}
