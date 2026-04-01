---
title: XRPL Creator Capsule
description: Creator-owned release system on the XRP Ledger.
sidebar:
  order: 0
---

XRPL Creator Capsule treats the XRP Ledger as a durable control plane for ownership, payment, access, and survivability around creative work. It is not a marketplace — it is the infrastructure that makes marketplaces optional.

**New to Capsule?** Start with the [Beginners Guide](/xrpl-creator-capsule/handbook/beginners/) — a step-by-step walkthrough for creatives using the desktop app. No blockchain experience required.

## The thesis

A creator should be able to:

1. **Issue** a release with a deterministic, tamper-evident identity
2. **Mint** editions as NFTs on XRPL with receipts that reconcile against the chain
3. **Gate** access to benefits based on on-chain ownership
4. **Recover** the full release without the original app
5. **Govern** revenue through an auditable approval chain

Every claim is backed by hash-stamped artifacts and verifiable against the ledger.

## Five proven truths

| Phase | What it proves |
|-------|---------------|
| A — Creator Intent | Manifest identity is deterministic and tamper-evident |
| B — Mint Truth | NFTs on XRPL match the manifest exactly |
| C — Access Truth | Ownership unlocks real off-chain access |
| E — Durability Truth | A release survives frontend death |
| D — Governance Truth | Revenue is governed through auditable approval |

## Architecture

The system is a TypeScript monorepo with 5 workspace packages:

- **`@capsule/core`** — Canonical contracts, AJV schemas, validation, deterministic hashing
- **`@capsule/xrpl`** — XRPL client (connect, mint, verify, holder checks)
- **`@capsule/storage`** — Content store + delivery provider interfaces
- **`@capsule/xaman`** — Wallet-mediated signing via Xaman
- **`@capsule/cli`** — 15 CLI commands for the full release lifecycle

## Next steps

- [Beginners Guide](/xrpl-creator-capsule/handbook/beginners/) — Your first release in 10 minutes using the desktop app
- [Developer Setup](/xrpl-creator-capsule/handbook/getting-started/) — Clone, build, and run the test suite
- [Release Lifecycle](/xrpl-creator-capsule/handbook/release-lifecycle/) — Create, mint, and verify a release
- [CLI Reference](/xrpl-creator-capsule/handbook/reference/) — All 15 commands
