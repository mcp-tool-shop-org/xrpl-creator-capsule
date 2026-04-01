---
title: Developer Setup
description: Clone, build, and run the test suite for contributors and developers.
sidebar:
  order: 2
---

## Prerequisites

- **Node.js 22+** (required for workspace support)
- **npm 10+**
- Git

## Clone and build

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
```

## Run the test suite

```bash
bash verify.sh
```

This runs TypeScript type-checking and the full 240-test suite across all packages. Every test passes without network access — XRPL calls are mocked in unit tests.

## Project structure

```
xrpl-creator-capsule/
├── packages/
│   ├── core/        # Contracts, schemas, validation, hashing
│   ├── xrpl/        # XRPL client (connect, mint, verify)
│   ├── storage/     # Content store + delivery interfaces
│   ├── xaman/       # Wallet-mediated signing
│   └── cli/         # 15 CLI commands
├── artifacts/       # Live Testnet proof artifacts
├── fixtures/        # Sanitized fixtures for testing
└── verify.sh        # One-command verification
```

## Initialize wallets (Testnet)

To work with the XRPL Testnet, generate a funded wallet pair:

```bash
npx tsx packages/cli/src/bin.ts init-wallets \
  --network testnet --fund --authorize -o wallets.json
```

This creates:
- An **issuer** wallet (owns the release)
- An **operator** wallet (authorized to mint on behalf of the issuer)
- Both wallets funded from the Testnet faucet

The `wallets.json` file contains seed phrases — **never commit it**. It's already in `.gitignore`.

## Next steps

Once you have wallets, follow the [Release Lifecycle](/xrpl-creator-capsule/handbook/release-lifecycle/) to create, mint, and verify your first release.
