/**
 * Engine Bridge — typed frontend wrappers for Tauri invoke commands.
 *
 * Every function here calls the real @capsule/core and @capsule/xrpl
 * through the bridge-worker.ts process. No engine logic lives in React.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Result types (mirrors engine output shapes) ─────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ResolutionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ResolutionResult {
  checks: ResolutionCheck[];
  passed: boolean;
}

export interface StampResult {
  manifest: ReleaseManifest;
  manifestId: string;
  revisionHash: string;
}

export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyResult {
  passed: boolean;
  checks: VerifyCheck[];
}

export interface HolderCheckResult {
  holds: boolean;
  matchedTokenIds: string[];
  totalNftsChecked: number;
  walletAddress: string;
  error?: string;
}

export interface BundleVerificationResult {
  valid: boolean;
  checks: VerifyCheck[];
}

// ── Artifact types (display-side mirrors of canonical shapes) ───────

export interface ReleaseManifest {
  schemaVersion: string;
  title: string;
  artist: string;
  editionSize: number;
  coverCid: string;
  mediaCid: string;
  metadataEndpoint: string;
  license: {
    type: string;
    summary: string;
    uri: string;
  };
  benefit: {
    kind: string;
    description: string;
    contentPointer: string;
  };
  priceDrops: string;
  transferFeePercent: number;
  payoutPolicy: {
    treasuryAddress: string;
    multiSig: boolean;
    terms: string;
  };
  issuerAddress: string;
  operatorAddress: string;
  createdAt: string;
  id?: string;
}

export interface IssuanceReceipt {
  manifestId: string;
  manifestRevisionHash: string;
  receiptHash?: string;
  issuerAddress: string;
  operatorAddress: string;
  network: string;
  issuedAt: string;
  xrpl: {
    nftTokenIds: string[];
    mintTxHashes: string[];
    transferFee: number;
    tokenTaxon: number;
  };
  pointers: {
    metadataUri: string;
    licenseUri: string;
    coverCid: string;
    mediaCid: string;
  };
  storageProvider?: string;
}

export interface AccessPolicy {
  schemaVersion: string;
  kind: string;
  manifestId: string;
  label: string;
  benefit: {
    kind: string;
    contentPointer: string;
  };
  rule: {
    type: string;
    issuerAddress: string;
    qualifyingTokenIds: string[];
  };
  delivery: {
    mode: string;
    ttlSeconds: number;
  };
  createdAt: string;
}

export interface AccessGrantReceipt {
  schemaVersion: string;
  kind: string;
  manifestId: string;
  policyLabel: string;
  subjectAddress: string;
  network: string;
  decision: "allow" | "deny";
  reason: string;
  benefit: {
    kind: string;
    contentPointer: string;
  };
  ownership: {
    matchedTokenIds: string[];
    totalNftsChecked: number;
  };
  delivery?: {
    mode: string;
    token: string;
    expiresAt: string;
  };
  decidedAt: string;
  grantHash?: string;
}

export interface RecoveryBundle {
  schemaVersion: string;
  kind: string;
  manifestId: string;
  revisionHash: string;
  receiptHash: string;
  title: string;
  artist: string;
  editionSize: number;
  network: string;
  issuerAddress: string;
  operatorAddress: string;
  tokenIds: string[];
  txHashes: string[];
  transferFee: number;
  metadataUri: string;
  licenseUri: string;
  coverCid: string;
  mediaCid: string;
  licenseType: string;
  licenseSummary: string;
  benefit: {
    kind: string;
    description: string;
    contentPointer: string;
  };
  generatedAt: string;
  recoveryVersion: string;
  instructions: string[];
  accessPolicyLabel?: string;
  qualifyingTokenIds?: string[];
  bundleHash?: string;
}

export interface RecoverResult {
  bundle: RecoveryBundle;
  verification: BundleVerificationResult;
  chainChecks: VerifyCheck[];
  allPassed: boolean;
}

// ── File operations (direct Rust, no Node.js) ───────────────────────

export async function loadFile(path: string): Promise<string> {
  return invoke<string>("load_file", { path });
}

export async function saveFile(path: string, content: string): Promise<void> {
  return invoke<void>("save_file", { path, content });
}

// ── Engine commands (via bridge-worker.ts) ───────────────────────────

async function engineCall<T>(command: string, params: Record<string, unknown>): Promise<T> {
  return invoke<T>("engine_call", { command, params });
}

/** Validate a manifest file against the canonical schema. */
export async function validateManifest(path: string): Promise<ValidationResult> {
  return engineCall<ValidationResult>("validate_manifest", { path });
}

/** Resolve and verify a manifest's external pointers. */
export async function resolveManifest(path: string): Promise<ResolutionResult> {
  return engineCall<ResolutionResult>("resolve_manifest", { path });
}

/** Stamp a manifest with deterministic ID and revision hash. */
export async function stampManifest(path: string): Promise<StampResult> {
  return engineCall<StampResult>("stamp_manifest", { path });
}

/** Mint a release on XRPL Testnet. Returns the issuance receipt. */
export async function mintRelease(opts: {
  manifestPath: string;
  walletsPath: string;
  network: string;
  receiptPath: string;
}): Promise<IssuanceReceipt> {
  return engineCall<IssuanceReceipt>("mint_release", opts);
}

/** Verify a manifest + receipt against each other and the chain. */
export async function verifyRelease(
  manifestPath: string,
  receiptPath: string
): Promise<VerifyResult> {
  return engineCall<VerifyResult>("verify_release", { manifestPath, receiptPath });
}

// ── Access commands ─────────────────────────────────────────────────

/** Create an access policy from manifest + receipt. */
export async function createAccessPolicy(opts: {
  manifestPath: string;
  receiptPath: string;
  label: string;
  ttlSeconds?: number;
  outputPath?: string;
}): Promise<AccessPolicy> {
  return engineCall<AccessPolicy>("create_access_policy", opts);
}

/** Check if a wallet holds qualifying NFTs. */
export async function checkHolderAccess(opts: {
  walletAddress: string;
  qualifyingTokenIds: string[];
  network: string;
}): Promise<HolderCheckResult> {
  return engineCall<HolderCheckResult>("check_holder", opts);
}

/** Run the full grant-access flow. */
export async function grantAccess(opts: {
  manifestPath: string;
  receiptPath: string;
  policyPath: string;
  walletAddress: string;
  outputPath?: string;
}): Promise<AccessGrantReceipt> {
  return engineCall<AccessGrantReceipt>("grant_access", opts);
}

// ── Recovery commands ───────────────────────────────────────────────

/** Generate a recovery bundle + verify consistency + chain checks. */
export async function recoverRelease(opts: {
  manifestPath: string;
  receiptPath: string;
  policyPath?: string;
  outputPath?: string;
}): Promise<RecoverResult> {
  return engineCall<RecoverResult>("recover_release", opts);
}

/** Verify an existing recovery bundle against source artifacts. */
export async function verifyRecovery(opts: {
  bundlePath: string;
  manifestPath: string;
  receiptPath: string;
  policyPath?: string;
}): Promise<BundleVerificationResult> {
  return engineCall<BundleVerificationResult>("verify_recovery", opts);
}
