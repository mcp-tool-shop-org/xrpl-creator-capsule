<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

Creator-owned release system on the XRP Ledger. Issue work, sell directly, unlock collector benefits, govern revenue — all backed by durable on-chain truth that survives frontend death.

## What it does

XRPL Creator Capsule treats the XRP Ledger as a durable control plane for ownership, payment, access, and survivability around creative work. It is not a marketplace — it is the infrastructure that makes marketplaces optional.

A creator capsule binds together:

- **Creator Intent** — A signed release manifest with deterministic identity (SHA-256 manifestId)
- **Mint Truth** — NFT editions minted on XRPL with tamper-evident issuance receipts
- **Access Truth** — Ownership-gated benefits verified by on-chain holder checks
- **Durability Truth** — Recovery bundles that reconstruct the full release without the original app
- **Governance Truth** — Revenue governed through an auditable approval chain (policy → proposal → decision → execution)

Every artifact is hash-stamped and cross-referenced. Every claim is verifiable against the ledger.

## Architecture

```
packages/
  core/       Canonical contracts, schemas, validation, hashing
  xrpl/       XRPL client (connect, mint, verify, holder checks)
  storage/    Content store + delivery provider interfaces
  xaman/      Wallet-mediated signing via Xaman
  cli/        15 CLI commands for the full release lifecycle
artifacts/    Live Testnet proof artifacts
fixtures/     Sanitized fixtures for testing
```

Monorepo with 5 npm workspaces. TypeScript, Vitest, Node 22+.

## Quick start

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## CLI commands

| Command | Purpose |
|---------|---------|
| `init-wallets` | Generate and fund issuer + operator wallet pair |
| `configure-minter` | Set operator as authorized minter on issuer account |
| `create-release` | Create a release from a manifest input file |
| `validate` | Validate a Release Manifest against the schema |
| `resolve` | Check that manifest pointers are structurally valid |
| `mint-release` | Mint NFT editions and emit issuance receipt |
| `verify-release` | Reconcile manifest + receipt against chain state |
| `create-access-policy` | Generate an access policy from manifest + receipt |
| `grant-access` | Evaluate access request and emit grant receipt |
| `recover-release` | Reconstruct a release from artifacts + chain state |
| `create-governance-policy` | Create a governance policy for a release treasury |
| `propose-payout` | Create a payout proposal against a governance policy |
| `decide-payout` | Collect approvals and emit a decision receipt |
| `execute-payout` | Record payout execution and verify hash chain |
| `verify-payout` | Verify all 4 governance artifacts and their relationships |

## Proven phases

| Phase | What it proves | Tests |
|-------|---------------|-------|
| A — Creator Intent | Manifest identity is deterministic and tamper-evident | 27 |
| B — Mint Truth | NFTs on XRPL match manifest exactly (live Testnet) | 36 |
| C — Access Truth | Ownership unlocks real off-chain access | 34 |
| E — Durability Truth | Release survives frontend death (death drill passed) | 28 |
| D — Governance Truth | Revenue governed through auditable approval chain | 67 |
| **Total** | | **240** |

## Trust model

**What this system touches:**
- Local JSON files (manifests, receipts, policies, bundles)
- XRPL via WebSocket (`wss://`) for minting, verification, and holder checks
- Wallet seed phrases stored in local `wallets.json` (gitignored, never committed)

**What this system does NOT touch:**
- No external APIs beyond XRPL nodes
- No databases, cloud storage, or third-party services
- No user analytics, tracking, or telemetry

**Security boundaries:**
- Mainnet writes require explicit `--network mainnet --allow-mainnet-write`
- Wallet credentials stay local — transmitted only to XRPL for transaction signing
- All hashes use SHA-256 over deterministic `sortKeysDeep()` canonicalization
- Every artifact is independently verifiable against the ledger
- `xrpl` pinned at exact version 4.2.5 (post npm supply chain advisory)
- No telemetry is collected or sent

## Verification

```bash
bash verify.sh
```

Runs TypeScript type-checking and the full 240-test suite.

## Status

**Phase 1 MVP: complete.** The core product thesis — XRPL as a durable control plane for creator releases — is proven across all five phases with live Testnet artifacts.

**Pending:** Xaman live proof (adapter architecture shipped, awaiting external credentials). This is a closure pass, not a new build phase.

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
