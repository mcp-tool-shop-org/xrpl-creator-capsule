---
title: Contract Reference
description: Every canonical contract type with fields and validation rules.
sidebar:
  order: 5
---

## ReleaseManifest

The creator's intent — what the release is, who owns it, what it contains.

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `"1.0.0"` | Schema version |
| `title` | `string` | Release title |
| `artist` | `string` | Creator name |
| `format` | `string` | Release format (single, album, etc.) |
| `issuerAddress` | `string` | XRPL issuer address |
| `operatorAddress` | `string` | Authorized minter address |
| `editions` | `number` | Number of NFT editions to mint |
| `transferFee` | `number` | Royalty fee (0–50000, basis points) |
| `benefit` | `object` | Collector benefit (kind + contentPointer) |
| `pointers` | `object` | Content pointers (metadataUri, licenseUri, coverCid, mediaCid) |

**Identity**: `manifestId` = SHA-256 of `{title, artist, format, issuerAddress, operatorAddress}` sorted.
**Revision**: `revisionHash` = SHA-256 of full manifest (sortKeysDeep).

## IssuanceReceipt

Execution truth — what was actually minted on the ledger.

| Field | Type | Description |
|-------|------|-------------|
| `manifestId` | `string` | Links to manifest |
| `manifestRevisionHash` | `string` | Specific revision minted |
| `xrpl.nftTokenIds` | `string[]` | Token IDs on ledger |
| `xrpl.txHashes` | `string[]` | Transaction hashes |
| `xrpl.network` | `string` | Network used |
| `receiptHash` | `string` | Tamper-evident stamp |

## GovernancePolicy

Who can approve payouts and under what rules.

| Field | Type | Description |
|-------|------|-------------|
| `manifestId` | `string` | Release this policy governs |
| `network` | `string` | Network the treasury lives on |
| `treasuryAddress` | `string` | Treasury XRPL account |
| `signerPolicy.signers` | `GovernanceSigner[]` | Authorized signers |
| `signerPolicy.threshold` | `number` | Approvals needed |
| `payoutPolicy.allowedAssets` | `string[]` | Permitted payout assets |
| `payoutPolicy.allowPartialPayouts` | `boolean` | Partial execution (default: false) |
| `policyHash` | `string` | Tamper-evident stamp |

**Validation rules:**
- Threshold must not exceed signer count
- Signer addresses must be unique
- At least one signer required

## PayoutProposal

A proposed revenue distribution.

| Field | Type | Description |
|-------|------|-------------|
| `manifestId` | `string` | Release identity |
| `policyHash` | `string` | Links to governance policy |
| `proposalId` | `string` | Unique proposal identifier |
| `outputs` | `PayoutOutput[]` | Recipient addresses, amounts, roles |
| `proposalHash` | `string` | Tamper-evident stamp |

**Cross-contract checks (vs policy):**
- manifestId, network, treasury must match
- policyHash must match current policy
- All output assets must be in allowedAssets
- Output count must not exceed maxOutputsPerProposal

## PayoutDecisionReceipt

Signer approvals and the resulting decision.

| Field | Type | Description |
|-------|------|-------------|
| `proposalHash` | `string` | Links to proposal |
| `policyHash` | `string` | Links to policy |
| `approvals` | `GovernanceApproval[]` | Per-signer votes |
| `decision.outcome` | `"approved" \| "rejected"` | Result |
| `decision.thresholdMet` | `boolean` | Whether threshold was reached |
| `decisionHash` | `string` | Tamper-evident stamp |

**Cross-contract checks (vs proposal + policy):**
- proposalHash must match
- All signers must be in policy signer list
- approvedCount must match actual approval count
- thresholdMet must accurately reflect threshold vs approvals

## PayoutExecutionReceipt

Ledger-backed proof of payout execution.

| Field | Type | Description |
|-------|------|-------------|
| `decisionHash` | `string` | Links to decision |
| `proposalHash` | `string` | Links to proposal |
| `policyHash` | `string` | Links to policy |
| `xrpl.txHashes` | `string[]` | Payment transaction hashes |
| `executedOutputs` | `ExecutedPayoutOutput[]` | What was actually paid |
| `executionHash` | `string` | Tamper-evident stamp |

**Cross-contract checks (vs decision + proposal + policy):**
- Decision must be "approved"
- Hash chain: decisionHash, proposalHash, policyHash all match
- Identity chain: manifestId, network, treasuryAddress all match
- Output reconciliation: address, amount, asset must match proposal
