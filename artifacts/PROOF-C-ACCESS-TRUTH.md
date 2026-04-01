# Phase C — Access Truth Proof Note

## What was proven

Ownership on XRPL can unlock real off-chain access in a durable, verifiable way.

## Canonical objects added

- **AccessPolicy** — binds a benefit to a minted release via manifestId, with ownership rules evaluated against XRPL ledger state
- **AccessGrantReceipt** — auditable record of every access decision (allow or deny), with tamper-evident hash

## Benefit tested

- **Kind:** stems (full stem pack for personal remixing)
- **Content pointer:** `QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB`
- **Delivery:** time-limited download token (3600s TTL)

## Golden path

Using the live direct-rail minted fixture from Phase B5:

| Step | Result |
|------|--------|
| Create access policy from manifest + receipt | Policy generated with qualifying token IDs from receipt |
| Grant access — holder wallet (operator) | ACCESS GRANTED, delivery token issued |
| Grant access — non-holder wallet (issuer) | ACCESS DENIED, exact reason emitted |
| Both decisions produce tamper-evident receipts | grantHash present and self-consistent |

### Holder path
- **Subject:** `rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh` (operator, holds the minted NFT)
- **Decision:** allow
- **Matched tokens:** 1 (`000813881524A73...`)
- **Delivery token:** `tok_ff6a7796f786eb4e6ab62380cdd4637c`

### Non-holder path
- **Subject:** `rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX` (issuer, does not hold the NFT)
- **Decision:** deny
- **Reason:** "Wallet does not hold any qualifying NFT for this release"

## Deny truth — failure cases tested (unit tests)

All 10 deny scenarios produce exact mismatch reasons:

1. Wallet does not hold qualifying NFT
2. XRPL query fails (connection timeout)
3. Policy references wrong manifest
4. Policy benefit kind does not match manifest
5. Issuance receipt tampered
6. Manifest changed after issuance
7. Policy references tokens not in receipt
8. Account not found on ledger
9. Policy coherence: wrong issuerAddress
10. Policy coherence: wrong contentPointer

## Test counts

| Package | Tests |
|---------|-------|
| @capsule/core | 72 (was 41) |
| @capsule/cli | 22 (was 12) |
| @capsule/storage | 13 (was 8) |
| @capsule/xaman | 18 |
| @capsule/xrpl | 10 |
| **Total** | **135** |

## Contracts added

| Contract | Package | File |
|----------|---------|------|
| AccessPolicy type | core | `access-policy.ts` |
| AccessPolicy schema | core | `access-policy-schema.ts` |
| AccessPolicy validation + coherence | core | `access-policy-validate.ts` |
| AccessGrantReceipt type | core | `access-grant.ts` |
| AccessGrantReceipt schema | core | `access-grant-schema.ts` |
| AccessGrantReceipt validation + hash | core | `access-grant-validate.ts` |
| checkHolder | xrpl | `check-holder.ts` |
| DeliveryProvider + MockDeliveryProvider | storage | `delivery.ts` |
| grantAccess orchestrator | cli | `grant-access.ts` |
| CLI commands: create-access-policy, grant-access | cli | `bin.ts` |

## Boundary check

- No Xaman or wallet-specific details leak into access contracts
- No xrpl.js types leak into canonical objects
- Storage delivery is interface-bounded (mock provider used, real provider swappable)
- Policy coherence checks bind to canonical release identity, not implementation details

## Verdict

Phase C — Access Truth: **PROVEN**. Ownership on XRPL unlocks real off-chain benefits for holders, denies non-holders with exact reasons, and every decision is auditable via tamper-evident receipts.
