import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { saveSession, loadSession, clearSession, validateSession, type SessionState } from "./session";
import { VALID_SESSION } from "../__test__/fixtures";

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

    it("returns INIT_SESSION when file contains invalid JSON", async () => {
      mockLoadFile({
        "/mock/app-data/capsule-session.json": "NOT JSON {{{",
      });
      const session = await loadSession();
      expect(session.version).toBe(1);
      expect(session.savedAt).toBe("");
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
  });

  // ── saveSession ─────────────────────────────────────────────────

  describe("saveSession", () => {
    it("merges partial state with existing session", async () => {
      // First call is loadSession (inside saveSession), second is the write
      let loadCount = 0;
      const saved: string[] = [];
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file") {
          loadCount++;
          return JSON.stringify(VALID_SESSION);
        }
        if (cmd === "save_file") {
          saved.push((args as { content: string }).content);
          return undefined;
        }
      });

      await saveSession({ mode: "advanced" });

      expect(loadCount).toBe(1);
      expect(saved).toHaveLength(1);
      const written = JSON.parse(saved[0]) as SessionState;
      expect(written.mode).toBe("advanced");
      expect(written.completed.published).toBe(true); // preserved from existing
      expect(written.version).toBe(1);
      expect(written.savedAt).not.toBe(""); // timestamp updated
    });

    it("silently fails when save throws", async () => {
      mockInvoke.mockRejectedValue(new Error("Disk full"));
      // Should not throw
      await expect(saveSession({ mode: "advanced" })).resolves.toBeUndefined();
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
