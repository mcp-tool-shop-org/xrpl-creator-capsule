import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  computeBundleHash,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
} from "@capsule/core";
import { recoverRelease } from "./recover-release.js";

// Mock XRPL chain calls
vi.mock("@capsule/xrpl", () => ({
  verifyAuthorizedMinter: vi.fn(),
  readNftFromLedger: vi.fn(),
  checkHolder: vi.fn(),
}));

import { verifyAuthorizedMinter, readNftFromLedger } from "@capsule/xrpl";
const mockVerifyMinter = vi.mocked(verifyAuthorizedMinter);
const mockReadNft = vi.mocked(readNftFromLedger);

let tempDir: string;

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
    license: { type: "custom", summary: "Personal license.", uri: "https://example.com/license" },
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

function setupChainMocks(nftFound = true) {
  mockVerifyMinter.mockResolvedValue({
    verified: true,
    issuerAddress: ISSUER,
    expectedOperator: OPERATOR,
    actualMinter: OPERATOR,
  });

  if (nftFound) {
    mockReadNft.mockResolvedValue({
      nftTokenId: TOKEN_ID,
      issuer: ISSUER,
      uri: "hex-encoded-uri",
      flags: 8,
      transferFee: 5000,
      taxon: 0,
    });
  } else {
    mockReadNft.mockResolvedValue(null);
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-recover-test-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeArtifacts(
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt,
  policy?: AccessPolicy
) {
  const manifestPath = join(tempDir, "manifest.json");
  const receiptPath = join(tempDir, "receipt.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(receiptPath, JSON.stringify(receipt));

  let policyPath: string | undefined;
  if (policy) {
    policyPath = join(tempDir, "policy.json");
    await writeFile(policyPath, JSON.stringify(policy));
  }
  return { manifestPath, receiptPath, policyPath };
}

describe("recover-release — reconstruction", () => {
  it("reconstructs a release from artifacts + chain state", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath, paths.policyPath);

    expect(result.reconstruction.passed).toBe(true);
    expect(result.bundle.kind).toBe("recovery-bundle");
    expect(result.bundle.manifestId).toBe(computeManifestId(manifest));
    expect(result.bundle.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.bundle.bundleHash).toBe(computeBundleHash(result.bundle));

    // All sections should pass
    for (const section of result.reconstruction.sections) {
      expect(section.passed).toBe(true);
    }
  });

  it("includes all required sections", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const paths = await writeArtifacts(manifest, receipt);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);

    const sectionNames = result.reconstruction.sections.map((s) => s.name);
    expect(sectionNames).toContain("Release Identity");
    expect(sectionNames).toContain("Issuance Receipt");
    expect(sectionNames).toContain("Mint Facts");
    expect(sectionNames).toContain("Durable Pointers");
    expect(sectionNames).toContain("License Terms");
    expect(sectionNames).toContain("Collector Benefit");
    expect(sectionNames).toContain("Chain Verification");
    expect(sectionNames).toContain("Recovery Instructions");
  });

  it("works without access policy", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const paths = await writeArtifacts(manifest, receipt);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);
    expect(result.reconstruction.passed).toBe(true);
    expect(result.bundle.accessPolicyLabel).toBeUndefined();
  });
});

describe("recover-release — failure detection", () => {
  it("detects modified manifest (identity mismatch)", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    manifest.title = "Changed After Issuance";
    const paths = await writeArtifacts(manifest, receipt);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);
    expect(result.reconstruction.passed).toBe(false);

    const identitySection = result.reconstruction.sections.find((s) => s.name === "Release Identity");
    expect(identitySection?.passed).toBe(false);
  });

  it("detects tampered receipt", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const tampered = { ...receipt, issuedAt: "2020-01-01T00:00:00Z" };
    const paths = await writeArtifacts(manifest, tampered);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);
    expect(result.reconstruction.passed).toBe(false);

    const receiptSection = result.reconstruction.sections.find((s) => s.name === "Issuance Receipt");
    expect(receiptSection?.passed).toBe(false);
  });

  it("detects NFT missing from chain", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const paths = await writeArtifacts(manifest, receipt);
    setupChainMocks(false);

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);
    expect(result.reconstruction.passed).toBe(false);

    const chainSection = result.reconstruction.sections.find((s) => s.name === "Chain Verification");
    expect(chainSection?.passed).toBe(false);
  });

  it("handles chain connectivity failure", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const paths = await writeArtifacts(manifest, receipt);
    mockVerifyMinter.mockRejectedValue(new Error("Connection refused"));

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath);
    expect(result.reconstruction.passed).toBe(false);

    const chainSection = result.reconstruction.sections.find((s) => s.name === "Chain Verification");
    expect(chainSection?.passed).toBe(false);
    expect(chainSection?.lines.some((l) => l.includes("Connection refused"))).toBe(true);
  });
});

describe("recover-release — death drill (artifacts-only reconstruction)", () => {
  it("proves release is legible from artifacts alone", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const policy = makePolicy(manifest);
    const paths = await writeArtifacts(manifest, receipt, policy);
    setupChainMocks();

    const result = await recoverRelease(paths.manifestPath, paths.receiptPath, paths.policyPath);

    // What the release is
    expect(result.bundle.title).toBe("Midnight Frequency");
    expect(result.bundle.artist).toBe("Vex Morrow");

    // Who issued it
    expect(result.bundle.issuerAddress).toBe(ISSUER);
    expect(result.bundle.operatorAddress).toBe(OPERATOR);

    // What was minted
    expect(result.bundle.tokenIds).toEqual([TOKEN_ID]);
    expect(result.bundle.txHashes).toEqual(["AABB11223344"]);

    // What it unlocks
    expect(result.bundle.benefit.kind).toBe("stems");
    expect(result.bundle.benefit.contentPointer).toBe("QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB");

    // Where durable references live
    expect(result.bundle.metadataUri).toBe("https://example.com/.well-known/xrpl-nft/midnight-frequency");
    expect(result.bundle.licenseUri).toBe("https://example.com/license");
    expect(result.bundle.coverCid).toBe("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");
    expect(result.bundle.mediaCid).toBe("QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o");

    // License terms readable
    expect(result.bundle.licenseType).toBe("custom");
    expect(result.bundle.licenseSummary).toContain("Personal");

    // Recovery instructions present
    expect(result.bundle.instructions.length).toBeGreaterThan(5);

    // How entitlement is evaluated
    expect(result.bundle.qualifyingTokenIds).toEqual([TOKEN_ID]);
  });
});
