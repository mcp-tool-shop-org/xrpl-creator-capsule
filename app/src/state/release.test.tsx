import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import React from "react";
import {
  ReleaseProvider,
  useRelease,
  logAction,
  getActionLog,
  clearActionLog,
  type ActionEvent,
} from "./release";
import { MANIFEST, RECEIPT, ACCESS_POLICY, makeGrant, RECOVER_RESULT, GOV_POLICY } from "../__test__/fixtures";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ReleaseProvider, null, children);
}

function renderRelease() {
  return renderHook(() => useRelease(), { wrapper });
}

// ── Helper: mock engine calls by command name ─────────────────────
function mockEngine(responses: Record<string, unknown>) {
  mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "load_file") {
      const path = (args as { path: string }).path;
      if (path.includes("manifest")) return JSON.stringify(MANIFEST);
      if (path.includes("receipt")) return JSON.stringify(RECEIPT);
      if (path.includes("access") || path.includes("policy")) return JSON.stringify(ACCESS_POLICY);
      if (path.includes("governance") || path.includes("gov")) return JSON.stringify(GOV_POLICY);
      return "{}";
    }
    if (cmd === "save_file") return undefined;
    if (cmd === "engine_call") {
      const command = (args as { command: string }).command;
      if (command in responses) {
        const response = responses[command];
        if (response instanceof Error) throw response;
        return response;
      }
      throw new Error(`Unmocked engine command: ${command}`);
    }
    return undefined;
  });
}

