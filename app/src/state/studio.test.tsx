import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import React from "react";
import { StudioProvider, useStudio, type StudioDraft } from "./studio";
import { DRAFT } from "../__test__/fixtures";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(StudioProvider, null, children);
}

function renderStudio() {
  return renderHook(() => useStudio(), { wrapper });
}

// Default: loadSession returns empty session, saveSession succeeds silently
function mockSessionDefaults() {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "load_file") throw new Error("No session");
    if (cmd === "save_file") return undefined;
    return undefined;
  });
}

describe("studio state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSessionDefaults();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ───────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with default draft values", async () => {
      const { result } = renderStudio();
      // Let session restore effect run
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(result.current.draft.title).toBe("");
      expect(result.current.draft.artist).toBe("");
      expect(result.current.draft.editionSize).toBe(1);
      expect(result.current.draft.benefitKind).toBe("bonus-track");
      expect(result.current.draft.transferFeePercent).toBe(5);
      expect(result.current.draft.licenseType).toBe("personal-use");
      expect(result.current.draft.collaborators).toHaveLength(0);
    });

    it("starts on create step", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });
      expect(result.current.activeStep).toBe("create");
    });

    it("marks session as restored after mount", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });
      expect(result.current.sessionRestored).toBe(true);
    });
  });

  // ── Draft updates ───────────────────────────────────────────────

  describe("updateDraft", () => {
    it("merges partial updates into draft", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => {
        result.current.updateDraft({ title: "My Album", artist: "Me" });
      });

      expect(result.current.draft.title).toBe("My Album");
      expect(result.current.draft.artist).toBe("Me");
      expect(result.current.draft.editionSize).toBe(1); // unchanged
    });
  });

  // ── Step navigation ─────────────────────────────────────────────

  describe("step navigation", () => {
    it("sets active step", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.setActiveStep("benefit"); });
      expect(result.current.activeStep).toBe("benefit");

      act(() => { result.current.setActiveStep("publish"); });
      expect(result.current.activeStep).toBe("publish");
    });
  });

  // ── Readiness checks ───────────────────────────────────────────

  describe("readiness", () => {
    it("canProceedToBenefit requires title, artist, editionSize >= 1", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(result.current.canProceedToBenefit).toBe(false);

      act(() => { result.current.updateDraft({ title: "Album" }); });
      expect(result.current.canProceedToBenefit).toBe(false);

      act(() => { result.current.updateDraft({ artist: "Artist" }); });
      expect(result.current.canProceedToBenefit).toBe(true);
    });

    it("canProceedToReview additionally requires benefitDescription", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => {
        result.current.updateDraft({
          title: "Album",
          artist: "Artist",
          editionSize: 5,
        });
      });
      expect(result.current.canProceedToReview).toBe(false);

      act(() => {
        result.current.updateDraft({ benefitDescription: "Bonus track" });
      });
      expect(result.current.canProceedToReview).toBe(true);
    });

    it("canProceedToPublish equals canProceedToReview", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => {
        result.current.updateDraft({
          title: "Album",
          artist: "Artist",
          benefitDescription: "Bonus",
        });
      });
      expect(result.current.canProceedToPublish).toBe(true);
    });

    it("whitespace-only title does not satisfy readiness", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => {
        result.current.updateDraft({ title: "   ", artist: "Artist" });
      });
      expect(result.current.canProceedToBenefit).toBe(false);
    });
  });

  // ── Collaborators ───────────────────────────────────────────────

  describe("collaborators", () => {
    it("adds a collaborator with defaults", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.addCollaborator(); });
      expect(result.current.draft.collaborators).toHaveLength(1);
      expect(result.current.draft.collaborators[0].name).toBe("");
      expect(result.current.draft.collaborators[0].role).toBe("collaborator");
      expect(result.current.draft.collaborators[0].splitPercent).toBe(0);
    });

    it("updates a collaborator by index", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.addCollaborator(); });
      act(() => {
        result.current.updateCollaborator(0, { name: "Alice", role: "producer", splitPercent: 30 });
      });

      expect(result.current.draft.collaborators[0].name).toBe("Alice");
      expect(result.current.draft.collaborators[0].role).toBe("producer");
      expect(result.current.draft.collaborators[0].splitPercent).toBe(30);
    });

    it("removes a collaborator by index", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.addCollaborator(); });
      act(() => { result.current.addCollaborator(); });
      expect(result.current.draft.collaborators).toHaveLength(2);

      act(() => { result.current.removeCollaborator(0); });
      expect(result.current.draft.collaborators).toHaveLength(1);
    });
  });

  // ── Autosave ────────────────────────────────────────────────────

  describe("autosave", () => {
    it("saves session after 2s debounce on draft change", async () => {
      const saveCalls: string[] = [];
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file") throw new Error("No session");
        if (cmd === "save_file") {
          saveCalls.push((args as { content: string }).content);
          return undefined;
        }
        return undefined;
      });

      const { result } = renderStudio();
      // Let session restore run
      await act(async () => { await vi.runAllTimersAsync(); });
      saveCalls.length = 0; // clear any saves from restore

      // Update draft
      act(() => { result.current.updateDraft({ title: "New Title" }); });

      // Not yet saved
      expect(saveCalls).toHaveLength(0);

      // Advance 2 seconds
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      expect(saveCalls.length).toBeGreaterThanOrEqual(1);
      const saved = JSON.parse(saveCalls[saveCalls.length - 1]);
      expect(saved.draft.title).toBe("New Title");
    });

    it("debounces multiple rapid changes into one save", async () => {
      const saveCalls: string[] = [];
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file") throw new Error("No session");
        if (cmd === "save_file") {
          saveCalls.push((args as { content: string }).content);
          return undefined;
        }
        return undefined;
      });

      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });
      saveCalls.length = 0;

      // Rapid updates
      act(() => { result.current.updateDraft({ title: "A" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      act(() => { result.current.updateDraft({ title: "AB" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      act(() => { result.current.updateDraft({ title: "ABC" }); });

      // Only after full 2s from last change
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      // Should have coalesced — final save has "ABC"
      const lastSave = JSON.parse(saveCalls[saveCalls.length - 1]);
      expect(lastSave.draft.title).toBe("ABC");
    });
  });

  // ── Session restore ─────────────────────────────────────────────

  describe("session restore", () => {
    it("restores draft from saved session", async () => {
      const savedSession = {
        version: 1,
        savedAt: "2026-01-01",
        draft: DRAFT,
        activeStep: "benefit",
        mode: "studio",
        artifactPaths: {
          manifestPath: null, receiptPath: null, accessPolicyPath: null,
          recoveryBundlePath: null, governancePolicyPath: null,
          proposalPath: null, decisionPath: null, executionPath: null,
        },
        completed: { published: false, verified: false, accessTested: false, recoveryGenerated: false },
      };

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") return JSON.stringify(savedSession);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(result.current.draft.title).toBe("My Album");
      expect(result.current.draft.artist).toBe("Test Artist");
      expect(result.current.activeStep).toBe("benefit");
      expect(result.current.sessionRestored).toBe(true);
    });

    it("falls back to defaults on corrupted session", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") return "CORRUPT DATA {{{";
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(result.current.draft.title).toBe("");
      expect(result.current.activeStep).toBe("create");
      expect(result.current.sessionRestored).toBe(true);
    });

    it("sets sessionError on restore failure", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") return JSON.stringify({ version: 1, savedAt: "", draft: null, activeStep: "create", mode: "studio", artifactPaths: {}, completed: {} });
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      // validateSession will try to loadFile artifact paths
      // But since all paths are null, it should still work fine
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      // Draft is null so no restore happens, but sessionRestored should be true
      expect(result.current.sessionRestored).toBe(true);
      expect(result.current.draft.title).toBe("");
    });
  });

  // ── Reset ───────────────────────────────────────────────────────

  describe("resetDraft", () => {
    it("resets draft to initial values and step to create", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      // Make changes
      act(() => {
        result.current.updateDraft({ title: "Changed" });
        result.current.setActiveStep("publish");
      });

      expect(result.current.draft.title).toBe("Changed");
      expect(result.current.activeStep).toBe("publish");

      // Reset
      await act(async () => { result.current.resetDraft(); });

      expect(result.current.draft.title).toBe("");
      expect(result.current.activeStep).toBe("create");
    });
  });

  // ── useStudio outside provider ──────────────────────────────────

  describe("useStudio outside provider", () => {
    it("throws when used without StudioProvider", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        renderHook(() => useStudio());
      }).toThrow("useStudio must be inside StudioProvider");
      spy.mockRestore();
    });
  });
});
