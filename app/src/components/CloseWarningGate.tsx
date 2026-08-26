/**
 * F-10b68454 (frontend half): commands.rs's engine_call spawns a bridge-
 * worker child process per call with nothing tying its lifetime to the
 * app window — closing the window used to leave an in-flight worker
 * running invisibly in the background. lib.rs's on_window_event handler
 * now blocks a close (api.prevent_close()) when a call is believed to
 * be in flight and emits "bridge-worker-close-warning" instead of
 * killing anything outright — the DESIGN HAZARD being guarded against
 * is that a mid-mint worker may have already submitted an irreversible
 * XRPL transaction, so a blind kill could destroy the in-flight receipt
 * write, which is worse than the current invisible-but-recoverable
 * status quo (the mint reconcile path — see release.tsx's
 * reconcileReceipt(), F-15fcdca0 — can still find that receipt after a
 * restart, exactly because it made it to disk).
 *
 * This component is the frontend side of that flow: it listens for the
 * warning event for the lifetime of the app (mounted once, near the
 * root — see App.tsx) and shows a confirm dialog when it fires.
 *   - "Wait": just dismisses the dialog. The window was never actually
 *     closed (Rust already called prevent_close()), so there is nothing
 *     else to do — the user's next close attempt re-evaluates from
 *     scratch and will succeed immediately once the call has settled.
 *   - "Close Anyway": calls confirmCloseAndExit(), which kills every
 *     tracked bridge-worker process and exits the app directly.
 *
 * Reuses PanelShell's ConfirmBanner (the existing "are you sure" visual
 * vocabulary — F-040b05d3/F-bd945889) rather than inventing a new dialog
 * pattern, but rendered as a fixed-position overlay rather than inline:
 * a close can happen from ANY screen, so this cannot rely on being
 * embedded in whatever page happens to be active.
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ConfirmBanner } from "./panels/PanelShell";
import { confirmCloseAndExit } from "../bridge/engine";

export function CloseWarningGate() {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("bridge-worker-close-warning", () => {
      setShowWarning(true);
    }).then((fn) => {
      if (cancelled) {
        // The component unmounted before the subscription resolved —
        // don't leak it.
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  if (!showWarning) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        width: 420,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 1000,
      }}
    >
      <ConfirmBanner
        message={
          "Capsule is still communicating with the XRPL bridge — an operation (e.g. a mint) may still be in " +
          "progress. If it already reached the network, closing now won't undo it, but you may not see the " +
          "result recorded. Wait for it to finish, or close anyway."
        }
        confirmLabel="Close Anyway"
        cancelLabel="Wait"
        onConfirm={() => {
          setShowWarning(false);
          confirmCloseAndExit().catch(() => {
            // Best-effort: if this somehow fails, there is no further
            // recovery action to offer from here — the user can still
            // use the OS window controls again, which will simply
            // re-run the same has_in_flight() check.
          });
        }}
        onCancel={() => setShowWarning(false)}
      />
    </div>
  );
}
