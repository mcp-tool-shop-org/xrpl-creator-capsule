# Proof 4E — Timing Truth

## What was built

1. **Stage-based progress for publish.** Each publish step shows a sublabel explaining what's happening:
   - "Securely loading your signing keys"
   - "Converting your release into a canonical artifact"
   - "Submitting your release to the ledger — this may take a moment"

2. **Reassuring copy during minting wait.** When the mint step is active, a message explains: "Your release is being submitted to the XRPL network. This typically takes 10-30 seconds. Do not close the app — the transaction is in progress."

3. **Verification timing context.** The VerifyPanel explains what's happening during verification: "Reconciling manifest against receipt and XRPL ledger. Checking hash integrity, token existence, authorized minter status, and metadata URI consistency."

4. **Recovery timing context.** The RecoveryPage explains: "Building your recovery bundle. This verifies consistency between your manifest, receipt, and on-chain data. Usually takes a few seconds."

5. **Access check timing context.** The TestAccessPage explains: "Checking token ownership on the XRPL network. This verifies whether the wallet holds any of the NFTs minted for this release."

6. **No fake progress bars.** Progress is shown as stage checkmarks (done/active/pending), not percentages. The app never lies about how far along it is.

## What this proves

- Waiting feels intentional, not stalled
- User understands what step is happening at all times
- No misleading certainty during unresolved state
- No incentive to click wildly or restart prematurely
- Publish feels like a release action, not a stalled crypto operation
- Verification feels reassuring, not technical
- Recovery feels like safety, not complexity

## Files changed

- `app/src/components/studio/PublishPage.tsx` — sublabels, minting wait message
- `app/src/components/studio/RecoveryPage.tsx` — generation wait message
- `app/src/components/studio/TestAccessPage.tsx` — access check wait message
- `app/src/components/panels/VerifyPanel.tsx` — verification wait message
