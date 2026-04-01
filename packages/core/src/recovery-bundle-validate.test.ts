import { describe, it, expect } from "vitest";
import type { ReleaseManifest } from "./manifest.js";
import type { IssuanceReceipt } from "./receipt.js";
import type { AccessPolicy } from "./access-policy.js";
import type { RecoveryBundle } from "./recovery-bundle.js";
import { computeManifestId, computeRevisionHash } from "./hash.js";
import { stampReceiptHash, computeReceiptHash } from "./receipt-validate.js";
import {
  validateRecoveryBundle,
  assertRecoveryBundle,
  computeBundleHash,
  stampBundleHash,
  deriveRecoveryBundle,
  verifyBundleConsistency,
} from "./recovery-bundle-validate.js";

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const TOKEN_ID = "000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D96";

function makeManifest(): ReleaseManifest {
  return {
    schemaVersion: "1.0.0",
    title: "Midnight Frequency",
    artist: "Vex Morrow",
    editionSize: 1,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/midnight-frequency",
    license: {
      type: "custom",
      summary: "Personal license. No redistribution.",
      uri: "https://example.com/license",
    },
    benefit: {
      kind: "stems",
      description: "Full stem pack for personal remixing",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: { treasuryAddress: ISSUER, multiSig: false, terms: "Single artist." },
    issuerAddress: ISSUER,
    operatorAddress: OPERATOR,
    createdAt: "2026-04-01T00:00:00Z",
  };
}

function makeReceipt(manifest: ReleaseManifest): IssuanceReceipt {
  return stampReceiptHash({
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network: "testnet",
    issuedAt: "2026-04-01T08:00:00Z",
    issuerAddress: ISSUER,
    operatorAddress: OPERATOR,
    release: { title: "Midnight Frequency", artist: "Vex Morrow", editionSize: 1, transferFee: 5000 },
    pointers: {
      metadataUri: "https://example.com/.well-known/xrpl-nft/midnight-frequency",
      licenseUri: "https://example.com/license",
      coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    },
    xrpl: {
      authorizedMinterVerified: true,
      mintTxHashes: ["AABB11223344"],
      nftTokenIds: [TOKEN_ID],
      tokenTaxon: 0,
      flags: 8,
      transferFee: 5000,
    },
    storage: { provider: "mock", mediaResolved: true, coverResolved: true },
    verification: {
      manifestMatchesPointers: true,
      issuerOperatorSeparated: true,
      networkAllowed: true,
      errors: [],
      warnings: [],
    },
  });
}

function makePolicy(manifest: ReleaseManifest): AccessPolicy {
  return {
    schemaVersion: "1.0.0",
    kind: "access-policy",
    manifestId: computeManifestId(manifest),
    label: "Stems pack for Midnight Frequency holders",
    benefit: { kind: "stems", contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB" },
    rule: { type: "holds-nft", issuerAddress: ISSUER, qualifyingTokenIds: [TOKEN_ID] },
    delivery: { mode: "download-token", ttlSeconds: 3600 },
    createdAt: "2026-04-01T09:00:00Z",
  };
}

describe("deriveRecoveryBundle", () => {
  it("produces a valid bundle from source artifacts", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);

    const bundle = deriveRecoveryBundle(manifest, receipt, policy);

    expect(bundle.kind).toBe("recovery-bundle");
    expect(bundle.manifestId).toBe(computeManifestId(manifest));
    expect(bundle.revisionHash).toBe(computeRevisionHash(manifest));
    expect(bundle.receiptHash).toBe(receipt.receiptHash);
    expect(bundle.title).toBe("Midnight Frequency");
    expect(bundle.artist).toBe("Vex Morrow");
    expect(bundle.tokenIds).toEqual([TOKEN_ID]);
    expect(bundle.accessPolicyLabel).toBe(policy.label);
    expect(bundle.qualifyingTokenIds).toEqual([TOKEN_ID]);
    expect(bundle.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.instructions.length).toBeGreaterThan(0);
  });

  it("works without an access policy", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);

    const bundle = deriveRecoveryBundle(manifest, receipt);

    expect(bundle.accessPolicyLabel).toBeUndefined();
    expect(bundle.qualifyingTokenIds).toBeUndefined();
    expect(validateRecoveryBundle(bundle).valid).toBe(true);
  });

  it("passes schema validation", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    expect(validateRecoveryBundle(bundle).valid).toBe(true);
  });
});

