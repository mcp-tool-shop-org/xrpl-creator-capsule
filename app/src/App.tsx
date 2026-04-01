import { useState } from "react";
import { ReleaseChamber } from "./components/ReleaseChamber";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";

export type PanelId = "manifest" | "mint" | "verify" | "access" | "recovery" | "governance";

export function App() {
  const [activePanel, setActivePanel] = useState<PanelId>("manifest");

  return (
    <>
      <TitleBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar activePanel={activePanel} onSelect={setActivePanel} />
        <ReleaseChamber activePanel={activePanel} />
      </div>
    </>
  );
}
