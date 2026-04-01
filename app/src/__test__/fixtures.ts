/**
 * Shared test fixtures — canonical artifact shapes for state/bridge tests.
 */
import type { ReleaseManifest, IssuanceReceipt, AccessPolicy, AccessGrantReceipt, RecoveryBundle, RecoverResult, GovernancePolicy } from "../bridge/engine";
import type { SessionState } from "../state/session";
import type { StudioDraft } from "../state/studio";

// ── Manifest ──────────────────────────────────────────────────────

export const MANIFEST: ReleaseManifest = {
  schemaVersion: "1.0.0",
  title: "Test Release",
  artist: "Test Artist",
  editionSize: 10,
  coverCid: "QmCover123",
  mediaCid: "QmMedia456",
  metadataEndpoint: "https://meta.example.com",
  license: { type: "personal-use", summary: "Personal use only", uri: "https://license.example.com" },
  benefit: { kind: "bonus-track", description: "Exclusive bonus", contentPointer: "QmBonus789" },
  priceDrops: "10",
  transferFeePercent: 5,
  payoutPolicy: { treasuryAddress: "rTreasury123", multiSig: false, terms: "Standard" },
  issuerAddress: "rIssuer123",
  operatorAddress: "rOperator456",
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "manifest-abc-123",
};

// ── Receipt ───────────────────────────────────────────────────────

export const RECEIPT: IssuanceReceipt = {
  manifestId: "manifest-abc-123",
  manifestRevisionHash: "rev-hash-abc",
  receiptHash: "receipt-hash-xyz",
  issuerAddress: "rIssuer123",
  operatorAddress: "rOperator456",
  network: "testnet",
  issuedAt: "2026-01-01T01:00:00.000Z",
  xrpl: {
    nftTokenIds: ["00080000ABC"],
    mintTxHashes: ["TX123"],
    transferFee: 5000,
    tokenTaxon: 0,
  },
  pointers: {
    metadataUri: "ipfs://QmMeta",
    licenseUri: "ipfs://QmLicense",
    coverCid: "QmCover123",
    mediaCid: "QmMedia456",
  },
};

// ── Access Policy ─────────────────────────────────────────────────

export const ACCESS_POLICY: AccessPolicy = {
  schemaVersion: "1.0.0",
  kind: "access-policy",
  manifestId: "manifest-abc-123",
  label: "bonus-track for Test Release holders",
  benefit: { kind: "bonus-track", contentPointer: "QmBonus789" },
  rule: { type: "nft-holder", issuerAddress: "rIssuer123", qualifyingTokenIds: ["00080000ABC"] },
  delivery: { mode: "direct", ttlSeconds: 3600 },
  createdAt: "2026-01-01T02:00:00.000Z",
};

// ── Access Grant ──────────────────────────────────────────────────

export function makeGrant(decision: "allow" | "deny", address: string): AccessGrantReceipt {
  return {
    schemaVersion: "1.0.0",
    kind: "access-grant",
    manifestId: "manifest-abc-123",
    policyLabel: "bonus-track for Test Release holders",
    subjectAddress: address,
    network: "testnet",
    decision,
    reason: decision === "allow" ? "Wallet holds qualifying NFT" : "No qualifying NFTs found",
    benefit: { kind: "bonus-track", contentPointer: "QmBonus789" },
    ownership: {
      matchedTokenIds: decision === "allow" ? ["00080000ABC"] : [],
      totalNftsChecked: 1,
    },
    delivery: decision === "allow" ? { mode: "direct", token: "tok-abc", expiresAt: "2026-01-02T00:00:00.000Z" } : undefined,
    decidedAt: "2026-01-01T03:00:00.000Z",
    grantHash: decision === "allow" ? "grant-hash-xyz" : undefined,
  };
}

// ── Recovery Bundle ───────────────────────────────────────────────

export const RECOVERY_BUNDLE: RecoveryBundle = {
  schemaVersion: "1.0.0",
  kind: "recovery-bundle",
  manifestId: "manifest-abc-123",
  revisionHash: "rev-hash-abc",
  receiptHash: "receipt-hash-xyz",
  title: "Test Release",
  artist: "Test Artist",
  editionSize: 10,
  network: "testnet",
  issuerAddress: "rIssuer123",
  operatorAddress: "rOperator456",
  tokenIds: ["00080000ABC"],
  txHashes: ["TX123"],
  transferFee: 5000,
  metadataUri: "ipfs://QmMeta",
  licenseUri: "ipfs://QmLicense",
  coverCid: "QmCover123",
  mediaCid: "QmMedia456",
  licenseType: "personal-use",
  licenseSummary: "Personal use only",
  benefit: { kind: "bonus-track", description: "Exclusive bonus", contentPointer: "QmBonus789" },
  generatedAt: "2026-01-01T04:00:00.000Z",
  recoveryVersion: "1.0.0",
  instructions: ["Store this bundle securely"],
  bundleHash: "bundle-hash-abc",
};

export const RECOVER_RESULT: RecoverResult = {
  bundle: RECOVERY_BUNDLE,
  verification: { valid: true, checks: [{ name: "hash-match", passed: true, detail: "OK" }] },
  chainChecks: [{ name: "token-exists", passed: true, detail: "OK" }],
  allPassed: true,
};

// ── Governance Policy ─────────────────────────────────────────────

export const GOV_POLICY: GovernancePolicy = {
  schemaVersion: "1.0.0",
  kind: "governance-policy",
  manifestId: "manifest-abc-123",
  network: "testnet",
  treasuryAddress: "rTreasury123",
  signerPolicy: {
    signers: [{ address: "rSigner1", role: "artist" }],
    threshold: 1,
  },
  payoutPolicy: {
    allowedAssets: ["XRP"],
    allowPartialPayouts: false,
  },
  createdAt: "2026-01-01T05:00:00.000Z",
  createdBy: "rSigner1",
  policyHash: "gov-hash-abc",
};

// ── Session ───────────────────────────────────────────────────────

export const VALID_SESSION: SessionState = {
  version: 1,
  savedAt: "2026-01-01T00:00:00.000Z",
  draft: null,
  activeStep: "create",
  mode: "studio",
  artifactPaths: {
    manifestPath: "/artifacts/manifest.json",
    receiptPath: "/artifacts/receipt.json",
    accessPolicyPath: null,
    recoveryBundlePath: null,
    governancePolicyPath: null,
    proposalPath: null,
    decisionPath: null,
    executionPath: null,
  },
  completed: {
    published: true,
    verified: false,
    accessTested: false,
    recoveryGenerated: false,
  },
};

export const DRAFT: StudioDraft = {
  title: "My Album",
  artist: "Test Artist",
  description: "A test album",
  editionSize: 5,
  coverArtPath: null,
  mediaFilePath: null,
  benefitKind: "bonus-track",
  benefitDescription: "Exclusive bonus track",
  benefitContentPath: null,
  transferFeePercent: 5,
  licenseType: "personal-use",
  licenseSummary: "Personal use only",
  collaborators: [],
  treasuryAddress: "",
  walletsPath: null,
  draftPath: null,
};
