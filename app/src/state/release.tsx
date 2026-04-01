import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  loadFile,
  validateManifest as engineValidate,
  resolveManifest as engineResolve,
  stampManifest as engineStamp,
  mintRelease as engineMint,
  verifyRelease as engineVerify,
  type ReleaseManifest,
  type IssuanceReceipt,
  type ValidationResult,
  type ResolutionResult,
  type StampResult,
  type VerifyResult,
} from "../bridge/engine";

// ── Status types ────────────────────────────────────────────────────

export type ArtifactStatus = "empty" | "loading" | "loaded" | "error";
export type ActionStatus = "idle" | "running" | "done" | "error";

// ── State shapes ────────────────────────────────────────────────────

export interface ManifestState {
  status: ArtifactStatus;
  path: string | null;
  data: ReleaseManifest | null;
  validation: ValidationResult | null;
  resolution: ResolutionResult | null;
  stamp: StampResult | null;
  error: string | null;
}

export interface MintState {
  status: ArtifactStatus;
  actionStatus: ActionStatus;
  walletsPath: string | null;
  receiptPath: string | null;
  receipt: IssuanceReceipt | null;
  error: string | null;
}

export interface VerifyState {
  status: ActionStatus;
  result: VerifyResult | null;
  error: string | null;
}

// ── Context shape ───────────────────────────────────────────────────

interface ReleaseContextValue {
  manifest: ManifestState;
  mint: MintState;
  verify: VerifyState;

  // Manifest actions
  loadManifest: () => Promise<void>;
  validateManifest: () => Promise<void>;
  resolveManifest: () => Promise<void>;

  // Mint actions
  loadWallets: () => Promise<void>;
  loadReceipt: () => Promise<void>;
  runMint: () => Promise<void>;

  // Verify actions
  runVerify: () => Promise<void>;

  // Network
  network: string;
}

const ReleaseContext = createContext<ReleaseContextValue | null>(null);

// ── Initial states ──────────────────────────────────────────────────

const INIT_MANIFEST: ManifestState = {
  status: "empty",
  path: null,
  data: null,
  validation: null,
  resolution: null,
  stamp: null,
  error: null,
};

const INIT_MINT: MintState = {
  status: "empty",
  actionStatus: "idle",
  walletsPath: null,
  receiptPath: null,
  receipt: null,
  error: null,
};

const INIT_VERIFY: VerifyState = {
  status: "idle",
  result: null,
  error: null,
};

// ── Provider ────────────────────────────────────────────────────────

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [manifestState, setManifest] = useState<ManifestState>(INIT_MANIFEST);
  const [mintState, setMint] = useState<MintState>(INIT_MINT);
  const [verifyState, setVerify] = useState<VerifyState>(INIT_VERIFY);
  const network = "testnet";

  // ── Manifest actions ────────────────────────────────────────────

  const loadManifest = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Release Manifest",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setManifest((s) => ({ ...s, status: "loading", error: null }));

      const content = await loadFile(filePath);
      const data = JSON.parse(content) as ReleaseManifest;

      setManifest({
        status: "loaded",
        path: filePath,
        data,
        validation: null,
        resolution: null,
        stamp: null,
        error: null,
      });

      // Reset downstream state when manifest changes
      setMint(INIT_MINT);
      setVerify(INIT_VERIFY);
    } catch (err) {
      setManifest((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const validateManifestAction = useCallback(async () => {
    if (!manifestState.path) return;
    try {
      setManifest((s) => ({ ...s, error: null }));
      const validation = await engineValidate(manifestState.path);
      setManifest((s) => ({ ...s, validation }));
    } catch (err) {
      setManifest((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path]);

  const resolveManifestAction = useCallback(async () => {
    if (!manifestState.path) return;
    try {
      setManifest((s) => ({ ...s, error: null }));
      const resolution = await engineResolve(manifestState.path);
      const stamp = await engineStamp(manifestState.path);
      setManifest((s) => ({ ...s, resolution, stamp }));
    } catch (err) {
      setManifest((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path]);

  // ── Mint actions ────────────────────────────────────────────────

  const loadWallets = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Wallet Credentials",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setMint((s) => ({ ...s, walletsPath: filePath, error: null }));
    } catch (err) {
      setMint((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const loadReceipt = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Issuance Receipt",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      const content = await loadFile(filePath);
      const receipt = JSON.parse(content) as IssuanceReceipt;

      setMint((s) => ({
        ...s,
        status: "loaded",
        receiptPath: filePath,
        receipt,
        error: null,
      }));
    } catch (err) {
      setMint((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const runMint = useCallback(async () => {
    if (!manifestState.path || !mintState.walletsPath) return;

    try {
      // Ask where to save the receipt
      const receiptPath = await save({
        title: "Save Issuance Receipt",
        defaultPath: "receipt.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!receiptPath) return;

      setMint((s) => ({ ...s, actionStatus: "running", error: null }));

      const receipt = await engineMint({
        manifestPath: manifestState.path,
        walletsPath: mintState.walletsPath,
        network,
        receiptPath,
      });

      setMint({
        status: "loaded",
        actionStatus: "done",
        walletsPath: mintState.walletsPath,
        receiptPath,
        receipt,
        error: null,
      });
    } catch (err) {
      setMint((s) => ({
        ...s,
        actionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.walletsPath, network]);

  // ── Verify actions ──────────────────────────────────────────────

  const runVerify = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath) return;

    try {
      setVerify({ status: "running", result: null, error: null });

      const result = await engineVerify(manifestState.path, mintState.receiptPath);

      setVerify({ status: "done", result, error: null });
    } catch (err) {
      setVerify({
        status: "error",
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [manifestState.path, mintState.receiptPath]);

  // ── Context value ───────────────────────────────────────────────

  return (
    <ReleaseContext.Provider
      value={{
        manifest: manifestState,
        mint: mintState,
        verify: verifyState,
        loadManifest,
        validateManifest: validateManifestAction,
        resolveManifest: resolveManifestAction,
        loadWallets,
        loadReceipt,
        runMint,
        runVerify,
        network,
      }}
    >
      {children}
    </ReleaseContext.Provider>
  );
}

export function useRelease(): ReleaseContextValue {
  const ctx = useContext(ReleaseContext);
  if (!ctx) throw new Error("useRelease must be inside ReleaseProvider");
  return ctx;
}
