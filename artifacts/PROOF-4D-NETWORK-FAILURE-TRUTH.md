# Proof 4D — Network-Failure Truth

## What was built

1. **Mint timeout (90 seconds).** Both Studio and Advanced mode mint operations race against a 90-second timeout. If the mint takes longer, the UI transitions to a `timed_out` state — not an error.

2. **Timeout is distinct from failure.** The `ActionStatus` type now includes `"timed_out"` alongside `"error"`. UI renders `TimeoutBanner` (amber) with two actions: "Check Status" and "Retry". The message explains that the transaction may still be processing.

3. **Post-timeout reconciliation.** After a timeout, "Check Status" attempts to read the receipt file from disk. If it exists and contains token IDs, the mint actually succeeded — the UI transitions to "done". If it doesn't exist or has no tokens, the user is told they can retry safely.

4. **Advanced mode timeout handling.** The MintPanel shows `TimeoutBanner` with "Check Status" (loads receipt file) and "Retry" (runs mint again). The panel status shows "Timed Out" instead of "Error".

5. **Instrumentation.** Timeout events are logged with action name, start/end timestamps, timeout reason, and the artifact path where the receipt would be saved.

## What this proves

- User never has to guess whether publish happened
- Timeout is distinct from failure (amber, not red)
- Retry does not duplicate mint accidentally (user chooses to retry consciously)
- Timeouts direct user into reconcile/verify, not blind repeat
- Final truth can always be re-established via receipt file check

## Reconciliation logic

```
timeout → "Check Status" button
  → try to read receipt file at expected path
    → if file exists with token IDs → mint succeeded, show "done"
    → if file exists but empty → mint incomplete, allow retry
    → if file doesn't exist → mint didn't complete, allow retry
```

## Files changed

- `app/src/state/release.tsx` — timeout handling in runMint, timed_out status
- `app/src/components/studio/PublishPage.tsx` — timeout phase, reconciliation flow, TimeoutBanner
- `app/src/components/panels/MintPanel.tsx` — timed_out status derivation, TimeoutBanner display
- `app/src/components/panels/PanelShell.tsx` — TimeoutBanner component, timed_out status color/label
