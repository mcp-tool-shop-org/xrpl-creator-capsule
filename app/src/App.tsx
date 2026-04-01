import { useState, useCallback } from "react";
import { ReleaseChamber } from "./components/ReleaseChamber";
import { TitleBar, type AppMode } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StudioSidebar } from "./components/studio/StudioSidebar";
import { StudioShell } from "./components/studio/StudioShell";
import { StudioProvider } from "./state/studio";
import { useRelease, logAction } from "./state/release";
import { saveSession } from "./state/session";

export type PanelId = "manifest" | "mint" | "verify" | "access" | "recovery" | "governance";

function AppInner() {
  const [mode, setMode] = useState<AppMode>("studio");
  const [activePanel, setActivePanel] = useState<PanelId>("manifest");
  const release = useRelease();

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "studio" ? "advanced" : "studio";
      logAction({
        action: "mode_switch",
        status: "done",
        startedAt: new Date().toISOString(),
        mode: next,
        releaseIdentity: release.releaseIdentity.title
          ? `${release.releaseIdentity.title} — ${release.releaseIdentity.artist}`
          : undefined,
      });
      saveSession({ mode: next }).catch(() => {});
      return next;
    });
  }, [release.releaseIdentity]);

  return (
    <>
      <TitleBar
        mode={mode}
        onToggleMode={toggleMode}
        releaseIdentity={release.releaseIdentity}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {mode === "studio" ? (
          <>
            <StudioSidebar onSwitchToAdvanced={() => setMode("advanced")} />
            <StudioShell />
          </>
        ) : (
          <>
            <Sidebar activePanel={activePanel} onSelect={setActivePanel} />
            <ReleaseChamber activePanel={activePanel} />
          </>
        )}
      </div>
    </>
  );
}

export function App() {
  return (
    <StudioProvider>
      <AppInner />
    </StudioProvider>
  );
}
