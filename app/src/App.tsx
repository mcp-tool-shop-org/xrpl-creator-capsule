import { useState } from "react";
import { ReleaseChamber } from "./components/ReleaseChamber";
import { TitleBar, type AppMode } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StudioSidebar } from "./components/studio/StudioSidebar";
import { StudioShell } from "./components/studio/StudioShell";
import { StudioProvider } from "./state/studio";

export type PanelId = "manifest" | "mint" | "verify" | "access" | "recovery" | "governance";

export function App() {
  const [mode, setMode] = useState<AppMode>("studio");
  const [activePanel, setActivePanel] = useState<PanelId>("manifest");

  const toggleMode = () => setMode((m) => (m === "studio" ? "advanced" : "studio"));

  return (
    <>
      <TitleBar mode={mode} onToggleMode={toggleMode} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {mode === "studio" ? (
          <StudioProvider>
            <StudioSidebar onSwitchToAdvanced={() => setMode("advanced")} />
            <StudioShell />
          </StudioProvider>
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
