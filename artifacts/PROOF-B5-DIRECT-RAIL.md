# Phase B5 — Direct Rail Proof Note

## Manifest

- **Title:** Midnight Frequency
- **Artist:** Vex Morrow
- **Edition size:** 1
- **Transfer fee:** 5%
- **Manifest ID:** `303dd8bf6f0afe7aa06e48c1fff3f64b97b39e770c8895197c4b0f6f0208fdb4`

## Rail

Direct signing (operator wallet signs NFTokenMint via xrpl.js `submitAndWait`).

## Authorized Minter

Configured correctly. Issuer `rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX` set `NFTokenMinter` to operator `rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh` via AccountSet with `SetFlag: asfAuthorizedNFTokenMinter`.

Verified on-chain: `verifyAuthorizedMinter()` confirms `NFTokenMinter` field matches expected operator.

## Mint Result

- **NFT Token ID:** `000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D96`
- **Mint Tx Hash:** `07459A93BFA5817727416FE969F6A4F17E0A9064E37690174DF01E8DC505B698`
- **Network:** Testnet
- **NFT held by:** Operator account (authorized minter pattern)

## Receipt Reconciliation

Full 16/16 verify-release checks passed:

| Check | Result |
|-------|--------|
| manifest-id-match | PASS |
| revision-hash-match | PASS |
| receipt-integrity | PASS |
| issuer-match | PASS |
| operator-match | PASS |
| transfer-fee-match | PASS |
| edition-count | PASS |
| metadata-pointer | PASS |
| license-pointer | PASS |
| cover-cid | PASS |
| media-cid | PASS |
| chain-minter-status | PASS |
| chain-nft-exists | PASS |
| chain-nft-uri | PASS |
| chain-nft-issuer | PASS |
| chain-nft-transfer-fee | PASS |

## Failure Drills

10/10 deliberate mismatches caught with exact failure reasons:

1. Wrong signer (issuer mismatch) — `issuer-match` fails
2. Tampered receipt (modified token ID) — `receipt-integrity` fails
3. Manifest changed after issuance — `manifest-id-match` + `revision-hash-match` fail
4. Transfer fee mismatch — `transfer-fee-match` fails
5. Metadata pointer mismatch — `metadata-pointer` fails
6. Edition count mismatch — `edition-count` fails
7. Operator mismatch — `operator-match` fails
8. License URI mismatch — `license-pointer` fails
9. Cover CID mismatch — `cover-cid` fails
10. Media CID mismatch — `media-cid` fails

## Bugs Found and Fixed During Proof

1. **AccountSet missing SetFlag** — `NFTokenMinter` field not persisting despite tesSUCCESS. Root cause: must include `SetFlag: AccountSetAsfFlags.asfAuthorizedNFTokenMinter` (value 10). Fixed in `wallet.ts` and `payloads.ts`.

2. **NFT lookup on wrong account** — verify-release searched issuer account, but NFTs minted by authorized minter are held by operator. Fixed to check operator first, fall back to issuer.

3. **verify-minter ledger timing** — After submitAndWait, a new client connection querying `"validated"` might hit an earlier ledger. Fixed with fallback from `"validated"` to `"current"`.

4. **computeReceiptHash array-replacer bug** — Same bug previously fixed in `computeRevisionHash`: `JSON.stringify(obj, keysArray)` only includes array-listed keys at ALL nesting depths, silently dropping nested fields like `xrpl.nftTokenIds`. Fixed by using `sortKeysDeep()` recursive serializer.

## Boundary Drift / Adapter Leakage

None. Receipt is a pure data contract — no xrpl.js types leak into the canonical objects. Storage is interface-bounded (mock provider used). CLI commands compose packages without cross-boundary coupling.

## Verdict

Direct rail golden path: **PROVEN**. Full chain from manifest intent through ledger truth to verifiable receipt works end-to-end on Testnet. Failure cases produce exact mismatch reasons, not silent passes.
