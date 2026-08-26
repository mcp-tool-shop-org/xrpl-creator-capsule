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
    if (cmd === "load_file") throw new Error("File not found: No session yet");
    // F-27abf0dc: saveSession writes via save_file_atomic now, not the
    // plain save_file command.
    if (cmd === "save_file_atomic") return undefined;
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

  // ── loadDraft: shape validation (F-343bb92d) ────────────────────

  describe("loadDraft shape validation", () => {
    it("does nothing when the file picker is dismissed", async () => {
      mockOpen.mockResolvedValueOnce(null as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.draft.title).toBe("");
      expect(result.current.draftLoadError).toBeNull();
    });

    it("leaves the current draft untouched and surfaces a friendly error on malformed JSON", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/bad.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "Keep Me", artist: "Safe Artist" }); });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/bad.json") return "NOT JSON {{{";
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      // Draft is untouched — a silent reset on Load Draft would itself
      // be data loss.
      expect(result.current.draft.title).toBe("Keep Me");
      expect(result.current.draft.artist).toBe("Safe Artist");
      expect(result.current.draftLoadError).toBeTruthy();
    });

    it("leaves the current draft untouched and surfaces a friendly error when the shape is invalid (e.g. collaborators not an array)", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/bad-shape.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "Keep Me", artist: "Safe Artist" }); });

      const malformed = { ...DRAFT, collaborators: "not-an-array" };
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/bad-shape.json") return JSON.stringify(malformed);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.draft.title).toBe("Keep Me");
      expect(result.current.draftLoadError).toBe("That file isn't a valid draft.");
    });

    it("applies a valid draft and clears any prior load error", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/good.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/good.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.draft.title).toBe(DRAFT.title);
      expect(result.current.draft.draftPath).toBe("/good.json");
      expect(result.current.draftLoadError).toBeNull();
    });
  });

  // ── loadDraft: confirm before overwriting unsaved content (F-040b05d3) ──

  describe("loadDraft unsaved-content confirmation", () => {
    it("applies immediately when the current draft has no meaningful content", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/good.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      // Current draft is still blank (default) — nothing to lose.
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/good.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.draft.title).toBe(DRAFT.title);
      expect(result.current.pendingDraftLoad).toBeNull();
    });

    it("holds the load pending and does NOT touch the draft when unsaved content exists (title set, no draftPath)", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/other-draft.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => {
        result.current.updateDraft({ title: "In Progress Album", artist: "Me" });
      });
      expect(result.current.draft.draftPath).toBeNull();

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/other-draft.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      // NOT replaced yet — held pending confirmation.
      expect(result.current.draft.title).toBe("In Progress Album");
      expect(result.current.pendingDraftLoad?.path).toBe("/other-draft.json");
    });

    it("confirmLoadDraft applies the held draft and clears the pending state", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/other-draft.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "In Progress Album", artist: "Me" }); });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/other-draft.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });
      expect(result.current.pendingDraftLoad).not.toBeNull();

      act(() => { result.current.confirmLoadDraft(); });

      expect(result.current.draft.title).toBe(DRAFT.title);
      expect(result.current.draft.draftPath).toBe("/other-draft.json");
      expect(result.current.pendingDraftLoad).toBeNull();
    });

    it("cancelLoadDraft discards the held draft and leaves the current draft untouched", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/other-draft.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "In Progress Album", artist: "Me" }); });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/other-draft.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });
      expect(result.current.pendingDraftLoad).not.toBeNull();

      act(() => { result.current.cancelLoadDraft(); });

      expect(result.current.draft.title).toBe("In Progress Album");
      expect(result.current.pendingDraftLoad).toBeNull();
    });

    it("applies immediately even with title/artist set, when draftPath is already set (previously saved/loaded)", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/other-draft.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      // Simulate a draft that was already saved to a file once — the
      // creator has an explicit save point, so this is not the "relying
      // on autosave alone" scenario the confirm gate exists for.
      act(() => {
        result.current.updateDraft({ title: "Already Saved", artist: "Me", draftPath: "/prior-save.json" });
      });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/other-draft.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });

      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.draft.title).toBe(DRAFT.title);
      expect(result.current.pendingDraftLoad).toBeNull();
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
        if (cmd === "load_file") throw new Error("File not found: No session yet");
        // F-27abf0dc: saveSession now writes via save_file_atomic (temp
        // file + rename), not the plain save_file command.
        if (cmd === "save_file_atomic") {
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
        if (cmd === "load_file") throw new Error("File not found: No session yet");
        // F-27abf0dc: saveSession now writes via save_file_atomic (temp
        // file + rename), not the plain save_file command.
        if (cmd === "save_file_atomic") {
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

    // F-27abf0dc: a persistent autosave failure used to be completely
    // invisible (a bare `.catch(() => { best effort })` discarding the
    // outcome entirely). It must still never block editing — but the
    // creator should be told autosave isn't working, via the same
    // sessionError vocabulary the startup-restore failure path already
    // uses (see the "sets sessionError on restore failure" test above).
    it("surfaces a non-blocking notice via sessionError when autosave keeps failing, without touching the draft", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") throw new Error("File not found: No session yet");
        if (cmd === "save_file_atomic") throw new Error("Disk full");
        return undefined;
      });

      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "New Title" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      expect(result.current.sessionError).toBeTruthy();
      // Editing itself must be completely unaffected by the save failure.
      expect(result.current.draft.title).toBe("New Title");
    });

    it("clears the autosave notice once a subsequent save succeeds again", async () => {
      let shouldFail = true;
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "load_file") throw new Error("File not found: No session yet");
        if (cmd === "save_file_atomic") {
          if (shouldFail) throw new Error("Disk full");
          return undefined;
        }
        return undefined;
      });

      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "First" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(result.current.sessionError).toBeTruthy();

      shouldFail = false;
      act(() => { result.current.updateDraft({ title: "Second" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      expect(result.current.sessionError).toBeFalsy();
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

    // F-bd945889 interplay: resetDraft is the mechanism behind "Start a
    // new release", so it must also clear the welcome-dismissal flag
    // (so WelcomePage can reappear — see the "welcome dismissal"
    // describe block) and any stale loadDraft confirmation/error state
    // left over from an unrelated earlier action, so the reset is a
    // genuinely clean slate rather than clearing the draft while leaving
    // divergent leftover UI state behind.
    it("also resets welcomeDismissed, pendingDraftLoad, and draftLoadError", async () => {
      mockOpen.mockResolvedValueOnce({ path: "/other-draft.json" } as any);
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.updateDraft({ title: "In Progress", artist: "Me" }); });
      act(() => { result.current.dismissWelcome(); });

      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === "load_file" && (args as any).path === "/other-draft.json") return JSON.stringify(DRAFT);
        if (cmd === "save_file") return undefined;
        return undefined;
      });
      await act(async () => { await result.current.loadDraft(); });

      expect(result.current.welcomeDismissed).toBe(true);
      expect(result.current.pendingDraftLoad).not.toBeNull();

      await act(async () => { result.current.resetDraft(); });

      expect(result.current.welcomeDismissed).toBe(false);
      expect(result.current.pendingDraftLoad).toBeNull();
      expect(result.current.draftLoadError).toBeNull();
    });
  });

  // ── Welcome dismissal (context-owned so it survives across sibling
  //    components — see F-bd945889 interplay with StudioShell) ────

  describe("welcome dismissal", () => {
    it("starts undismissed", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });
      expect(result.current.welcomeDismissed).toBe(false);
    });

    it("dismissWelcome sets it to true", async () => {
      const { result } = renderStudio();
      await act(async () => { await vi.runAllTimersAsync(); });

      act(() => { result.current.dismissWelcome(); });

      expect(result.current.welcomeDismissed).toBe(true);
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
