# Proof 4A — Mode-Switch Truth

## What was built

1. **StudioProvider persists across mode switches.** Previously, switching Studio -> Advanced destroyed the StudioProvider and all draft state. Now StudioProvider wraps both modes — draft state survives any number of mode switches.

2. **Release identity indicator in TitleBar.** The active release (title + artist) is always visible in the title bar, regardless of mode. No ambiguity about which release is being acted on.

3. **Mode switch instrumentation.** Every mode switch is logged with timestamp, target mode, and active release identity. This creates an audit trail for debugging trust gaps.

4. **Session persistence on mode switch.** The current mode is saved to the session file so restart restores the correct mode.

## What this proves

- No stale artifacts shown after mode switch — the ReleaseContext is shared between both modes
- No wrong-release context carried over — release identity is displayed continuously
- No phantom readiness states — StudioProvider state is preserved, not recreated
- No hidden dependency on panel order — Advanced mode panels read from the same canonical state
- User always knows which release they are acting on (TitleBar indicator)

## Files changed

- `app/src/App.tsx` — StudioProvider lifted above mode switch, AppInner extracts release identity
- `app/src/components/TitleBar.tsx` — accepts and displays ReleaseIdentity
- `app/src/state/release.tsx` — added ReleaseIdentity type and computed value
