import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { loadFile, saveFile } from "../bridge/engine";
import { saveSession, loadSession, validateSession } from "./session";
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

  // Readiness checks
  canProceedToBenefit: boolean;
  canProceedToReview: boolean;
  canProceedToPublish: boolean;

  // Reset
  resetDraft: () => void;

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

// ── Provider ───────────────────────────────────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<StudioDraft>(INIT_DRAFT);
  const [activeStep, setActiveStepRaw] = useState<StudioStep>("create");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
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
  useEffect(() => {
    if (!sessionRestored) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveSession({ draft, activeStep }).catch(() => { /* best effort */ });
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
    const content = await loadFile(path);
    const loaded = JSON.parse(content) as StudioDraft;
    setDraft({ ...loaded, draftPath: path });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(INIT_DRAFT);
    setActiveStepRaw("create");
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
        canProceedToBenefit,
        canProceedToReview,
        canProceedToPublish,
        resetDraft,
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
