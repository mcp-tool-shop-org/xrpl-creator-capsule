# Phase E — Durability Truth Proof Note

## What was proven

A minted XRPL release can survive frontend death and still be: identifiable, verifiable, understandable, recoverable, and usable for holder access — using only canonical artifacts plus chain state.

## Canonical object added

- **RecoveryBundle** — a derived reconstruction map that points to all existing truths (manifest, receipt, policy). Not a new source of truth. Contains: release identity, provenance, mint facts, durable pointers, license terms, benefit summary, recovery instructions, and a tamper-evident bundleHash.

## Golden path — Live Testnet

### Recovery reconstruction (8/8 sections PASS)

| Section | Result |
|---------|--------|
| Release Identity | PASS — Manifest ID matches issuance receipt |
| Issuance Receipt | PASS — Receipt integrity valid (untampered) |
| Mint Facts | PASS — 1 token, 1 tx hash, 5000bp transfer fee |
| Durable Pointers | PASS — metadata, license, cover CID, media CID |
| License Terms | PASS — Custom license, full text URI resolvable |
| Collector Benefit | PASS — stems pack, content pointer, access policy |
| Chain Verification | PASS — Authorized minter confirmed, NFT found on ledger |
| Recovery Instructions | PASS — Step-by-step ownership and access guide |

### Death drill — access replay from recovery artifacts

| Test | Result |
|------|--------|
| Holder wallet (operator) | ACCESS GRANTED — delivery token issued |
| Non-holder wallet (issuer) | ACCESS DENIED — exact reason emitted |

## What the recovery proves

A person holding only these files can reconstruct everything:

1. **What the release is** — title, artist, edition size
2. **Who issued it** — issuer address, operator address, authorized minter confirmed on-chain
3. **What was minted** — token ID, tx hash, transfer fee
4. **What it unlocks** — stems pack, content pointer, access policy
5. **Where durable references live** — metadata URI, license URI, cover CID, media CID
6. **How to verify ownership** — query XRPL for token IDs, check wallet holdings
7. **How to access the benefit** — prove NFT ownership, receive delivery token
8. **License terms** — readable without app, full text URI included

## Failure cases tested (unit tests)

| Scenario | Detection |
|----------|-----------|
| Modified manifest (identity mismatch) | Release Identity section fails |
| Tampered receipt | Issuance Receipt section fails |
| NFT missing from chain | Chain Verification section fails |
| Chain connectivity failure | Chain Verification section fails with error detail |
| Tampered recovery bundle | Bundle integrity check fails |
| Token IDs mismatch | Token-ids check fails |
| Pointer mismatch (media, cover, metadata, license) | Respective pointer check fails |
| Manifest modified after bundle creation | manifest-id + title checks fail |
| Receipt tampered after bundle creation | receipt-hash check fails |

## Test counts

| Package | Tests |
|---------|-------|
| @capsule/core | 92 (was 72) |
| @capsule/cli | 30 (was 22) |
| @capsule/storage | 13 |
| @capsule/xaman | 18 |
| @capsule/xrpl | 10 |
| **Total** | **163** |

## Contracts added

| Contract | Package | File |
|----------|---------|------|
| RecoveryBundle type | core | `recovery-bundle.ts` |
| RecoveryBundle schema | core | `recovery-bundle-schema.ts` |
| RecoveryBundle validation + derivation + consistency | core | `recovery-bundle-validate.ts` |
| recoverRelease orchestrator | cli | `recover-release.ts` |
| CLI command: recover-release | cli | `bin.ts` |

## No hidden dependencies

The recovery flow uses:
- Canonical artifacts (manifest, receipt, policy) — files on disk
- XRPL ledger reads — any node, any client
- CID pointers — any IPFS gateway
- URI pointers — any HTTP client

No app session state, no database, no authentication token, no API key.

## Verdict

Phase E — Durability Truth: **PROVEN**. The release survives platform death. A collector or operator can reconstruct, verify, and access the release using only saved artifacts and the public XRPL ledger.
