---
title: "Beginners: Your First Release"
description: A step-by-step guide for creatives using Capsule Desktop to publish, protect, and verify a release on the XRP Ledger.
sidebar:
  order: 8
---

This guide is for **creators** — musicians, visual artists, producers, writers — who want to publish a release using the Capsule Desktop app. No blockchain experience required.

## What you'll end up with

By the end of this guide you'll have:

- A **real NFT on the XRP Ledger** (Testnet — no real money)
- A **verifiable manifest** — your release's cryptographic identity
- A **mint receipt** — proof of what was created on-chain
- A **recovery bundle** — self-contained proof that survives even if this app disappears

## Before you start

**You need:**

1. **Capsule Desktop** — download from [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases)
2. **A wallet credentials file** — a JSON file with funded XRPL Testnet accounts (see [Setting up testnet wallets](#setting-up-testnet-wallets) below)

**You do NOT need:**

- Any cryptocurrency or real money
- An XRPL mainnet account
- Technical blockchain knowledge
- IPFS or any storage service (placeholders work for preview)

---

## Studio Mode — the creative workflow

When you open Capsule Desktop, you're in **Studio Mode** — a guided, step-by-step flow designed for creators. Each step unlocks as you complete the previous one.

### Step 1: Describe your release

You'll see a welcome screen with two options:

- **Try the demo** — loads a sample release (Midnight Signal EP) so you can explore without your own files
- **Create a release** — starts fresh

For your first real release, click **Create a release** and fill in:

| Field | What it means |
|-------|--------------|
| **Title** | The name of your release (album, EP, single, artwork, etc.) |
| **Artist** | Your name or project name |
| **Description** | A short description of what this release is |
| **Edition size** | How many NFTs to mint (1 = one-of-one, 25 = limited edition) |

You can also attach files:

- **Cover art** — the image that represents your release
- **Main file** — the actual media (music, video, image, archive)

Files are optional during preview. Real IPFS upload comes in a future version.

### Step 2: Set collector benefits

Choose what collectors receive when they hold your NFT:

| Benefit | Good for |
|---------|----------|
| **Bonus track** | Musicians — an extra track only collectors get |
| **Stems** | Producers — individual tracks for remixing |
| **High-res artwork** | Visual artists — full resolution files |
| **Private note** | Anyone — a personal message to collectors |
| **Custom** | Anything else you want to offer |

Write a description of the benefit. This is what collectors see when they access your release.

### Step 3: Review everything

Before publishing, review:

- **Release summary** — title, artist, editions, files
- **Collector benefit** — what collectors receive
- **Ownership terms** — license type, resale royalty percentage
- **Safety** — what collectors own vs. don't own, recovery promise

You can change the license type and royalty percentage on this screen.

### Step 4: Publish

The readiness checklist shows what's ready (green), optional (amber), and missing.

When you click **Publish Release**:

1. You'll be asked for your **wallet credentials file** (if not already loaded)
2. You choose where to save the **manifest file** (your release's canonical identity)
3. You choose where to save the **receipt file** (proof of what was minted)
4. The app mints your NFTs on XRPL Testnet

This typically takes 10–30 seconds. Don't close the app during minting.

**If it times out:** Click **Check Status** to see if the receipt was actually created. The transaction may have succeeded even if the app lost connection briefly.

### Step 5: Test collector access

After publishing, test what collectors experience:

- Enter a wallet address and click **Test as Collector** to see if they'd get access
- Click **Test as Non-Collector** to see the denial flow

This uses real XRPL token ownership checks.

### Step 6: Generate a recovery bundle

A recovery bundle is a self-contained proof file that:

- Proves you created this release
- Contains all transaction hashes and token IDs
- Verifies consistency between your manifest and the chain
- Works even if this app stops existing

Click **Generate Recovery Bundle** and save it somewhere safe.

---

## Setting up testnet wallets

Capsule needs a wallet credentials file to mint on XRPL Testnet. This is a JSON file with two funded testnet accounts.

### Option A: Using the Capsule CLI

If you have Node.js installed:

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install && npm run build
npx tsx packages/cli/src/bin.ts init-wallets \
  --network testnet --fund --authorize -o wallets.json
```

### Option B: Manual setup

1. Go to the [XRPL Testnet Faucet](https://faucet.altnet.rippletest.net/accounts)
2. Click "Generate Credentials" twice (you need two accounts: issuer and operator)
3. Create a JSON file called `wallets.json`:

```json
{
  "issuer": {
    "classicAddress": "rISSUER_ADDRESS_HERE",
    "seed": "sISSUER_SEED_HERE"
  },
  "operator": {
    "classicAddress": "rOPERATOR_ADDRESS_HERE",
    "seed": "sOPERATOR_SEED_HERE"
  }
}
```

4. Save it somewhere you'll remember — the app will ask for this file when you publish.

**Important:** This file contains private keys. Keep it secure. For mainnet (future), you'll use Xaman QR signing instead — no seed files needed.

---

## Understanding what you just created

After publishing, you have four artifacts:

| Artifact | What it is | Why it matters |
|----------|-----------|----------------|
| **Manifest** | A JSON file with your release's identity, hashes, and metadata | This is the canonical truth about your release — deterministic and tamper-evident |
| **Receipt** | A JSON file with token IDs and transaction hashes | Proves exactly what was minted on-chain |
| **On-chain NFTs** | Real tokens on the XRP Ledger (Testnet) | Collectors hold these to unlock access |
| **Recovery bundle** | A self-contained verification package | Proves your release exists even without this app |

Every claim the app makes is backed by cryptographic proof. The manifest hash is deterministic — the same inputs always produce the same identity. The receipt contains transaction hashes you can look up on any XRPL explorer.

---

## Advanced Mode

You don't need Advanced Mode to publish a release. It's the proof and audit layer — showing every artifact the engine produces:

| Panel | What it shows |
|-------|--------------|
| **Manifest** | The canonical release identity — schema, hashes, pointers |
| **Mint** | Issuance receipt — token IDs, TX hashes, chain proof |
| **Verify** | Reconciliation — manifest vs. receipt vs. chain |
| **Access** | Policies and grant decisions — who can access what |
| **Recovery** | Bundle generation and consistency verification |
| **Governance** | Payout policies, proposals, decisions, execution chain |

Switch between Studio and Advanced using the button in the title bar. Both modes share the same release context — nothing is lost when you switch.

---

## Troubleshooting

### The app restarted and my draft is gone

Capsule autosaves your draft every 2 seconds. If it didn't restore:
- Check if the session file exists in your app data directory
- Your draft may have been empty when the app closed

### Publish timed out

This doesn't mean it failed. Click **Check Status** to look for the receipt file. If it has token IDs, your release was published successfully.

### Access test says "denied" for a collector

The access check verifies on-chain token ownership. If the wallet doesn't hold one of the minted NFTs, access is denied. This is correct behavior — the token hasn't been transferred to that wallet yet.

### I see "Preview" in the title bar

This is intentional. Capsule Desktop is in public preview on XRPL Testnet. The badge is a reminder that this is not a mainnet production tool yet.

---

## Reporting problems

Click the **Report** button in the title bar to export a support bundle. This packages your action history, session state, and environment info. It does **not** include wallet keys, file contents, or personal information.

Attach the bundle to your [GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

---

## What's next

This preview focuses on the core release workflow. Coming soon:

- **Xaman QR signing** — sign transactions with your phone, no seed files
- **IPFS upload** — real content-addressed storage instead of file path placeholders
- **Mainnet support** — publish on the real XRP Ledger

Your feedback during preview directly shapes these features. The most valuable thing you can tell us is where you got stuck, confused, or lost trust in what the app was doing.
