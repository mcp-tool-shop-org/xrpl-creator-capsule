import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReleaseProvider } from "./state/release";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReleaseProvider>
      <App />
    </ReleaseProvider>
  </StrictMode>
);
