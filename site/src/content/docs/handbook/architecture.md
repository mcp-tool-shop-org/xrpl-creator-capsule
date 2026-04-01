---
title: Architecture
description: How XRPL Creator Capsule is built and how the pieces connect.
sidebar:
  order: 4
---

## Canonical objects

The system is built around a small number of canonical objects, each with a deterministic hash and a strict schema.

### Release artifacts

| Object | Package | Purpose |
|--------|---------|---------|
| **ReleaseManifest** | `@capsule/core` | Creator intent — what the release is, who owns it, what it contains |
| **IssuanceReceipt** | `@capsule/core` | Execution truth — what was actually minted on the ledger |
| **AccessPolicy** | `@capsule/core` | Benefit binding — what holders unlock and how |
| **AccessGrantReceipt** | `@capsule/core` | Access decision — allow/deny with exact reason |
| **RecoveryBundle** | `@capsule/core` | Reconstruction map — everything needed to find the release without the app |

### Governance artifacts

| Object | Package | Purpose |
|--------|---------|---------|
| **GovernancePolicy** | `@capsule/core` | Who can approve payouts, what assets, threshold |
| **PayoutProposal** | `@capsule/core` | Proposed revenue split with amounts |
| **PayoutDecisionReceipt** | `@capsule/core` | Signer approvals and outcome |
| **PayoutExecutionReceipt** | `@capsule/core` | Ledger-backed execution proof |

## Hash chain

Every object is hash-stamped using SHA-256 over `sortKeysDeep()`-canonicalized JSON. This means:
- Keys are recursively sorted at every nesting depth
- The hash is deterministic — same data always produces the same hash
- Changing any field at any depth changes the hash

Cross-references form a verifiable chain:

```
manifestId ──→ IssuanceReceipt.manifestId
              ──→ AccessPolicy.manifestId
              ──→ GovernancePolicy.manifestId

policyHash ──→ PayoutProposal.policyHash
proposalHash ──→ PayoutDecisionReceipt.proposalHash
decisionHash ──→ PayoutExecutionReceipt.decisionHash
```

Tampering with any link is detectable. The `verify-release` and `verify-payout` commands walk the full chain.

## Package boundaries

### `@capsule/core`

Zero-dependency (except AJV for schema validation). Contains:
- All TypeScript type definitions
- AJV schemas for validation
- `sortKeysDeep()` canonicalization
- `computeManifestId()`, `computeRevisionHash()`, and all hash functions
- Cross-contract validation (e.g., `checkProposalAgainstPolicy`)

### `@capsule/xrpl`

Depends on `xrpl` (pinned at exact 4.2.5). Provides:
- `connectToNetwork()` — WebSocket connection to XRPL nodes
- `mintNft()` — authorized minter NFT creation
- `verifyAuthorizedMinter()` — check minter relationship
- `readNftFromLedger()` — look up token by ID
- `checkHolder()` — intersect wallet NFTs with qualifying set

### `@capsule/storage`

Interface boundary for content storage and delivery:
- `ContentStore` — mock, filesystem, or future Helia/IPFS
- `DeliveryProvider` — mock delivery with TTL tokens

### `@capsule/xaman`

Wallet-mediated signing adapter:
- Sign-and-submit via Xaman QR code flow
- Supports configure-minter and mint-release
- Architecture shipped; live proof pending external credentials

### `@capsule/cli`

Orchestration layer — 15 commands that load artifacts, validate, call package functions, and write output. The CLI is the primary user interface.

## Security boundaries

- **Mainnet guard**: `--network mainnet --allow-mainnet-write` required for any mainnet transaction
- **Wallet isolation**: Seed phrases in `wallets.json`, gitignored, never in artifacts
- **XRPL pinning**: `xrpl@4.2.5` exact version (post supply chain advisory)
- **No telemetry**: Stated explicitly in SECURITY.md and README
