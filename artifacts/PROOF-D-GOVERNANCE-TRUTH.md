# Phase D — Governance Truth: Proof Note

## What was proved

Release revenue can be governed through a visible, auditable approval system
with durable records. Every payout from a release treasury follows a chain:

```
GovernancePolicy → PayoutProposal → PayoutDecisionReceipt → PayoutExecutionReceipt
```

Each contract is hash-stamped and cross-referenced. Tampering with any link
in the chain is detectable.

## Hash chain

| Contract | Hash field | Verifiable by |
|----------|-----------|---------------|
| GovernancePolicy | `policyHash` | Recompute from all fields except `policyHash` |
| PayoutProposal | `proposalHash` | Recompute; `policyHash` must match policy |
| PayoutDecisionReceipt | `decisionHash` | Recompute; `proposalHash` + `policyHash` must match |
| PayoutExecutionReceipt | `executionHash` | Recompute; `decisionHash` + `proposalHash` + `policyHash` must match |

All hashes use SHA-256 over `sortKeysDeep()`-canonicalized JSON, the same
deterministic serialization used for manifest IDs and receipt hashes.

## Golden path

- **Manifest**: Direct Rail proof (`303dd8bf...08fdb4`) on XRPL Testnet
- **Treasury**: `rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX` (issuer)
- **Signers**: 2 (artist + producer), threshold 2/2
- **Proposal**: 60/40 XRP split, 2 outputs
- **Decision**: Both signers approved, threshold met
- **Execution**: 2 simulated tx hashes, outputs match proposal exactly
- **Verification**: All 12 checks pass (4 schema + 4 hash + 3 cross-contract + 1 outcome)

## Cross-contract validations

| Check | What it verifies |
|-------|-----------------|
| `checkProposalAgainstPolicy` | manifestId, network, treasury, policyHash, allowed assets, max outputs |
| `evaluateApprovals` | Signer legitimacy, deduplication, threshold computation |
| `checkDecisionAgainstProposal` | proposalHash, policyHash, signer set, approvedCount accuracy, thresholdMet |
| `checkExecutionAgainstDecision` | Decision approved, hash chain (3 hashes), identity chain (3 fields), output reconciliation |

## Failure drills (21 tests)

Every category of governance violation is caught:

- Threshold exceeds signer count
- Duplicate signer addresses
- Wrong manifestId / treasury / network / policyHash on proposal
- Disallowed asset, exceeded max outputs
- Signer not in policy
- Threshold not met (1 of 2)
- Duplicate voter deduplication
- Wrong proposalHash on decision
- Bogus approvedCount
- Claiming approved but threshold not met
- Executing unapproved proposal
- Wrong decisionHash on execution
- Wrong amount / address / network / treasury on execution
- Hash tamper detection

## Test counts

| Suite | Tests |
|-------|-------|
| Core validation (`governance-validate.test.ts`) | 38 |
| Failure drills (`governance-drills.test.ts`) | 21 |
| Golden path (`governance-golden-path.test.ts`) | 8 |
| **Phase D total** | **67** |

## Artifacts

| File | Location |
|------|----------|
| `governance-policy.json` | `artifacts/direct-rail/` + `fixtures/` |
| `payout-proposal.json` | `artifacts/direct-rail/` + `fixtures/` |
| `payout-decision.json` | `artifacts/direct-rail/` + `fixtures/` |
| `payout-execution.json` | `artifacts/direct-rail/` + `fixtures/` |

## CLI commands added

| Command | Purpose |
|---------|---------|
| `create-governance-policy` | Build policy from manifest + signer list |
| `propose-payout` | Create proposal against policy |
| `decide-payout` | Collect approvals, emit decision receipt |
| `execute-payout` | Record execution, verify full hash chain |
| `verify-payout` | Verify all 4 artifacts and their relationships |

## Scope boundary

- Governance is release-bound (per-manifestId), not platform-global
- `allowPartialPayouts` defaults to false for cleanest truth model
- Actual XRPL Payment submission is out of scope for Phase D MVP
- TX hashes in execution receipt come from real ledger submissions done externally
