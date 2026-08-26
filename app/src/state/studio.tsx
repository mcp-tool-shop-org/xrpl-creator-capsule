import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { loadFile, saveFile } from "../bridge/engine";
import { saveSession, loadSession, validateSession } from "./session";
import { isValidStudioDraft } from "./validate";
import type { SignerRole } from "../bridge/engine";

// ── Draft shape ────────────────────────────────────────────────────

export type BenefitKind = "bonus-track" | "stems" | "high-res-artwork" | "private-note" | "custom";

export interface StudioCollaborator {
  name: string;
  role: SignerRole;
  address: string;
  splitPercent: number;
}

export interface StudioDraft {
  // Step 1: Release info
  title: string;
  artist: string;
  description: string;
  editionSize: number;
  coverArtPath: string | null;
  mediaFilePath: string | null;

  // Step 2: Collector benefit
  benefitKind: BenefitKind;
  benefitDescription: string;
  benefitContentPath: string | null;

  // Step 3: Terms & ownership
  transferFeePercent: number;
  licenseType: string;
  licenseSummary: string;

  // Collaborators (for governance)
  collaborators: StudioCollaborator[];
  treasuryAddress: string;

  // Publish
  walletsPath: string | null;

  // Persistence
  draftPath: string | null;
}

export type StudioStep = "create" | "benefit" | "review" | "publish" | "test" | "recovery" | "proof";

// ── Context ────────────────────────────────────────────────────────

interface StudioContextValue {
  draft: StudioDraft;
  activeStep: StudioStep;
  setActiveStep: (step: StudioStep) => void;
  updateDraft: (partial: Partial<StudioDraft>) => void;

  // File pickers
  pickCoverArt: () => Promise<void>;
  pickMediaFile: () => Promise<void>;
  pickBenefitContent: () => Promise<void>;
  pickWallets: () => Promise<void>;

  // Collaborators
  addCollaborator: () => void;
  updateCollaborator: (index: number, partial: Partial<StudioCollaborator>) => void;
  removeCollaborator: (index: number) => void;

  // Draft persistence
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<void>;

  // F-343bb92d: set when a Load Draft file fails to read, parse, or
  // pass shape validation. The current draft is never touched in any
  // of those cases — this is purely informational for the UI.
  draftLoadError: string | null;

  // F-040b05d3: when loadDraft() finds the loaded file valid but the
  // CURRENT draft has meaningful unsaved content, the validated
  // candidate is held here instead of being applied immediately.
  // confirmLoadDraft() applies it; cancelLoadDraft() discards it. Both
  // are no-ops if nothing is pending.
  pendingDraftLoad: { path: string; draft: StudioDraft } | null;
  confirmLoadDraft: () => void;
  cancelLoadDraft: () => void;

  // Readiness checks
  canProceedToBenefit: boolean;
  canProceedToReview: boolean;
  canProceedToPublish: boolean;

  // Reset
  resetDraft: () => void;

  // F-bd945889: owned here (not as component-local state) so that
  // StudioSidebar's "Start a new release" action and StudioShell's
  // welcome-screen visibility stay in sync — resetDraft() clears this
  // too, which is what makes WelcomePage reappear after a reset.
  welcomeDismissed: boolean;
  dismissWelcome: () => void;

