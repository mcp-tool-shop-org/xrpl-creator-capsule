---
title: Security
description: Trust model, threat boundaries, and safety mechanisms.
sidebar:
  order: 6
---

## Trust model

XRPL Creator Capsule operates within a clear trust boundary.

### What the system touches

- **Local JSON files** — manifests, receipts, policies, bundles, recovery artifacts
- **XRPL via WebSocket** — `wss://` connections for minting, verification, and holder checks
- **Wallet seed phrases** — stored in local `wallets.json` (gitignored)

### What the system does NOT touch

- No external APIs beyond XRPL nodes
- No databases, cloud storage, or third-party services
- No user analytics, tracking, or telemetry of any kind

## Mainnet guard

All Mainnet writes require two explicit flags:

```bash
--network mainnet --allow-mainnet-write
```

Without both flags, any attempt to write to Mainnet is rejected. This is enforced at the CLI level and cannot be bypassed through package imports.

## Wallet credential handling

- Seed phrases are generated locally and written to `wallets.json`
- The file is gitignored by default — never committed to source control
- Seeds are only transmitted to XRPL for transaction signing
- Sanitized fixtures (addresses only, no secrets) are stored separately in `fixtures/`
- No credential is ever included in artifact output (receipts, bundles, etc.)

## Dependency pinning

The `xrpl` package is pinned at exact version **4.2.5** following a supply chain advisory. This is intentional — version ranges are not used for this dependency.

## Hash integrity

Every artifact includes a tamper-evident hash computed via:

1. Exclude the hash field itself from the object
2. Apply `sortKeysDeep()` — recursive key sorting at every nesting depth
3. `JSON.stringify()` the sorted object
4. SHA-256 hash the canonical JSON string

This means:
- Changing any field at any depth changes the hash
- The hash is deterministic — same data always produces the same hash
- Array ordering is preserved (not sorted)

A previous bug where `JSON.stringify(obj, Object.keys(obj).sort())` silently dropped nested fields was caught during Phase B failure drills and fixed across all hash functions. Regression tests cover nested field sensitivity.

## Error handling

- The CLI catches all errors at the top level and outputs message-only errors
- No raw stack traces in normal operation
- AJV validation errors provide structured field-level feedback
- XRPL connection failures are caught and reported with the network and URL
- Exit codes: 0 success, 1 failure (denial, validation failure, etc.)

## Reporting vulnerabilities

See [SECURITY.md](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/blob/main/SECURITY.md) for the full security policy, including reporting email and response timeline.
