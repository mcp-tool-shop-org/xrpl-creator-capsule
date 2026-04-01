# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
