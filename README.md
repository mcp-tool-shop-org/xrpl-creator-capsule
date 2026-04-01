<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/preview-v1.0.0--rc.2-orange" alt="Preview RC.2" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

Creator-owned release system on the XRP Ledger. Issue work, sell directly, unlock collector benefits, govern revenue — all backed by durable on-chain proof.

> **Preview release.** RC.2 is a Testnet preview product. The engine architecture supports both Testnet and Mainnet, but all trust proofs have been validated on Testnet only. Mainnet is a guarded, deliberate path — not the default.

## Two ways to use it

### Desktop app (recommended for creators)

Download the Windows installer from [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/tag/v1.0.0-rc.2) and follow the [Beginners Guide](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

**Studio Mode** walks you through a guided 6-step flow:

1. Describe your release (title, artist, edition size, files)
2. Set collector benefits (bonus tracks, stems, high-res art)
3. Review terms and safety
4. Publish to XRPL Testnet
5. Test collector access
6. Generate a recovery bundle

Requires [Node.js 22+](https://nodejs.org/) (bundled runtime coming in a future release).

### CLI (for developers and integrators)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

15 commands covering the full release lifecycle:

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

## What it proves

XRPL Creator Capsule treats the XRP Ledger as a durable control plane for ownership, payment, access, and survivability. It is not a marketplace — it is the infrastructure that makes marketplaces optional.

| Phase | What it proves | Tests |
|-------|---------------|-------|
| A — Creator Intent | Manifest identity is deterministic and tamper-evident | 27 |
| B — Mint Truth | NFTs on XRPL match manifest exactly (live Testnet proof) | 36 |
| C — Access Truth | Ownership unlocks real off-chain access | 34 |
| D — Governance Truth | Revenue governed through auditable approval chain | 67 |
| E — Durability Truth | Release survives frontend death (death drill passed) | 28 |
| Desktop Runtime Trust | Mode switch, restart, interruption, timeout, timing | 73 |
| **Total** | | **265** |

## Architecture

```
app/              Desktop app (Tauri v2 + React)
  src/            Studio Mode + Advanced Mode UI
  src-tauri/      Rust backend (file I/O, bridge dispatch)
  bridge-worker   Engine bridge (stdin/stdout JSON-RPC)
packages/
  core/           Canonical contracts, schemas, validation, hashing
  xrpl/           XRPL client (connect, mint, verify, holder checks)
  storage/        Content store + delivery provider interfaces
  xaman/          Wallet-mediated signing via Xaman
  cli/            15 CLI commands
artifacts/        Live Testnet proof artifacts
site/             Handbook (Astro Starlight)
```

Monorepo with 5 engine packages + desktop app. TypeScript, Vitest, Tauri v2, Node 22+.

## Network posture

The system has full network awareness — Testnet and Mainnet are distinct, configurable targets.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Yes | No |
| **Trust-proven** | Yes (live proofs, 265 tests) | Not yet |
| **CLI guard** | None needed | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Studio Mode default | Not exposed in RC.2 |

**Treat this release as a Testnet preview.** The architecture is not Testnet-only, but the trust proof is Testnet-proven. Mainnet readiness requires live Xaman signing and deliberate promotion — not a flag flip.

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

## Known limitations

- **Node.js required** for the desktop app (bundled runtime coming)
- **Xaman QR signing not yet live** — wallet credentials file required (seed-based, testnet only)
- **IPFS upload pending** — file pointers use local paths, real content-addressed storage coming
- **Windows only** — macOS installer planned for a future RC

## Reporting problems

Click **Report** in the desktop title bar to export a support bundle, then open a [GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
