import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { saveSession, loadSession, clearSession, validateSession, type SessionState } from "./session";
import { VALID_SESSION, DRAFT } from "../__test__/fixtures";
import { getActionLog, clearActionLog } from "./release";

const mockInvoke = vi.mocked(invoke);

// Helper — configure loadFile/saveFile behavior
function mockLoadFile(results: Record<string, string | Error>) {
  mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "load_file") {
      const path = (args as { path: string }).path;
      const result = results[path];
      if (result instanceof Error) throw result;
      if (result !== undefined) return result;
      throw new Error(`File not found: ${path}`);
    }
    if (cmd === "save_file") return undefined;
    throw new Error(`Unknown command: ${cmd}`);
  });
}

function mockSaveCapture(): { calls: Array<{ path: string; content: string }> } {
  const calls: Array<{ path: string; content: string }> = [];
  mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "save_file") {
      const a = args as { path: string; content: string };
      calls.push({ path: a.path, content: a.content });
      return undefined;
    }
    if (cmd === "load_file") {
      throw new Error("File not found");
    }
    throw new Error(`Unknown command: ${cmd}`);
  });
  return { calls };
}

describe("session persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActionLog();
  });

  // ── loadSession ─────────────────────────────────────────────────

  describe("loadSession", () => {
    it("returns INIT_SESSION when no saved session exists", async () => {
      mockLoadFile({});
      const session = await loadSession();
      expect(session.version).toBe(1);
      expect(session.savedAt).toBe("");
      expect(session.mode).toBe("studio");
      expect(session.draft).toBeNull();
      expect(session.completed.published).toBe(false);
    });

    it("returns parsed session when file exists and is valid", async () => {
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(VALID_SESSION),
      });
      const session = await loadSession();
      expect(session.version).toBe(1);
      expect(session.mode).toBe("studio");
      expect(session.completed.published).toBe(true);
      expect(session.artifactPaths.manifestPath).toBe("/artifacts/manifest.json");
    });

    // F-27abf0dc: previously loadSession() swallowed EVERY failure
    // (missing file, unreadable file, or invalid JSON) into the same
    // silent INIT_SESSION fallback — indistinguishable from a totally
    // normal first launch, and studio.tsx's sessionError catch could
    // never fire for the one case that actually IS a problem: a session
    // file that exists but is corrupt (e.g. from an interrupted
    // non-atomic autosave write). loadSession() now distinguishes
    // "never saved yet" (still quiet — see the test below) from "exists
    // but unreadable/unparseable" (logged, and rethrown so the caller's
    // existing catch can surface it).
    it("logs and rethrows when a saved session file exists but contains invalid JSON, instead of silently resetting", async () => {
      mockLoadFile({
        "/mock/app-data/capsule-session.json": "NOT JSON {{{",
      });

      await expect(loadSession()).rejects.toThrow();

      const entries = getActionLog();
      expect(entries.some((e) => e.action === "session_load" && e.status === "error")).toBe(true);
    });

    it("logs and rethrows when the session file exists but a permission error prevents reading it", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") {
          throw new Error(
            "Failed to read /mock/app-data/capsule-session.json: Access is denied. (os error 5)"
          );
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      await expect(loadSession()).rejects.toThrow(/access is denied/i);
      expect(getActionLog().some((e) => e.action === "session_load" && e.status === "error")).toBe(true);
    });

    // The "never saved yet" case (first launch, or after a reset) must
    // stay silent — it is not a problem, and must not log or throw.
    it("stays silent (no log, no throw) when the session file has genuinely never been saved", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") {
          throw new Error(
            "Failed to read /mock/app-data/capsule-session.json: The system cannot find the file specified. (os error 2)"
          );
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const session = await loadSession();
      expect(session.version).toBe(1);
      expect(session.savedAt).toBe("");
      expect(getActionLog().some((e) => e.action === "session_load")).toBe(false);
    });

    it("returns INIT_SESSION when version is not 1", async () => {
      const badVersion = { ...VALID_SESSION, version: 99 };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(badVersion),
      });
      const session = await loadSession();
      expect(session.savedAt).toBe("");
      expect(session.completed.published).toBe(false);
    });

    // F-343bb92d: loadSession previously only checked `version !== 1` —
    // any other shape mismatch (e.g. a hand-edited or crash-truncated
    // file whose `completed`/`artifactPaths` fields are malformed) typed
    // past the `as SessionState` cast and was returned as-is, ready to
    // throw deep inside a consumer instead of falling back like a JSON
    // parse failure does.
    it("returns INIT_SESSION when completed fields are malformed despite version 1", async () => {
      const malformed = { ...VALID_SESSION, completed: { published: "yes" } };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(malformed),
      });
      const session = await loadSession();
      expect(session.savedAt).toBe("");
      expect(session.draft).toBeNull();
    });

    it("returns INIT_SESSION when artifactPaths is missing required keys despite version 1", async () => {
      const malformed = { ...VALID_SESSION, artifactPaths: {} };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(malformed),
      });
      const session = await loadSession();
      expect(session.savedAt).toBe("");
    });

    it("returns INIT_SESSION when activeStep is not a recognized step despite version 1", async () => {
      const malformed = { ...VALID_SESSION, activeStep: "not-a-real-step" };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(malformed),
      });
      const session = await loadSession();
      expect(session.savedAt).toBe("");
    });

    it("returns INIT_SESSION when the embedded draft has a malformed collaborators field", async () => {
      const malformed = {
        ...VALID_SESSION,
        draft: { ...DRAFT, collaborators: "not-an-array" },
      };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(malformed),
      });
      const session = await loadSession();
      expect(session.savedAt).toBe("");
      expect(session.draft).toBeNull();
    });

    it("still returns the parsed session when it carries unknown extra fields", async () => {
      const withExtra = { ...VALID_SESSION, futureField: "from a newer app version" };
      mockLoadFile({
        "/mock/app-data/capsule-session.json": JSON.stringify(withExtra),
      });
      const session = await loadSession();
      expect(session.version).toBe(1);
      expect(session.completed.published).toBe(true);
    });
  });

  // ── saveSession ─────────────────────────────────────────────────

  describe("saveSession", () => {
    // F-27abf0dc: saveSession now writes atomically (temp file + rename,
    // via the save_file_atomic command) instead of a plain save_file
    // write, so a crash mid-write can never leave a torn JSON file for
    // the next loadSession() to trip over.
    it("merges partial state with existing session and writes atomically", async () => {
      // First call is loadSession (inside saveSession), second is the write
      let loadCount = 0;
      const saved: string[] = [];
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file") {
          loadCount++;
          return JSON.stringify(VALID_SESSION);
        }
        if (cmd === "save_file_atomic") {
          saved.push((args as { content: string }).content);
          return undefined;
        }
        throw new Error(`Unexpected command in this test: ${cmd}`);
      });

      const result = await saveSession({ mode: "advanced" });

      expect(result.ok).toBe(true);
      expect(loadCount).toBe(1);
      expect(saved).toHaveLength(1);
      const written = JSON.parse(saved[0]) as SessionState;
      expect(written.mode).toBe("advanced");
      expect(written.completed.published).toBe(true); // preserved from existing
      expect(written.version).toBe(1);
      expect(written.savedAt).not.toBe(""); // timestamp updated
    });

    // F-27abf0dc: autosave must remain best-effort (never throws, never
    // blocks editing) but must no longer be INVISIBLE — a failure is now
    // both logged and reported back via the resolved { ok } flag so a
    // caller (studio.tsx's autosave loop) can surface a non-blocking
    // notice instead of the failure vanishing with zero trail.
    it("never throws when the save fails, but logs it and reports { ok: false }", async () => {
      mockInvoke.mockRejectedValue(new Error("Disk full"));

      const result = await saveSession({ mode: "advanced" });

      expect(result.ok).toBe(false);
      expect(getActionLog().some((e) => e.action === "session_autosave" && e.status === "error")).toBe(true);
    });
  });

  // ── clearSession ────────────────────────────────────────────────

  describe("clearSession", () => {
    it("writes INIT_SESSION to disk", async () => {
      const { calls } = mockSaveCapture();
      await clearSession();

      expect(calls).toHaveLength(1);
      const written = JSON.parse(calls[0].content) as SessionState;
      expect(written.version).toBe(1);
      expect(written.savedAt).toBe("");
      expect(written.completed.published).toBe(false);
      expect(written.artifactPaths.manifestPath).toBeNull();
    });
  });

  // ── validateSession ─────────────────────────────────────────────

  describe("validateSession", () => {
    it("keeps paths and flags when all artifact files exist", async () => {
      mockLoadFile({
        "/artifacts/manifest.json": "{}",
        "/artifacts/receipt.json": "{}",
      });

      const result = await validateSession(VALID_SESSION);
      expect(result.artifactPaths.manifestPath).toBe("/artifacts/manifest.json");
      expect(result.artifactPaths.receiptPath).toBe("/artifacts/receipt.json");
      expect(result.completed.published).toBe(true);
    });

    it("clears receipt path and published flag when receipt file is missing", async () => {
      mockLoadFile({
        "/artifacts/manifest.json": "{}",
        // receipt missing
      });

      const result = await validateSession(VALID_SESSION);
      expect(result.artifactPaths.manifestPath).toBe("/artifacts/manifest.json");
      expect(result.artifactPaths.receiptPath).toBeNull();
      expect(result.completed.published).toBe(false);
    });

    it("clears published when manifest is missing even if receipt exists", async () => {
      mockLoadFile({
        // manifest missing
        "/artifacts/receipt.json": "{}",
      });

      const result = await validateSession(VALID_SESSION);
      expect(result.artifactPaths.manifestPath).toBeNull();
      expect(result.completed.published).toBe(false);
    });

    it("clears accessTested when access policy path is broken", async () => {
      const session: SessionState = {
        ...VALID_SESSION,
        artifactPaths: {
          ...VALID_SESSION.artifactPaths,
          accessPolicyPath: "/artifacts/access.json",
        },
        completed: {
          ...VALID_SESSION.completed,
          accessTested: true,
        },
      };

      mockLoadFile({
        "/artifacts/manifest.json": "{}",
        "/artifacts/receipt.json": "{}",
        // access policy missing
      });

      const result = await validateSession(session);
      expect(result.artifactPaths.accessPolicyPath).toBeNull();
      expect(result.completed.accessTested).toBe(false);
    });

    it("clears recoveryGenerated when recovery bundle path is broken", async () => {
      const session: SessionState = {
        ...VALID_SESSION,
        artifactPaths: {
          ...VALID_SESSION.artifactPaths,
          recoveryBundlePath: "/artifacts/recovery.json",
        },
        completed: {
          ...VALID_SESSION.completed,
          recoveryGenerated: true,
        },
      };

      mockLoadFile({
        "/artifacts/manifest.json": "{}",
        "/artifacts/receipt.json": "{}",
        // recovery bundle missing
      });

      const result = await validateSession(session);
      expect(result.artifactPaths.recoveryBundlePath).toBeNull();
      expect(result.completed.recoveryGenerated).toBe(false);
    });

    it("handles session with all null paths gracefully", async () => {
      const emptySession: SessionState = {
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

      mockLoadFile({});
      const result = await validateSession(emptySession);
      expect(result.completed.published).toBe(false);
      expect(result.artifactPaths.manifestPath).toBeNull();
    });

    it("clears governance paths independently without affecting published", async () => {
      const session: SessionState = {
        ...VALID_SESSION,
        artifactPaths: {
          ...VALID_SESSION.artifactPaths,
          governancePolicyPath: "/artifacts/gov.json",
          proposalPath: "/artifacts/proposal.json",
        },
      };

      mockLoadFile({
        "/artifacts/manifest.json": "{}",
        "/artifacts/receipt.json": "{}",
        // governance files missing
      });

      const result = await validateSession(session);
      expect(result.artifactPaths.governancePolicyPath).toBeNull();
      expect(result.artifactPaths.proposalPath).toBeNull();
      expect(result.completed.published).toBe(true); // unaffected
    });
  });
});
