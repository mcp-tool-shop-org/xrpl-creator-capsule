import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  computeGrantHash,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
} from "@capsule/core";
import { MockDeliveryProvider } from "@capsule/storage";
import { grantAccess } from "./grant-access.js";

// Mock the XRPL holder check
vi.mock("@capsule/xrpl", () => ({
  checkHolder: vi.fn(),
}));

import { checkHolder } from "@capsule/xrpl";
const mockCheckHolder = vi.mocked(checkHolder);

let tempDir: string;

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const HOLDER = "rBHMbioz9znTCqgjZ6Nx43uWY43kToEPa9";
const NON_HOLDER = "r3kmLJN5D28dHuH8vZNUcopvoB9UnaFTdn";
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
      treasuryAddress: ISSUER,
      multiSig: false,
      terms: "Single artist.",
    },
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
    benefit: {
      kind: "stems",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    rule: {
      type: "holds-nft",
      issuerAddress: ISSUER,
      qualifyingTokenIds: [TOKEN_ID],
    },
    delivery: {
      mode: "download-token",
      ttlSeconds: 3600,
    },
    createdAt: "2026-04-01T09:00:00Z",
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-grant-test-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeArtifacts(
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt,
  policy: AccessPolicy
) {
  const manifestPath = join(tempDir, "manifest.json");
  const receiptPath = join(tempDir, "receipt.json");
  const policyPath = join(tempDir, "policy.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(receiptPath, JSON.stringify(receipt));
  await writeFile(policyPath, JSON.stringify(policy));
  return { manifestPath, receiptPath, policyPath };
}

describe("grant-access — allow path", () => {
  it("grants access when wallet holds qualifying NFT", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);

    mockCheckHolder.mockResolvedValue({
      holds: true,
      matchedTokenIds: [TOKEN_ID],
      totalNftsChecked: 1,
      walletAddress: HOLDER,
    });

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("allow");
    expect(result.ownership.matchedTokenIds).toContain(TOKEN_ID);
    expect(result.delivery).toBeDefined();
    expect(result.delivery!.token).toMatch(/^tok_/);
    expect(result.grantHash).toMatch(/^[a-f0-9]{64}$/);
    // Self-consistent hash
    expect(result.grantHash).toBe(computeGrantHash(result));
  });
});

describe("grant-access — deny path", () => {
  it("denies when wallet does not hold qualifying NFT", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);

    mockCheckHolder.mockResolvedValue({
      holds: false,
      matchedTokenIds: [],
      totalNftsChecked: 3,
      walletAddress: NON_HOLDER,
    });

    const result = await grantAccess({
      ...paths,
      walletAddress: NON_HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("does not hold");
    expect(result.delivery).toBeUndefined();
    expect(result.grantHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("denies when XRPL query fails", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);

    mockCheckHolder.mockResolvedValue({
      holds: false,
      matchedTokenIds: [],
      totalNftsChecked: 0,
      walletAddress: HOLDER,
      error: "Connection timeout",
    });

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Ownership check failed");
    expect(result.reason).toContain("Connection timeout");
  });

  it("denies when policy references wrong manifest", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    policy.manifestId = "0000000000000000000000000000000000000000000000000000000000000000";
    const paths = await writeArtifacts(manifest, receipt, policy);

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Policy coherence failed");
    expect(result.reason).toContain("manifestId");
  });

  it("denies when policy benefit kind does not match manifest", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    policy.benefit.kind = "bonus-track";
    const paths = await writeArtifacts(manifest, receipt, policy);

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("benefit kind");
  });

  it("denies when issuance receipt has been tampered with", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    // Tamper: change a field but keep the old hash
    const tampered = { ...receipt, issuedAt: "2020-01-01T00:00:00Z" };
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, tampered, policy);

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("tampered");
  });

  it("denies when manifest was changed after issuance", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    // Change manifest after receipt was created
    manifest.title = "Changed After Issuance";
    const paths = await writeArtifacts(manifest, receipt, policy);

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    // Could be policy coherence (manifestId mismatch) or manifest identity check
    expect(result.reason).toMatch(/coherence|identity|modified/i);
  });

  it("denies when policy references tokens not in receipt", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    policy.rule.qualifyingTokenIds = ["DEADBEEF0000000000000000000000000000000000000000000000000000DEAD"];
    const paths = await writeArtifacts(manifest, receipt, policy);

    const result = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("not in issuance receipt");
  });

  it("denies when account not found on ledger", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);

    mockCheckHolder.mockResolvedValue({
      holds: false,
      matchedTokenIds: [],
      totalNftsChecked: 0,
      walletAddress: NON_HOLDER,
      error: "Account not found on ledger",
    });

    const result = await grantAccess({
      ...paths,
      walletAddress: NON_HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Account not found");
  });
});

describe("grant-access — receipt integrity", () => {
  it("every decision has a grantHash", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);

    // Allow
    mockCheckHolder.mockResolvedValue({
      holds: true,
      matchedTokenIds: [TOKEN_ID],
      totalNftsChecked: 1,
      walletAddress: HOLDER,
    });
    let paths = await writeArtifacts(manifest, receipt, policy);
    const allow = await grantAccess({
      ...paths,
      walletAddress: HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });
    expect(allow.grantHash).toMatch(/^[a-f0-9]{64}$/);
    expect(allow.grantHash).toBe(computeGrantHash(allow));

    // Deny
    mockCheckHolder.mockResolvedValue({
      holds: false,
      matchedTokenIds: [],
      totalNftsChecked: 0,
      walletAddress: NON_HOLDER,
    });
    paths = await writeArtifacts(manifest, receipt, policy);
    const deny = await grantAccess({
      ...paths,
      walletAddress: NON_HOLDER,
      deliveryProvider: new MockDeliveryProvider(),
    });
    expect(deny.grantHash).toMatch(/^[a-f0-9]{64}$/);
    expect(deny.grantHash).toBe(computeGrantHash(deny));
  });
});
