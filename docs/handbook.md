# XRPL Creator Capsule — Handbook

Your first release in 10 minutes.

---

## What is Capsule?

Capsule is a desktop app for creators who want to publish, protect, and verify their creative releases on the XRPL blockchain.

Each release becomes:
- **An on-chain token** — a real NFT on the XRP Ledger
- **A verifiable artifact** — cryptographically signed and tamper-detectable
- **A recoverable proof** — survives even if this app disappears

This is a **public preview** focused on XRPL Testnet. No real money is involved.

---

## Before you start

You need:

1. **Capsule Desktop** — download from [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases)
2. **A wallet credentials file** — JSON file with funded XRPL Testnet accounts (see [Setting up testnet wallets](#setting-up-testnet-wallets) below)

You do NOT need:
- Any cryptocurrency
- An XRPL mainnet account
- Technical blockchain knowledge
- IPFS or any storage service (placeholders work for preview)

---

## Your first release (Studio Mode)

### Step 1: Describe your release

Open Capsule. You'll see a welcome screen with two options:

- **Try the demo** — loads a sample release so you can explore without your own files
- **Create a release** — starts fresh

For your first real release, click "Create a release" and fill in:

| Field | What it means |
|-------|--------------|
| Title | The name of your release (album, EP, single, artwork, etc.) |
| Artist | Your name or project name |
| Description | A short description of what this release is |
| Edition size | How many NFTs to mint (1 = unique, 25 = limited edition) |

You can also attach files:
- **Cover art** — the image that represents your release
- **Main file** — the actual media (music, video, image, archive)

Files are optional for preview. Real IPFS upload comes in a future version.

### Step 2: Set collector benefits

Choose what collectors receive when they hold your NFT:

| Benefit | Good for |
|---------|----------|
| Bonus track | Musicians — an extra track only collectors get |
| Stems | Producers — individual tracks for remixing |
| High-res artwork | Visual artists — full resolution files |
| Private note | Anyone — a personal message to collectors |
| Custom | Anything else you want to offer |

Write a description of the benefit. This is what collectors see when they access your release.

### Step 3: Review

Check everything before publishing:

- **Release summary** — title, artist, editions, files
- **Collector benefit** — what collectors receive
- **Ownership terms** — license type, resale royalty percentage
- **Safety** — what collectors own vs. don't own, recovery promise

You can change the license type and royalty percentage here.

### Step 4: Publish

The readiness checklist shows what's ready (green), optional (amber), and missing.

When you click "Publish Release":

1. You'll be asked for your **wallet credentials file** (if not already loaded)
2. You choose where to save the **manifest file** (your release's canonical identity)
3. You choose where to save the **receipt file** (proof of what was minted)
4. The app mints your NFTs on XRPL Testnet

This typically takes 10-30 seconds. Don't close the app during minting.

**If it times out:** Click "Check Status" to see if the receipt was actually created. The transaction may have succeeded even if the app lost connection briefly.

### Step 5: Test collector access

After publishing, test what collectors experience:

- Enter a wallet address and click "Test as Collector" to see if they'd get access
- Click "Test as Non-Collector" to see the denial flow

This uses real XRPL token ownership checks.

### Step 6: Generate a recovery bundle

A recovery bundle is a self-contained proof file that:

- Proves you created this release
- Contains all transaction hashes and token IDs
- Verifies consistency between your manifest and the chain
- Works even if this app stops existing

Click "Generate Recovery Bundle" and save it somewhere safe.

---

## Setting up testnet wallets

Capsule needs a wallet credentials file to mint on XRPL Testnet. This is a JSON file with two funded testnet accounts.

### Using the Capsule CLI

If you have the `@capsule/xrpl` package:

```bash
npx capsule-wallets generate --network testnet --output wallets.json
```

### Manual setup

1. Go to the [XRPL Testnet Faucet](https://faucet.altnet.rippletest.net/accounts)
2. Generate two accounts (issuer and operator)
3. Create a JSON file like this:

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

**Important:** Keep this file secure. It contains private keys for your testnet accounts. For mainnet (future), you'll use Xaman QR signing instead — no seed files needed.

---

## Advanced Mode

Advanced Mode shows every proof artifact the engine produces:

| Panel | What it shows |
|-------|--------------|
| Manifest | The canonical release identity — schema, hashes, pointers |
| Mint | Issuance receipt — token IDs, TX hashes, chain proof |
| Verify | Reconciliation — manifest vs. receipt vs. chain |
| Access | Policies and grant decisions — who can access what |
| Recovery | Bundle generation and consistency verification |
| Governance | Payout policies, proposals, decisions, execution chain |

You don't need Advanced Mode to publish a release. It's there for:
- **Verification** — confirm every hash and proof
- **Auditing** — inspect the full artifact chain
- **Governance** — manage multi-party payout policies

Switch between Studio and Advanced using the button in the title bar. Both modes share the same release context — nothing is lost when you switch.

---

## Troubleshooting

### The app restarted and my draft is gone

Capsule autosaves your draft every 2 seconds. If it didn't restore:
- Check if the session file exists in your app data directory
- Your draft may have been empty when the app closed

### Publish timed out

This doesn't mean it failed. Click "Check Status" to look for the receipt file. If it has token IDs, your release was published successfully.

### Access test says "denied" for a collector

The access check verifies on-chain token ownership. If the wallet doesn't hold one of the minted NFTs, access is denied. This is correct behavior — it means the token hasn't been transferred to that wallet.

### I see "Preview" in the title bar

This is intentional. Capsule Desktop is in public preview, focused on XRPL Testnet. The Preview badge is a reminder that this is not a mainnet production tool yet.

---

## Reporting problems

Click the **Report** button in the title bar to export a support bundle. This packages:
- Your action history (what you did, when, what happened)
- Session state (which step you're on, what artifacts exist)
- App version and environment info

It does NOT include:
- Wallet private keys or seeds
- File contents
- Personal information

Attach the support bundle to your [GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

---

## What's next

This preview focuses on the core release workflow. Coming soon:

- **Xaman QR signing** — sign transactions with your phone, no seed files
- **IPFS upload** — replace file path placeholders with real content-addressed storage
- **Mainnet support** — publish on the real XRP Ledger
- **Draft auto-recovery** — more resilient session persistence

Your feedback during preview directly shapes these features. The most valuable thing you can tell us is where you got stuck, confused, or lost trust in what the app was doing.
