import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReleaseProvider } from "./state/release";
import { ErrorBoundary } from "./ErrorBoundary";
import { initActionLog } from "./state/actionlog";
import "./styles.css";

// Restore the persisted action log from the previous run and arm
// persistence for this one (F-7f36d738 follow-up: a post-crash Report
// must contain the crash). Fire-and-forget by design — it never
// rejects, and rendering must not wait on a diagnostics file. Entries
// logged before the restore finishes (e.g. a render_crash during first
// paint) are merged in after the restored, older entries.
void initActionLog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ReleaseProvider>
        <App />
      </ReleaseProvider>
    </ErrorBoundary>
  </StrictMode>
);
