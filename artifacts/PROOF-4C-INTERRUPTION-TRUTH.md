# Proof 4C — Interruption Truth

## What was built

1. **Explicit cancel states.** Every file picker and save dialog dismissal now produces a distinct `canceled` status with a human-readable reason:
   - Wallet picker dismissed → "Wallet selection was canceled. Your draft is safe."
   - Manifest save dismissed → "Manifest save location was canceled. Nothing was created."
   - Receipt save dismissed → "Receipt save location was canceled. Manifest was saved but nothing was minted."
   - Recovery bundle save dismissed → specific cancel state with retry button
   - Access policy save dismissed → logged, silent return (Advanced mode)

2. **Cancel is distinct from error.** The `ActionStatus` type now includes `"canceled"` alongside `"error"`. UI renders `CancelBanner` (amber, with retry) instead of `ErrorBanner` (red). Users never see a cancel as a failure.

3. **Partial state is explicit.** When publish is canceled after the manifest is saved but before minting, the cancel message says exactly what happened: "Manifest was saved but nothing was minted." No ambiguity about what was created.

4. **Next-step guidance after interruption.** Every cancel banner includes a Retry button. The user always knows what to do next.

5. **Action instrumentation.** Every cancel is logged with action name, timestamp, cancel reason, and (where applicable) the artifact path of what was partially created.

## What this proves

- Cancel is distinct from error in UI and state
- Partial state is obvious — user knows exactly what was created and what wasn't
- No corrupted artifact state appears from canceled operations
- User can safely retry after any interruption
- No phantom receipts/bundles/policies from canceled operations

## Files changed

- `app/src/state/release.tsx` — cancel logging for manifest load, mint, access policy, recovery
- `app/src/components/studio/PublishPage.tsx` — cancel phase, CancelBanner for wallet/manifest/receipt dismissals
- `app/src/components/studio/RecoveryPage.tsx` — cancel state display
- `app/src/components/panels/PanelShell.tsx` — CancelBanner and TimeoutBanner components