describe("validateRecoveryBundle", () => {
  it("rejects missing required fields", () => {
    expect(validateRecoveryBundle({ schemaVersion: "1.0.0" }).valid).toBe(false);
  });

  it("rejects wrong kind", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = { ...deriveRecoveryBundle(manifest, receipt), kind: "wrong" };
    expect(validateRecoveryBundle(bundle).valid).toBe(false);
  });
});

describe("assertRecoveryBundle", () => {
  it("returns typed bundle for valid input", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    const result = assertRecoveryBundle(bundle);
    expect(result.kind).toBe("recovery-bundle");
  });

  it("throws for invalid input", () => {
    expect(() => assertRecoveryBundle({})).toThrow("Invalid RecoveryBundle");
  });
});

describe("computeBundleHash", () => {
  it("returns a 64-char hex string", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    expect(computeBundleHash(bundle)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    expect(computeBundleHash(bundle)).toBe(computeBundleHash(bundle));
  });

  it("changes when bundle content changes", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const b1 = deriveRecoveryBundle(manifest, receipt);
    const b2 = { ...b1, title: "Changed" };
    expect(computeBundleHash(b1)).not.toBe(computeBundleHash(b2));
  });

  it("covers nested fields — changing tokenIds changes hash", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const b1 = deriveRecoveryBundle(manifest, receipt);
    const b2 = { ...b1, tokenIds: ["DEADBEEF"] };
    expect(computeBundleHash(b1)).not.toBe(computeBundleHash(b2));
  });

  it("ignores existing bundleHash field", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    const h1 = computeBundleHash(bundle);
    const tampered = { ...bundle, bundleHash: "deadbeef".repeat(8) };
    expect(computeBundleHash(tampered)).toBe(h1);
  });
});

describe("stampBundleHash", () => {
  it("adds bundleHash without mutating original", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    // deriveRecoveryBundle already stamps, but test the function directly
    const { bundleHash: _bh, ...unstamped } = bundle;
    const stamped = stampBundleHash(unstamped as RecoveryBundle);
    expect(stamped.bundleHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces self-consistent hash", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    expect(bundle.bundleHash).toBe(computeBundleHash(bundle));
  });
});

describe("verifyBundleConsistency", () => {
  it("passes for a correctly derived bundle", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt, policy);

    const result = verifyBundleConsistency(bundle, manifest, receipt, policy);
    expect(result.valid).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails when manifest was modified after bundle creation", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    manifest.title = "Changed After Bundle";

    const result = verifyBundleConsistency(bundle, manifest, receipt);
    expect(result.valid).toBe(false);
    const failedNames = result.checks.filter((c) => !c.passed).map((c) => c.name);
    expect(failedNames).toContain("manifest-id");
    expect(failedNames).toContain("title");
  });

  it("fails when receipt was tampered", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    // Tamper receipt hash
    const tampered = { ...receipt, receiptHash: "0000000000000000000000000000000000000000000000000000000000000000" };

    const result = verifyBundleConsistency(bundle, manifest, tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.filter((c) => !c.passed).map((c) => c.name)).toContain("receipt-hash");
  });

  it("fails when bundle was tampered", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = deriveRecoveryBundle(manifest, receipt);
    const tampered = { ...bundle, title: "Tampered Title" };

    const result = verifyBundleConsistency(tampered, manifest, receipt);
    expect(result.valid).toBe(false);
    const failedNames = result.checks.filter((c) => !c.passed).map((c) => c.name);
    expect(failedNames).toContain("bundle-integrity");
    expect(failedNames).toContain("title");
  });

  it("fails when token IDs mismatch", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = { ...deriveRecoveryBundle(manifest, receipt), tokenIds: ["WRONG"] };

    const result = verifyBundleConsistency(bundle, manifest, receipt);
    expect(result.valid).toBe(false);
    expect(result.checks.filter((c) => !c.passed).map((c) => c.name)).toContain("token-ids");
  });

  it("fails when pointers mismatch", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const bundle = { ...deriveRecoveryBundle(manifest, receipt), mediaCid: "QmFAKE" };

    const result = verifyBundleConsistency(bundle, manifest, receipt);
    expect(result.valid).toBe(false);
    expect(result.checks.filter((c) => !c.passed).map((c) => c.name)).toContain("media-cid");
  });
});
