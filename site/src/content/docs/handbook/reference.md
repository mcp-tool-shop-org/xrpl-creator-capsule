---
title: CLI Reference
description: All 15 CLI commands with flags and usage.
sidebar:
  order: 4
---

All commands are invoked via `npx tsx packages/cli/src/bin.ts <command>` or as `capsule <command>` if linked.

## Wallet and minter setup

### `init-wallets`

Generate and fund an issuer + operator wallet pair.

```bash
capsule init-wallets --network testnet --fund --authorize -o wallets.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--network` | `testnet` | Network: testnet, devnet, mainnet |
| `--fund` | `false` | Fund from faucet (testnet/devnet only) |
| `--authorize` | `false` | Set operator as authorized minter |
| `-o, --output` | `wallets.json` | Output file path |

### `configure-minter`

Set the operator as an authorized minter on the issuer account.

```bash
capsule configure-minter -w wallets.json --network testnet
capsule configure-minter --via xaman --operator rAddr --network testnet
```

| Flag | Default | Description |
|------|---------|-------------|
| `-w, --wallets` | `wallets.json` | Wallet credentials file |
| `--network` | `testnet` | Network |
| `--via` | (direct) | `xaman` for wallet-mediated signing |
| `--operator` | — | Operator address (required with `--via xaman`) |
| `--allow-mainnet-write` | `false` | Required for mainnet |

## Release creation

### `create-release`

Create a release manifest from an input file.

```bash
capsule create-release -i manifest-input.json -o release.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-i, --input` | (required) | Input manifest file |
| `-o, --output` | `release.json` | Output manifest |

### `validate`

Validate a manifest against the AJV schema.

```bash
capsule validate release.json
```

### `resolve`

Check that manifest pointers (CIDs, URIs) are structurally valid.

```bash
capsule resolve release.json
```

## Minting

### `mint-release`

Mint NFT editions from a manifest and emit an issuance receipt.

```bash
capsule mint-release -m release.json -w wallets.json --network testnet -o issuance-receipt.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --manifest` | (required) | Release manifest |
| `-w, --wallets` | `wallets.json` | Wallet credentials |
| `--network` | `testnet` | Network |
| `--via` | (direct) | `xaman` for wallet-mediated signing |
| `-o, --out` | `issuance-receipt.json` | Output receipt |
| `--allow-mainnet-write` | `false` | Required for mainnet |

### `verify-release`

Reconcile manifest + receipt against live chain state.

```bash
capsule verify-release -m release.json -r issuance-receipt.json
```

## Access

### `create-access-policy`

Generate an access policy from a manifest and receipt.

```bash
capsule create-access-policy -m release.json -r issuance-receipt.json -o access-policy.json --ttl 3600
```

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --manifest` | (required) | Release manifest |
| `-r, --receipt` | (required) | Issuance receipt |
| `-o, --output` | `access-policy.json` | Output policy |
| `--ttl` | `3600` | Download token TTL in seconds |

### `grant-access`

Evaluate an access request and emit a grant receipt.

```bash
capsule grant-access -m release.json -r receipt.json -p access-policy.json -w rWalletAddress -o access-grant.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --manifest` | (required) | Release manifest |
| `-r, --receipt` | (required) | Issuance receipt |
| `-p, --policy` | (required) | Access policy |
| `-w, --wallet` | (required) | Wallet address to check |
| `-o, --out` | `access-grant.json` | Output grant receipt |

## Recovery

### `recover-release`

Reconstruct a release from artifacts and chain state.

```bash
capsule recover-release -m release.json -r issuance-receipt.json -p access-policy.json -o recovery-bundle.json
```

## Governance

### `create-governance-policy`

Create a governance policy for a release treasury.

```bash
capsule create-governance-policy -m release.json \
  --treasury rTreasuryAddr \
  --signers '[{"address":"rA","role":"artist"},{"address":"rB","role":"producer"}]' \
  --threshold 2 --assets XRP -o governance-policy.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --manifest` | (required) | Release manifest |
| `--treasury` | (required) | Treasury XRPL address |
| `--signers` | (required) | JSON array of `{address, role, label?}` |
| `--threshold` | `2` | Number of approvals required |
| `--assets` | `XRP` | Comma-separated allowed assets |
| `--allow-partial` | `false` | Allow partial payouts |
| `--max-outputs` | — | Max outputs per proposal |
| `--created-by` | `capsule-cli` | Creator identity |
| `-o, --out` | `governance-policy.json` | Output file |

### `propose-payout`

Create a payout proposal against a governance policy.

```bash
capsule propose-payout -p governance-policy.json \
  --id payout-001 \
  --outputs '[{"address":"rA","amount":"60.0","asset":"XRP","role":"artist","reason":"Creator share"}]'
```

### `decide-payout`

Collect approvals and emit a decision receipt.

```bash
capsule decide-payout -p governance-policy.json \
  --proposal payout-proposal.json \
  --approvals '[{"signerAddress":"rA","approved":true,"decidedAt":"2026-04-01T00:00:00Z"}]'
```

### `execute-payout`

Record payout execution and verify the full hash chain.

```bash
capsule execute-payout -p governance-policy.json \
  --proposal payout-proposal.json --decision payout-decision.json \
  --tx-hashes '["AABB..."]' \
  --executed-outputs '[{"address":"rA","amount":"60.0","asset":"XRP","role":"artist","reason":"Creator share"}]'
```

### `verify-payout`

Verify all 4 governance artifacts and their relationships.

```bash
capsule verify-payout -p governance-policy.json \
  --proposal payout-proposal.json --decision payout-decision.json \
  --execution payout-execution.json
```

Reports 12 checks: 4 schema validations, 4 hash integrity checks, 3 cross-contract validations, and 1 outcome check.