  // Session state
  sessionRestored: boolean;
  sessionError: string | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

// ── Initial state ──────────────────────────────────────────────────

const INIT_DRAFT: StudioDraft = {
  title: "",
  artist: "",
  description: "",
  editionSize: 1,
  coverArtPath: null,
  mediaFilePath: null,
  benefitKind: "bonus-track",
  benefitDescription: "",
  benefitContentPath: null,
  transferFeePercent: 5,
  licenseType: "personal-use",
  licenseSummary: "Personal, non-commercial use. No redistribution.",
  collaborators: [],
  treasuryAddress: "",
  walletsPath: null,
  draftPath: null,
};

/**
 * F-040b05d3: approximates "would replacing this draft lose something
 * the creator hasn't explicitly saved anywhere." Deliberately a cheap
 * proxy rather than a full dirty-since-last-save tracker: the creator
 * has typed something (title or artist set) AND has no draftPath (never
 * clicked "Save Draft" or loaded a prior draft file for this session) —
 * exactly the "relying on the 2s autosave alone" scenario the finding
 * names as the actual data-loss risk.
 */
function hasUnsavedDraftContent(draft: StudioDraft): boolean {
  return (!!draft.title.trim() || !!draft.artist.trim()) && !draft.draftPath;
}

/**
 * F-27abf0dc: saveSession() itself stays best-effort (never throws — a
 * failed autosave must not block editing) but no longer discards its
 * outcome. This is the "not still working" half of the finding's fix:
 * "Save Draft" (studio.tsx's saveDraft(), a few lines below) writes to a
 * user-CHOSEN location via a completely separate command (save_file,
 * straight to whatever path the OS save dialog returns) rather than the
 * fixed capsule-session.json autosave target — so it is a genuinely
 * independent path, not merely a differently-worded call to the same
 * mechanism. That is why it is reasonable to point a creator at it here,
 * though nothing GUARANTEES it will succeed if, say, the whole disk is
 * out of space — the copy below is worded as a suggestion, not a promise.
 */
const AUTOSAVE_FAILURE_NOTICE =
  "Autosave isn't working right now, so recent changes may not be saved automatically. Use \"Save Draft\" to save a copy yourself until this resolves.";

function isAutosaveNotice(message: string | null): boolean {
  return message === AUTOSAVE_FAILURE_NOTICE;
}

// ── Provider ───────────────────────────────────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<StudioDraft>(INIT_DRAFT);
  const [activeStep, setActiveStepRaw] = useState<StudioStep>("create");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [pendingDraftLoad, setPendingDraftLoad] = useState<{ path: string; draft: StudioDraft } | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session restore on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await loadSession();
        const session = await validateSession(raw);
        if (session.draft && session.draft.title) {
          setDraft(session.draft);
          setActiveStepRaw(session.activeStep || "create");
        }
        setSessionRestored(true);
      } catch (err) {
        setSessionError(err instanceof Error ? err.message : String(err));
        setSessionRestored(true);
      }
    })();
  }, []);

  // ── Autosave on draft changes (debounced 2s) ───────────────
  //
  // F-27abf0dc: saveSession() now reports { ok } instead of its outcome
  // vanishing into a bare `.catch(() => {})`. Editing itself is still
  // never blocked by a save failure (the draft lives in React state
  // regardless of whether this particular write lands) — but a failure
  // is surfaced as a non-blocking notice via the same sessionError
  // vocabulary the startup-restore-failure path already uses, and
  // cleared again the moment a later autosave succeeds. Only ever
  // touches sessionError when it currently holds ITS OWN notice (or
  // nothing) — never clobbers an unrelated, still-unaddressed
  // restore-failure message from the session-restore effect above.
  useEffect(() => {
    if (!sessionRestored) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveSession({ draft, activeStep }).then((result) => {
        setSessionError((prev) => {
          if (result.ok) return isAutosaveNotice(prev) ? null : prev;
          // Never clobber a DIFFERENT, still-unaddressed error (e.g. the
          // startup restore-failure message set by the effect above)
          // with the generic autosave notice — the more specific
          // problem stays visible and is usually the actual root cause
          // of the autosave failure too, so nothing is lost by not
          // layering a second, vaguer notice on top of it.
          return prev === null || isAutosaveNotice(prev) ? AUTOSAVE_FAILURE_NOTICE : prev;
        });
      });
    }, 2000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [draft, activeStep, sessionRestored]);

  const setActiveStep = useCallback((step: StudioStep) => {
    setActiveStepRaw(step);
  }, []);

  const updateDraft = useCallback((partial: Partial<StudioDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── File pickers ─────────────────────────────────────────────

  const pickCoverArt = useCallback(async () => {
    const result = await open({
      title: "Choose Cover Art",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;
    setDraft((s) => ({ ...s, coverArtPath: path }));
  }, []);

  const pickMediaFile = useCallback(async () => {
    const result = await open({
      title: "Choose Main Media File",
      filters: [{ name: "Media", extensions: ["mp3", "wav", "flac", "mp4", "mov", "png", "jpg", "zip"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;
    setDraft((s) => ({ ...s, mediaFilePath: path }));
  }, []);

  const pickBenefitContent = useCallback(async () => {
    const result = await open({
      title: "Choose Bonus Content",
      filters: [{ name: "Any File", extensions: ["*"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;
    setDraft((s) => ({ ...s, benefitContentPath: path }));
  }, []);

  const pickWallets = useCallback(async () => {
    const result = await open({
      title: "Load Wallet Credentials",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;
    setDraft((s) => ({ ...s, walletsPath: path }));
  }, []);

  // ── Collaborators ────────────────────────────────────────────

  const addCollaborator = useCallback(() => {
    setDraft((s) => ({
      ...s,
      collaborators: [...s.collaborators, { name: "", role: "collaborator" as SignerRole, address: "", splitPercent: 0 }],
    }));
  }, []);

  const updateCollaborator = useCallback((index: number, partial: Partial<StudioCollaborator>) => {
    setDraft((s) => {
      const next = [...s.collaborators];
      next[index] = { ...next[index], ...partial };
      return { ...s, collaborators: next };
    });
  }, []);

  const removeCollaborator = useCallback((index: number) => {
    setDraft((s) => ({
      ...s,
      collaborators: s.collaborators.filter((_, i) => i !== index),
    }));
  }, []);

  // ── Draft persistence ────────────────────────────────────────

  const saveDraft = useCallback(async () => {
    let path = draft.draftPath;
    if (!path) {
      const chosen = await save({
        title: "Save Draft",
        defaultPath: `${draft.title || "release"}-draft.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!chosen) return;
      path = chosen;
    }
    await saveFile(path, JSON.stringify(draft, null, 2));
    setDraft((s) => ({ ...s, draftPath: path }));
  }, [draft]);

  const loadDraft = useCallback(async () => {
    const result = await open({
      title: "Load Draft",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;

    // F-343bb92d: *-draft.json is an ordinary user-writable file (a
    // normal workflow via this very button, including hand-editing).
    // A read failure, a parse failure, or a valid-JSON-but-wrong-shape
    // file must NEVER touch the current draft — a silent reset here
    // would itself be data loss, unlike loadSession's fallback-to-blank
    // behavior which is safe because there is no "current" state to
    // lose at startup.
    let content: string;
    try {
      content = await loadFile(path);
    } catch (err) {
      setDraftLoadError(
        `Could not read that file (${err instanceof Error ? err.message : String(err)}).`
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      setDraftLoadError("That file isn't valid JSON.");
      return;
    }

    if (!isValidStudioDraft(parsed)) {
      setDraftLoadError("That file isn't a valid draft.");
      return;
    }

    setDraftLoadError(null);

    // F-040b05d3: replacing the draft outright is safe only when there
    // is nothing meaningful to lose. "Meaningful" is approximated the
    // same way the finding itself frames the risk: the creator has
    // typed a title/artist (there is content) AND has never explicitly
    // saved it to a named file (draftPath is null — they are relying on
    // the 2s autosave alone, which this same load would silently
    // overwrite). Once a draft has an explicit draftPath, the creator
    // has a save point of their own making and is not surprised the
    // same way.
    if (hasUnsavedDraftContent(draft)) {
      setPendingDraftLoad({ path, draft: parsed });
      return;
    }

    setDraft({ ...parsed, draftPath: path });
  }, [draft]);

  const confirmLoadDraft = useCallback(() => {
    if (!pendingDraftLoad) return;
    setDraft({ ...pendingDraftLoad.draft, draftPath: pendingDraftLoad.path });
    setPendingDraftLoad(null);
  }, [pendingDraftLoad]);

  const cancelLoadDraft = useCallback(() => {
    setPendingDraftLoad(null);
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(INIT_DRAFT);
    setActiveStepRaw("create");
    // F-bd945889 interplay: a reset is a genuinely clean slate — clear
    // any stale loadDraft confirmation/error left over from an earlier,
    // unrelated action, and un-dismiss the welcome screen so it can
    // reappear (StudioShell derives its visibility from this flag).
    setPendingDraftLoad(null);
    setDraftLoadError(null);
    setWelcomeDismissed(false);
    import("./session").then((m) => m.clearSession()).catch(() => {});
  }, []);

  // ── Readiness ────────────────────────────────────────────────

  const canProceedToBenefit = !!(draft.title.trim() && draft.artist.trim() && draft.editionSize >= 1);
  const canProceedToReview = canProceedToBenefit && !!(draft.benefitDescription.trim());
  const canProceedToPublish = canProceedToReview;

  return (
    <StudioContext.Provider
      value={{
        draft,
        activeStep,
        setActiveStep,
        updateDraft,
        pickCoverArt,
        pickMediaFile,
        pickBenefitContent,
        pickWallets,
        addCollaborator,
        updateCollaborator,
        removeCollaborator,
        saveDraft,
        loadDraft,
        draftLoadError,
        pendingDraftLoad,
        confirmLoadDraft,
        cancelLoadDraft,
        canProceedToBenefit,
        canProceedToReview,
        canProceedToPublish,
        resetDraft,
        welcomeDismissed,
        dismissWelcome,
        sessionRestored,
        sessionError,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be inside StudioProvider");
  return ctx;
}
