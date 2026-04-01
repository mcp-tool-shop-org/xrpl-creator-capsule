---
title: Release Lifecycle
description: Create, mint, verify, and govern a release from start to finish.
sidebar:
  order: 3
---

A creator capsule follows a clear lifecycle: define intent, mint on-chain, verify, gate access, and govern revenue. Each step produces a hash-stamped artifact that links back to the previous.

## Step 1: Create a manifest

Write a manifest input file describing your release:

```json
{
  "title": "First Light",
  "artist": "Signal",
  "format": "single",
  "issuerAddress": "rYourIssuerAddress...",
  "operatorAddress": "rYourOperatorAddress...",
  "editions": 10,
  "transferFee": 500,
  "benefit": {
    "kind": "bonus-track",
    "contentPointer": "bafyExampleCID..."
  },
  "pointers": {
    "metadataUri": "ipfs://bafyMetadata...",
    "licenseUri": "ipfs://bafyLicense...",
    "coverCid": "bafyCover...",
    "mediaCid": "bafyMedia..."
  }
}
```

Then create the release:

```bash
capsule create-release -i manifest-input.json -o release.json
```

This computes the **manifestId** (SHA-256 of the canonical manifest) and **revisionHash** (SHA-256 of the full content). These are deterministic — the same input always produces the same IDs.

## Step 2: Mint on XRPL

```bash
capsule mint-release -m release.json -w wallets.json --network testnet
```

The operator mints NFT editions on behalf of the issuer using the XRPL authorized minter pattern. Each edition gets a unique `nftTokenId` on the ledger. The command emits an **issuance receipt** that records every token ID and transaction hash.

## Step 3: Verify against the chain

```bash
capsule verify-release -m release.json -r issuance-receipt.json
```

Verification reconciles the manifest and receipt against live chain state:
- Manifest identity matches receipt
- Transfer fee matches
- Authorized minter relationship exists
- NFT token IDs exist on the ledger
- Metadata URI matches

Every check produces a PASS/FAIL line. If any check fails, the receipt is unreliable.

## Step 4: Gate access

Create an access policy that binds a benefit to NFT ownership:

```bash
capsule create-access-policy -m release.json -r issuance-receipt.json
```

Then evaluate access for a specific wallet:

```bash
capsule grant-access -m release.json -r receipt.json -p access-policy.json -w rWalletAddress
```

The system checks on-chain ownership, verifies artifact integrity, and emits a stamped grant receipt with an allow/deny decision and exact reason.

## Step 5: Govern revenue

Set up a governance policy with signers and a threshold:

```bash
capsule create-governance-policy -m release.json \
  --treasury rTreasuryAddress \
  --signers '[{"address":"rSignerA","role":"artist"},{"address":"rSignerB","role":"producer"}]' \
  --threshold 2
```

Then propose, approve, and execute payouts:

```bash
capsule propose-payout --policy governance-policy.json \
  --id payout-001 --outputs '[{"address":"rSignerA","amount":"60.0","asset":"XRP","role":"artist","reason":"Creator share"}]'

capsule decide-payout --policy governance-policy.json \
  --proposal payout-proposal.json \
  --approvals '[{"signerAddress":"rSignerA","approved":true,"decidedAt":"..."},{"signerAddress":"rSignerB","approved":true,"decidedAt":"..."}]'

capsule execute-payout --policy governance-policy.json \
  --proposal payout-proposal.json --decision payout-decision.json \
  --tx-hashes '["AABB..."]' --executed-outputs '[...]'
```

Verify the entire governance chain:

```bash
capsule verify-payout --policy governance-policy.json \
  --proposal payout-proposal.json --decision payout-decision.json \
  --execution payout-execution.json
```

## Step 6: Recover (if needed)

If the original app disappears, reconstruct the release:

```bash
capsule recover-release -m release.json -r issuance-receipt.json -p access-policy.json
```

The recovery bundle contains every pointer needed to find the content, verify ownership, and understand the release — without any app state.
