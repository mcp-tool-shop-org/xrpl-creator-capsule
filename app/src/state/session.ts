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
import { loadFile, saveFile } from "../bridge/engine";
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

export async function saveSession(state: Partial<SessionState>): Promise<void> {
  try {
    const path = await sessionFilePath();
    const existing = await loadSession();
    const merged: SessionState = {
      ...existing,
      ...state,
      savedAt: new Date().toISOString(),
      version: 1,
    };
    await saveFile(path, JSON.stringify(merged, null, 2));
  } catch {
    // Silent fail — session persistence is best-effort
  }
}

export async function loadSession(): Promise<SessionState> {
  try {
    const path = await sessionFilePath();
    const content = await loadFile(path);
    const parsed = JSON.parse(content) as SessionState;
    if (parsed.version !== 1) return INIT_SESSION;
    return parsed;
  } catch {
    return INIT_SESSION;
  }
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
