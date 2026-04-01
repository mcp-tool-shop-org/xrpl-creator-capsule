import { describe, it, expect } from "vitest";
import type { AccessPolicy } from "./access-policy.js";
import type { ReleaseManifest } from "./manifest.js";
import type { IssuanceReceipt } from "./receipt.js";
import {
  validateAccessPolicy,
  assertAccessPolicy,
  checkPolicyCoherence,
} from "./access-policy-validate.js";
import { computeManifestId } from "./hash.js";

function makeValidPolicy(): AccessPolicy {
  return {
    schemaVersion: "1.0.0",
    kind: "access-policy",
    manifestId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    label: "Stems pack for Midnight Frequency holders",
    benefit: {
      kind: "stems",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    rule: {
      type: "holds-nft",
      issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      qualifyingTokenIds: ["000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D96"],
    },
    delivery: {
      mode: "download-token",
      ttlSeconds: 3600,
    },
    createdAt: "2026-04-01T10:00:00Z",
  };
}

function makeManifestForPolicy(): ReleaseManifest {
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
      summary: "Personal license.",
      uri: "https://example.com/license",
    },
    benefit: {
      kind: "stems",
      description: "Full stem pack",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: {
      treasuryAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      multiSig: false,
      terms: "Single artist.",
    },
    issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    createdAt: "2026-04-01T00:00:00Z",
  };
}

function makeReceiptForPolicy(): IssuanceReceipt {
  return {
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: "placeholder",
    manifestRevisionHash: "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
    network: "testnet",
    issuedAt: "2026-04-01T00:00:00Z",
    issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
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
      nftTokenIds: ["000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D96"],
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
  };
}

describe("validateAccessPolicy", () => {
  it("accepts a valid policy", () => {
    const result = validateAccessPolicy(makeValidPolicy());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects policy missing required fields", () => {
    const result = validateAccessPolicy({ schemaVersion: "1.0.0" });
    expect(result.valid).toBe(false);
  });

  it("rejects wrong kind", () => {
    const p = { ...makeValidPolicy(), kind: "wrong" };
    expect(validateAccessPolicy(p).valid).toBe(false);
  });

  it("rejects invalid manifestId", () => {
    const p = { ...makeValidPolicy(), manifestId: "not-hex" };
    expect(validateAccessPolicy(p).valid).toBe(false);
  });

  it("rejects empty qualifyingTokenIds", () => {
    const p = makeValidPolicy();
    p.rule.qualifyingTokenIds = [];
    expect(validateAccessPolicy(p).valid).toBe(false);
  });

  it("rejects invalid issuerAddress", () => {
    const p = makeValidPolicy();
    p.rule.issuerAddress = "not-an-address";
    expect(validateAccessPolicy(p).valid).toBe(false);
  });
});

describe("assertAccessPolicy", () => {
  it("returns typed policy for valid input", () => {
    const policy = assertAccessPolicy(makeValidPolicy());
    expect(policy.kind).toBe("access-policy");
  });

  it("throws for invalid input", () => {
    expect(() => assertAccessPolicy({})).toThrow("Invalid AccessPolicy");
  });
});

describe("checkPolicyCoherence", () => {
  it("passes when policy matches manifest and receipt", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    policy.manifestId = computeManifestId(manifest);
    receipt.manifestId = policy.manifestId;

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects when manifestId does not match", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    // policy.manifestId is wrong by default

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(false);
    expect(result.errors.some((e) => e.includes("manifestId"))).toBe(true);
  });

  it("rejects when benefit kind does not match", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    policy.manifestId = computeManifestId(manifest);
    receipt.manifestId = policy.manifestId;
    policy.benefit.kind = "bonus-track";

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(false);
    expect(result.errors.some((e) => e.includes("benefit kind"))).toBe(true);
  });

  it("rejects when contentPointer does not match", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    policy.manifestId = computeManifestId(manifest);
    receipt.manifestId = policy.manifestId;
    policy.benefit.contentPointer = "QmFAKE";

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(false);
    expect(result.errors.some((e) => e.includes("contentPointer"))).toBe(true);
  });

  it("rejects when issuerAddress does not match", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    policy.manifestId = computeManifestId(manifest);
    receipt.manifestId = policy.manifestId;
    policy.rule.issuerAddress = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(false);
    expect(result.errors.some((e) => e.includes("issuerAddress"))).toBe(true);
  });

  it("rejects when qualifying tokens not in receipt", () => {
    const manifest = makeManifestForPolicy();
    const receipt = makeReceiptForPolicy();
    const policy = makeValidPolicy();
    policy.manifestId = computeManifestId(manifest);
    receipt.manifestId = policy.manifestId;
    policy.rule.qualifyingTokenIds = ["DEADBEEFNOTINRECEIPT0000000000000000000000000000000000000000000000"];

    const result = checkPolicyCoherence(policy, manifest, receipt);
    expect(result.coherent).toBe(false);
    expect(result.errors.some((e) => e.includes("not in issuance receipt"))).toBe(true);
  });
});
