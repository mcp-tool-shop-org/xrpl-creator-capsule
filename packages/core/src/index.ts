export type {
  ReleaseManifest,
  CollectorBenefit,
  PayoutPolicy,
  LicenseTerms,
} from "./manifest.js";

export { releaseManifestSchema } from "./schema.js";
export { validateManifest, assertManifest } from "./validate.js";
export type { ValidationResult } from "./validate.js";

export { computeManifestId, computeRevisionHash, stampManifestId } from "./hash.js";

export {
  resolveManifestPointers,
} from "./resolve.js";
export type { ResolutionResult, ResolutionCheck } from "./resolve.js";

export type { IssuanceReceipt, Sha256Hex, XrplAddress } from "./receipt.js";
export { issuanceReceiptSchema } from "./receipt-schema.js";
export {
  validateReceipt,
  assertReceipt,
  computeReceiptHash,
  stampReceiptHash,
} from "./receipt-validate.js";

export type { AccessPolicy } from "./access-policy.js";
export { accessPolicySchema } from "./access-policy-schema.js";
export {
  validateAccessPolicy,
  assertAccessPolicy,
  checkPolicyCoherence,
} from "./access-policy-validate.js";
export type { PolicyCoherenceResult } from "./access-policy-validate.js";

export type { AccessGrantReceipt } from "./access-grant.js";
export { accessGrantReceiptSchema } from "./access-grant-schema.js";
export {
  validateAccessGrant,
  assertAccessGrant,
  computeGrantHash,
  stampGrantHash,
} from "./access-grant-validate.js";

export type { RecoveryBundle } from "./recovery-bundle.js";
export { recoveryBundleSchema } from "./recovery-bundle-schema.js";
export {
  validateRecoveryBundle,
  assertRecoveryBundle,
  computeBundleHash,
  stampBundleHash,
  deriveRecoveryBundle,
  verifyBundleConsistency,
} from "./recovery-bundle-validate.js";
export type { BundleVerificationResult } from "./recovery-bundle-validate.js";

// ── Governance ──────────────────────────────────────────────────────

export type { GovernancePolicy, GovernanceSigner, SignerRole } from "./governance-policy.js";
export { governancePolicySchema } from "./governance-policy-schema.js";

export type { PayoutProposal, PayoutOutput } from "./payout-proposal.js";
export { payoutProposalSchema } from "./payout-proposal-schema.js";

export type { PayoutDecisionReceipt, GovernanceApproval } from "./payout-decision.js";
export { payoutDecisionReceiptSchema } from "./payout-decision-schema.js";

export type { PayoutExecutionReceipt, ExecutedPayoutOutput } from "./payout-execution.js";
export { payoutExecutionReceiptSchema } from "./payout-execution-schema.js";

export {
  validateGovernancePolicy,
  validatePayoutProposal,
  validatePayoutDecision,
  validatePayoutExecution,
  assertGovernancePolicy,
  assertPayoutProposal,
  assertPayoutDecision,
  assertPayoutExecution,
  computePolicyHash,
  stampPolicyHash,
  computeProposalHash,
  stampProposalHash,
  computeDecisionHash,
  stampDecisionHash,
  computeExecutionHash,
  stampExecutionHash,
  checkProposalAgainstPolicy,
  evaluateApprovals,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
} from "./governance-validate.js";
export type { GovernanceCheckResult } from "./governance-validate.js";