describe("release state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActionLog();
  });

  // ── Action log ──────────────────────────────────────────────────

  describe("action log", () => {
    it("starts empty", () => {
      expect(getActionLog()).toHaveLength(0);
    });

    it("records logged events", () => {
      const event: ActionEvent = {
        action: "mint",
        status: "done",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:01:00Z",
      };
      logAction(event);
      expect(getActionLog()).toHaveLength(1);
      expect(getActionLog()[0].action).toBe("mint");
    });

    it("clears on clearActionLog", () => {
      logAction({ action: "test", status: "idle", startedAt: "" });
      clearActionLog();
      expect(getActionLog()).toHaveLength(0);
    });
  });

  // ── Initial state ───────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with empty manifest", () => {
      const { result } = renderRelease();
      expect(result.current.manifest.status).toBe("empty");
      expect(result.current.manifest.path).toBeNull();
      expect(result.current.manifest.data).toBeNull();
    });

    it("starts with idle mint", () => {
      const { result } = renderRelease();
      expect(result.current.mint.status).toBe("empty");
      expect(result.current.mint.actionStatus).toBe("idle");
      expect(result.current.mint.receipt).toBeNull();
    });

    it("starts with idle verify", () => {
      const { result } = renderRelease();
      expect(result.current.verify.status).toBe("idle");
      expect(result.current.verify.result).toBeNull();
    });

    it("starts with empty access", () => {
      const { result } = renderRelease();
      expect(result.current.access.policyStatus).toBe("empty");
      expect(result.current.access.grantStatus).toBe("idle");
    });

    it("starts with idle recovery", () => {
      const { result } = renderRelease();
      expect(result.current.recovery.status).toBe("idle");
      expect(result.current.recovery.result).toBeNull();
    });

    it("starts with empty governance", () => {
      const { result } = renderRelease();
      expect(result.current.governance.policyStatus).toBe("empty");
      expect(result.current.governance.proposalStatus).toBe("empty");
    });

    it("has testnet network", () => {
      const { result } = renderRelease();
      expect(result.current.network).toBe("testnet");
    });

    it("has null release identity", () => {
      const { result } = renderRelease();
      expect(result.current.releaseIdentity.manifestId).toBeNull();
      expect(result.current.releaseIdentity.title).toBeNull();
    });
  });

  // ── Manifest loading ────────────────────────────────────────────

  describe("loadManifest", () => {
    it("loads manifest and resets downstream state", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/test/manifest.json" } as any);
      mockEngine({});

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });

      expect(result.current.manifest.status).toBe("loaded");
      expect(result.current.manifest.path).toBe("/test/manifest.json");
      expect(result.current.manifest.data?.title).toBe("Test Release");
      // Downstream should be reset
      expect(result.current.mint.status).toBe("empty");
      expect(result.current.verify.status).toBe("idle");
      expect(result.current.access.policyStatus).toBe("empty");
      expect(result.current.recovery.status).toBe("idle");
      expect(result.current.governance.policyStatus).toBe("empty");
    });

    it("does nothing when file picker is dismissed", async () => {
      mockOpen.mockResolvedValueOnce(null as any);

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });

      expect(result.current.manifest.status).toBe("empty");
    });

    it("sets error status on load failure", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/bad/file.json" } as any);
      mockInvoke.mockRejectedValueOnce(new Error("Read failed"));

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });

      expect(result.current.manifest.status).toBe("error");
      expect(result.current.manifest.error).toBe("Read failed");
    });
  });

  // ── Manifest validation ─────────────────────────────────────────

  describe("validateManifest", () => {
    it("does nothing without loaded manifest path", async () => {
      const { result } = renderRelease();
      await act(async () => {
        await result.current.validateManifest();
      });
      expect(result.current.manifest.validation).toBeNull();
    });

    it("stores validation result", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/test/manifest.json" } as any);
      const validation = { valid: true, errors: [] };
      mockEngine({ validate_manifest: validation });

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });
      await act(async () => {
        await result.current.validateManifest();
      });

      expect(result.current.manifest.validation?.valid).toBe(true);
    });
  });

  // ── Manifest resolve + stamp ────────────────────────────────────

  describe("resolveManifest", () => {
    it("stores resolution and stamp results", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/test/manifest.json" } as any);
      const resolution = { checks: [{ name: "cid", passed: true, detail: "OK" }], passed: true };
      const stamp = { manifest: MANIFEST, manifestId: "stamped-id", revisionHash: "stamped-hash" };
      mockEngine({ resolve_manifest: resolution, stamp_manifest: stamp });

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });
      await act(async () => {
        await result.current.resolveManifest();
      });

      expect(result.current.manifest.resolution?.passed).toBe(true);
      expect(result.current.manifest.stamp?.manifestId).toBe("stamped-id");
    });
  });

  // ── Release identity ────────────────────────────────────────────

  describe("releaseIdentity", () => {
    it("derives identity from loaded manifest data", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/test/manifest.json" } as any);
      mockEngine({});

      const { result } = renderRelease();

      await act(async () => {
        await result.current.loadManifest();
      });

      expect(result.current.releaseIdentity.manifestId).toBe("manifest-abc-123");
      expect(result.current.releaseIdentity.title).toBe("Test Release");
      expect(result.current.releaseIdentity.artist).toBe("Test Artist");
      expect(result.current.releaseIdentity.network).toBe("testnet");
    });
  });

  // ── Mint ────────────────────────────────────────────────────────

  describe("runMintFromStudio", () => {
    it("runs mint and updates both manifest and mint state", async () => {
      mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "load_file") return JSON.stringify(MANIFEST);
        if (cmd === "save_file") return undefined;
        if (cmd === "engine_call") return RECEIPT;
        return undefined;
      });

      const { result } = renderRelease();

      await act(async () => {
        await result.current.runMintFromStudio("/m.json", "/w.json", "/r.json");
      });

      expect(result.current.manifest.status).toBe("loaded");
      expect(result.current.manifest.data?.title).toBe("Test Release");
      expect(result.current.mint.actionStatus).toBe("done");
      expect(result.current.mint.receipt?.manifestId).toBe("manifest-abc-123");
      expect(result.current.mint.receiptPath).toBe("/r.json");
    });

    it("sets error and re-throws on failure", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") return JSON.stringify(MANIFEST);
        if (cmd === "engine_call") throw new Error("Insufficient funds");
        return undefined;
      });

      const { result } = renderRelease();
      let caught: Error | undefined;

      await act(async () => {
        try {
          await result.current.runMintFromStudio("/m.json", "/w.json", "/r.json");
        } catch (err) {
          caught = err as Error;
        }
      });

      expect(caught?.message).toBe("Insufficient funds");
      expect(result.current.mint.actionStatus).toBe("error");
      expect(result.current.mint.error).toBe("Insufficient funds");
    });
  });

  // ── Verify ──────────────────────────────────────────────────────

  describe("runVerify", () => {
    it("runs verify when manifest and receipt are loaded", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/m.json" } as any);
      const verifyResult = { passed: true, checks: [{ name: "hash", passed: true, detail: "OK" }] };
      mockEngine({ verify_release: verifyResult });

      const { result } = renderRelease();

      // Load manifest
      await act(async () => { await result.current.loadManifest(); });

      // Load receipt via runMintFromStudio to populate receiptPath
      mockEngine({ mint_release: RECEIPT, verify_release: verifyResult });
      await act(async () => {
        await result.current.runMintFromStudio("/m.json", "/w.json", "/r.json");
      });

      await act(async () => { await result.current.runVerify(); });

      expect(result.current.verify.status).toBe("done");
      expect(result.current.verify.result?.passed).toBe(true);
    });

    it("does nothing without manifest path", async () => {
      const { result } = renderRelease();
      await act(async () => { await result.current.runVerify(); });
      expect(result.current.verify.status).toBe("idle");
    });
  });

  // ── Access ──────────────────────────────────────────────────────

  describe("setWalletAddress", () => {
    it("sets wallet address and resets grant", () => {
      const { result } = renderRelease();
      act(() => { result.current.setWalletAddress("rTest123"); });
      expect(result.current.access.walletAddress).toBe("rTest123");
      expect(result.current.access.grantStatus).toBe("idle");
      expect(result.current.access.grant).toBeNull();
    });
  });

  // ── Recovery ────────────────────────────────────────────────────

  describe("runRecover", () => {
    it("does nothing without manifest path", async () => {
      const { result } = renderRelease();
      await act(async () => { await result.current.runRecover(); });
      expect(result.current.recovery.status).toBe("idle");
    });
  });

  // ── Reset ───────────────────────────────────────────────────────

  describe("resetAll", () => {
    it("resets all state to initial values", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/m.json" } as any);
      mockEngine({});

      const { result } = renderRelease();

      // Load something first
      await act(async () => { await result.current.loadManifest(); });
      expect(result.current.manifest.status).toBe("loaded");

      // Reset
      act(() => { result.current.resetAll(); });

      expect(result.current.manifest.status).toBe("empty");
      expect(result.current.mint.status).toBe("empty");
      expect(result.current.verify.status).toBe("idle");
      expect(result.current.access.policyStatus).toBe("empty");
      expect(result.current.recovery.status).toBe("idle");
      expect(result.current.governance.policyStatus).toBe("empty");
      expect(result.current.releaseIdentity.manifestId).toBeNull();
    });

    it("clears the action log", () => {
      logAction({ action: "test", status: "done", startedAt: "" });
      expect(getActionLog()).toHaveLength(1);

      const { result } = renderRelease();
      act(() => { result.current.resetAll(); });

      expect(getActionLog()).toHaveLength(0);
    });
  });

  // ── Downstream reset on manifest change ─────────────────────────

  describe("downstream reset", () => {
    it("loading a new manifest clears mint, verify, access, recovery, governance", async () => {
      mockEngine({ mint_release: RECEIPT });
      const { result } = renderRelease();

      // Build up state via studio mint
      await act(async () => {
        await result.current.runMintFromStudio("/m.json", "/w.json", "/r.json");
      });
      expect(result.current.mint.actionStatus).toBe("done");

      // Now load a new manifest
      mockOpen.mockResolvedValueOnce({ path: "/m2.json" } as any);
      mockEngine({});

      await act(async () => {
        await result.current.loadManifest();
      });

      expect(result.current.mint.status).toBe("empty");
      expect(result.current.mint.actionStatus).toBe("idle");
      expect(result.current.mint.receipt).toBeNull();
      expect(result.current.verify.status).toBe("idle");
      expect(result.current.access.policyStatus).toBe("empty");
      expect(result.current.recovery.status).toBe("idle");
      expect(result.current.governance.policyStatus).toBe("empty");
    });
  });

  // ── useRelease outside provider ─────────────────────────────────

  describe("useRelease outside provider", () => {
    it("throws when used without ReleaseProvider", () => {
      // Suppress console.error from React
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        renderHook(() => useRelease());
      }).toThrow("useRelease must be inside ReleaseProvider");
      spy.mockRestore();
    });
  });
});
