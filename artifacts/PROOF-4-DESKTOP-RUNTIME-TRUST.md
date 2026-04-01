# Phase 4 — Desktop Runtime Trust

## Summary

Phase 4 hardens the desktop app's runtime behavior under real-use stress. The engine trust was proven in Phase 3 (25/25 simulation trials). Phase 4 closes the gap between engine truth, UI truth, and user belief.

## What was built

### Foundation: Outcome Model Hardening
- `ActionStatus` expanded: `idle | running | done | error | canceled | timed_out`
- `ReleaseIdentity` type: always-visible indicator of the active release
- `ActionEvent` instrumentation: timestamped log of every action with status, cancel/timeout reasons, artifact paths, mode, and reconciliation results
- `CancelBanner`, `TimeoutBanner` UI components: amber (not red), with retry/reconcile actions
- PanelShell `Status` expanded with `canceled` and `timed_out` display states

### 4A — Mode-Switch Truth
- StudioProvider persists across mode switches (draft state survives)
- Release identity displayed in TitleBar regardless of mode
- Mode switch instrumented and persisted to session

### 4B — Restart Truth
- Session persistence module: saves/restores draft, artifact paths, completion flags
- Debounced autosave (2-second) on every draft change
- Session validation on restore: broken paths cleared, completion flags reset
- Published state never inferred from cache alone

### 4C — Interruption Truth
- Every file picker/save dialog dismissal produces explicit cancel state
- Cancel is distinct from error (amber CancelBanner, not red ErrorBanner)
- Partial state is explicit ("Manifest was saved but nothing was minted")
- Every cancel banner includes retry guidance

### 4D — Network-Failure Truth
- 90-second mint timeout (Studio and Advanced)
- Timeout distinct from failure (TimeoutBanner, not ErrorBanner)
- Post-timeout reconciliation: "Check Status" reads receipt file to determine actual outcome
- Retry path available after timeout (user chooses consciously)

### 4E — Timing Truth
- Stage-based progress with sublabels explaining each step
- Reassuring copy during minting wait ("typically takes 10-30 seconds")
- Wait context for verify, access check, and recovery generation
- No fake progress bars — stage checkmarks only

## Instrumentation spine

Every significant action is logged with:
- Action name and status
- Start/end timestamps
- Cancel reason (if canceled)
- Timeout reason (if timed out)
- Artifact path involved
- Active release identity
- Mode at time of action
- Reconciliation result (if applicable)

Accessible via `getActionLog()` for debugging trust gaps.

## Exit criteria status

| Criterion | Status |
|-----------|--------|
| Mode switching never causes release-context confusion | DONE — StudioProvider persists, identity always visible |
| Restart behavior is predictable and safe | DONE — autosave + validated restore + broken path handling |
| Cancellation never masquerades as failure or success | DONE — distinct cancel state, explicit partial-state messaging |
| Network ambiguity can always be resolved without guessing | DONE — timeout + reconciliation + conscious retry |
| Long waits feel trustworthy, not broken | DONE — stage progress, sublabels, reassuring copy |
| Studio Mode remains usable without forcing Advanced rescue | DONE — all flows instrumented in Studio |

## Files changed

| File | Changes |
|------|---------|
| `app/src/state/release.tsx` | ActionStatus expanded, ReleaseIdentity, ActionEvent, logAction, resetAll, timeout in runMint, cancel logging |
| `app/src/state/studio.tsx` | Session restore on mount, autosave, sessionRestored/sessionError flags |
| `app/src/state/session.ts` | NEW — session persistence module |
| `app/src/App.tsx` | StudioProvider lifted, AppInner with release identity, mode switch logging |
| `app/src/components/TitleBar.tsx` | Release identity display |
| `app/src/components/panels/PanelShell.tsx` | CancelBanner, TimeoutBanner, canceled/timed_out status |
| `app/src/components/panels/MintPanel.tsx` | Timeout status derivation, TimeoutBanner |
| `app/src/components/panels/VerifyPanel.tsx` | Verification wait message |
| `app/src/components/studio/PublishPage.tsx` | Cancel phases, timeout + reconciliation, progress sublabels |
| `app/src/components/studio/RecoveryPage.tsx` | Cancel state, generation wait message |
| `app/src/components/studio/TestAccessPage.tsx` | Access check wait message |
| `app/src-tauri/tauri.conf.json` | App data directory FS scope |

## What Phase 4 does NOT include

- Visual redesign or CSS polish
- New product features
- Marketplace or discovery layers
- Additional governance depth
- Analytics dashboards

Every change answers one question: does this make the desktop app more truthful under real runtime stress?
