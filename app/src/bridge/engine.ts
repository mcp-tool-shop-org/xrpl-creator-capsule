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
    txHashes: string[];
    transferFee: number;
    taxon: number;
  };
  pointers: {
    metadataUri: string;
    licenseUri: string;
    coverCid: string;
    mediaCid: string;
  };
  storageProvider: string;
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
