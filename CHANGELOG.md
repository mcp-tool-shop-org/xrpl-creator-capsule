# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-08-26

Hardening and humanization release — the output of a nine-wave adversarial
audit-and-amend pass (102 findings filed, all dispositioned; test suite grew
from 421 to 747).

### Added

- **React error boundary** at the app root with plain-language recovery: "Try
  Again" re-renders; "Start Fresh" clears the saved session and reloads —
  breaking the autosave crash-recurrence loop a malformed draft could cause
- **"Start a New Release"** action in the Studio sidebar (with confirmation) —
  the first discoverable way to begin a second release after publishing one
- **Client-side timeouts on every network-touching action** (verify, access
  grant/test, recovery, replay, policy and governance operations), reusing the
  mint flow's honest "timed out — not necessarily failed" messaging
- **Confirmation before Load Draft overwrites unsaved work**, sharing one
  confirm vocabulary with Start a New Release
- **Humanized error surface**: every raw engine/filesystem/network error is
  translated to plain language in the error banner, with the raw text kept
  under a collapsed "Technical details" disclosure
- **Bridge-worker lifecycle management**: spawned engine workers are tracked;
  closing the app with work in flight warns first (an in-flight mint's receipt
  is preserved rather than silently destroyed), and confirmed close reaps all
  workers
- **Per-edition chain verification in the desktop app**: verify and recovery
  now check every minted edition against the ledger, not just the first
- **Real `--help`**: all 15 CLI commands document their flags with examples
- **`init-wallets --allow-mainnet-write`**: the mainnet guard flag the
  command's own error message referenced now actually exists on the command
- Structured, creator-readable errors for malformed JSON arguments and files
  across the CLI (one shared helper, stack traces gone)
- Runtime shape validation for session and draft files — a hand-edited or
  corrupted file falls back safely instead of crashing the renderer
- Session save failures are now visible (action log + non-blocking notice)
  instead of silently swallowed; the Report button confirms success or failure
- Test coverage: every engine/CLI module and all 16 bridge-worker handlers now
  have dedicated tests, mutation-proven where load-bearing

### Fixed

- Governance decision receipts: `rejectedCount` is now re-verified against the
  recomputed approval set (previously unchecked)
- Recovery bundle verification always recomputes the receipt hash instead of
  trusting the receipt's self-reported hash field
- `authorizeOperatorAsMinter` no longer reports success when transaction
  metadata is malformed (fail-open closed; mirrors the mint path's guard)
- Ledger reads (`verifyAuthorizedMinter`, `readNftFromLedger`) distinguish
  "account not found" from transport failures instead of crashing raw
- Xaman client failures are normalized into typed errors with causes
- `buildMintPayload` enforces the 0–50% transfer-fee bound like the mint path
- Bridge-worker stdout responses are fully flushed on POSIX pipes (multi-
  megabyte responses were truncated on Linux; caught by CI's runner)
- Wave of type-safety and test-infrastructure fixes: single hoisted vitest
  across the workspace, hermetic golden-path test that actually compares
  against committed goldens, line-ending pinning for tracked artifacts, CI
  runs `bash verify.sh` directly instead of hand-mirroring its commands

### Changed

- README and handbook test-count claims replaced with drift-resistant wording
  (`bash verify.sh` is the source of truth; 700+ tests at time of writing)

## [1.0.0] - 2026-04-01

### Added

- **Phase A — Creator Intent**: Release manifest with deterministic hashing (manifestId + revisionHash)
- **Phase B — Mint/Execution Truth**: Direct-rail NFT minting on XRPL Testnet with issuance receipts
- **Phase B5 — Xaman Rail**: Wallet-mediated signing adapter (architecture shipped, live proof pending credentials)
- **Phase C — Access Truth**: Ownership-gated benefits with access policies, holder verification, and delivery tokens
- **Phase E — Durability Truth**: Recovery bundles that reconstruct releases without the original app
- **Phase D — Governance Truth**: 4-contract approval chain (policy → proposal → decision → execution) with full hash chain
- **Desktop Runtime Trust**: 94 tests covering session persistence, bridge commands, release state machine, mode-switch preservation, timeout/reconciliation/retry
- Desktop app (Tauri v2 + React): Studio Mode (6-step guided flow) and Advanced Mode
- 5 workspace packages: `@capsule/core`, `@capsule/xrpl`, `@capsule/storage`, `@capsule/xaman`, `@capsule/cli`
- 15 CLI commands covering the full release lifecycle
- 359 tests across all packages and desktop app
- Live Testnet proof artifacts with sanitized fixtures
- Mainnet write guard requiring explicit `--network mainnet --allow-mainnet-write`
- Support bundle reads version from package metadata (no more hardcoded version strings)

### Known limitations

- Node.js 22+ required for desktop app (bundled runtime planned)
- Xaman QR signing architecture shipped, live proof pending credentials
- IPFS upload pending — file pointers use local paths
- Windows only — macOS installer planned
