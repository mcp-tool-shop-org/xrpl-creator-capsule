import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// Loose artifact types for UI display — the real validation lives in @capsule/core.
// We use `any` shaped records here because the UI reads and displays artifacts;
// it does not validate them (that's the engine's job via Tauri commands).

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReleaseState {
  manifest: any | null;
  receipt: any | null;
  accessPolicy: any | null;
  accessGrant: any | null;
  recoveryBundle: any | null;
  governancePolicy: any | null;
  payoutProposal: any | null;
  payoutDecision: any | null;
  payoutExecution: any | null;
  loadRelease: () => void;
  createRelease: () => void;
}

const ReleaseContext = createContext<ReleaseState | null>(null);

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [accessPolicy, setAccessPolicy] = useState<any | null>(null);
  const [accessGrant, setAccessGrant] = useState<any | null>(null);
  const [recoveryBundle, setRecoveryBundle] = useState<any | null>(null);
  const [governancePolicy, setGovernancePolicy] = useState<any | null>(null);
  const [payoutProposal, setPayoutProposal] = useState<any | null>(null);
  const [payoutDecision, setPayoutDecision] = useState<any | null>(null);
  const [payoutExecution, setPayoutExecution] = useState<any | null>(null);

  const loadRelease = useCallback(async () => {
    // In Tauri: open file dialog → read JSON → validate → set state
    // For now, stub that loads the fixture data via Tauri commands
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        title: "Load Release Manifest",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = typeof result === "string" ? result : (result as { path: string }).path;
      const content = await readTextFile(filePath);
      const parsed = JSON.parse(content);

      if (parsed.kind === "release-manifest" || parsed.title) {
        setManifest(parsed);
      }
    } catch (err) {
      console.error("Failed to load release:", err);
    }
  }, []);

  const createRelease = useCallback(() => {
    // Will open a form to create a new manifest
    console.log("Create release — not yet implemented");
  }, []);

  return (
    <ReleaseContext.Provider
      value={{
        manifest,
        receipt,
        accessPolicy,
        accessGrant,
        recoveryBundle,
        governancePolicy,
        payoutProposal,
        payoutDecision,
        payoutExecution,
        loadRelease,
        createRelease,
      }}
    >
      {children}
    </ReleaseContext.Provider>
  );
}

export function useRelease(): ReleaseState {
  const ctx = useContext(ReleaseContext);
  if (!ctx) throw new Error("useRelease must be inside ReleaseProvider");
  return ctx;
}
