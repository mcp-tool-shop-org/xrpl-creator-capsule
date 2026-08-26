import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { convertStringToHex } from "xrpl";
import {
  assertManifest,
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  type IssuanceReceipt,
  type ReleaseManifest,
} from "@capsule/core";

// Mock XRPL chain calls for the full-set chain-verification tests below.
// (The pre-existing tests in this file only exercise offline reconciliation
// and never call verifyRelease() itself, so this mock does not affect them.)
vi.mock("@capsule/xrpl", () => ({
  verifyAuthorizedMinter: vi.fn(),
  readNftFromLedger: vi.fn(),
}));

import { verifyRelease } from "./verify-release.js";
import { verifyAuthorizedMinter, readNftFromLedger } from "@capsule/xrpl";
const mockVerifyMinter = vi.mocked(verifyAuthorizedMinter);
const mockReadNft = vi.mocked(readNftFromLedger);

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../../fixtures/sample-release.json"
);

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-verify-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function loadManifest(): Promise<ReleaseManifest> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return assertManifest(JSON.parse(raw));
}

function makeReceiptFromManifest(manifest: ReleaseManifest): IssuanceReceipt {
  return stampReceiptHash({
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network: "testnet",
    issuedAt: "2026-04-01T00:00:00Z",
    issuerAddress: manifest.issuerAddress,
    operatorAddress: manifest.operatorAddress,
    release: {
      title: manifest.title,
      artist: manifest.artist,
      editionSize: manifest.editionSize,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    pointers: {
      metadataUri: manifest.metadataEndpoint,
      licenseUri: manifest.license.uri,
      coverCid: manifest.coverCid,
      mediaCid: manifest.mediaCid,
    },
    xrpl: {
      authorizedMinterVerified: true,
      mintTxHashes: ["FAKETX01"],
      nftTokenIds: ["FAKETOKEN01"],
      tokenTaxon: 0,
      flags: 8,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    storage: {
      provider: "mock",
      mediaResolved: true,
      coverResolved: true,
    },
    verification: {
      manifestMatchesPointers: true,
      issuerOperatorSeparated: true,
      networkAllowed: true,
      errors: [],
      warnings: [],
    },
  });
}

// We test only the offline reconciliation checks here.
// Chain verification is tested separately in integration tests.
// To isolate offline checks, we import the verify function internals.

import {
  computeReceiptHash,
} from "@capsule/core";

describe("verify-release offline reconciliation", () => {
  it("matching manifest and receipt have coherent hashes", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    expect(receipt.manifestId).toBe(computeManifestId(manifest));
    expect(receipt.manifestRevisionHash).toBe(computeRevisionHash(manifest));
    expect(receipt.receiptHash).toBe(computeReceiptHash(receipt));
  });

  it("detects manifest ID mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Tamper with manifestId
    const tampered = {
      ...receipt,
      manifestId: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    expect(tampered.manifestId).not.toBe(computeManifestId(manifest));
  });

  it("detects revision hash mismatch when manifest changes after issuance", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Modify manifest after receipt was issued
    const modified = { ...manifest, priceDrops: "1" };
    const newRevision = computeRevisionHash(modified);

    expect(receipt.manifestRevisionHash).not.toBe(newRevision);
  });

  it("detects receipt tampering via receiptHash", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Tamper with receipt content but keep original hash
    const tampered = { ...receipt, issuedAt: "2099-01-01T00:00:00Z" };
    const recomputedHash = computeReceiptHash(tampered);

    expect(receipt.receiptHash).not.toBe(recomputedHash);
  });

  it("detects issuer mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      issuerAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    };
    expect(tampered.issuerAddress).not.toBe(manifest.issuerAddress);
  });

  it("detects operator mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      operatorAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    };
    expect(tampered.operatorAddress).not.toBe(manifest.operatorAddress);
  });

  it("detects transfer fee mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const expectedFee = Math.round(manifest.transferFeePercent * 1000);
    const tampered = {
      ...receipt,
      xrpl: { ...receipt.xrpl, transferFee: expectedFee + 1000 },
    };
    expect(tampered.xrpl.transferFee).not.toBe(expectedFee);
  });

  it("detects edition count mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Receipt says 1 token but manifest says 50
    expect(receipt.xrpl.nftTokenIds.length).not.toBe(manifest.editionSize);
  });

  it("detects metadata pointer mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      pointers: {
        ...receipt.pointers,
        metadataUri: "https://evil.com/metadata",
      },
    };
    expect(tampered.pointers.metadataUri).not.toBe(manifest.metadataEndpoint);
  });

  it("detects media CID mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      pointers: { ...receipt.pointers, mediaCid: "QmFAKECID" },
    };
    expect(tampered.pointers.mediaCid).not.toBe(manifest.mediaCid);
  });
});

// ── Full-set chain verification (multi-edition) ─────────────────────
//
// F-42ee54ec: the chain-verification block used to fetch and check only
// receipt.xrpl.nftTokenIds[0]. For editionSize > 1, editions 2..N were
// never checked against ledger state, so a receipt where only edition 1
// was actually minted (editions 2..N fabricated/stale/never landed) could
// still report `passed: true`. These tests call verifyRelease() for real,
// with @capsule/xrpl mocked, to prove every edition is now checked.

const CHAIN_ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const CHAIN_OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const TOKEN_A = "AAAA0000000000000000000000000000000000000000000000000000000001";
const TOKEN_B = "AAAA0000000000000000000000000000000000000000000000000000000002";
const TOKEN_C = "AAAA0000000000000000000000000000000000000000000000000000000003";

function makeMultiEditionManifest(): ReleaseManifest {
  return {
    schemaVersion: "1.0.0",
    title: "Chain Check EP",
    artist: "Nadia Frost",
    editionSize: 3,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/chain-check-ep",
    license: {
      type: "custom",
      summary: "Personal license.",
      uri: "https://example.com/license",
    },
    benefit: {
      kind: "stems",
      description: "Full stem pack.",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: {
      treasuryAddress: CHAIN_ISSUER,
      multiSig: false,
      terms: "Single artist.",
    },
    issuerAddress: CHAIN_ISSUER,
    operatorAddress: CHAIN_OPERATOR,
    createdAt: "2026-04-01T00:00:00Z",
  };
}

function makeMultiEditionReceipt(manifest: ReleaseManifest): IssuanceReceipt {
  return stampReceiptHash({
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network: "testnet",
    issuedAt: "2026-04-01T08:00:00Z",
    issuerAddress: CHAIN_ISSUER,
    operatorAddress: CHAIN_OPERATOR,
    release: {
      title: manifest.title,
      artist: manifest.artist,
      editionSize: 3,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    pointers: {
      metadataUri: manifest.metadataEndpoint,
      licenseUri: manifest.license.uri,
      coverCid: manifest.coverCid,
      mediaCid: manifest.mediaCid,
    },
    xrpl: {
      authorizedMinterVerified: true,
      mintTxHashes: ["TX0000000001", "TX0000000002", "TX0000000003"],
      nftTokenIds: [TOKEN_A, TOKEN_B, TOKEN_C],
      tokenTaxon: 0,
      flags: 8,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
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

async function writeVerifyArtifacts(
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt
) {
  const manifestPath = join(tempDir, "chain-manifest.json");
  const receiptPath = join(tempDir, "chain-receipt.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(receiptPath, JSON.stringify(receipt));
  return { manifestPath, receiptPath };
}

describe("verify-release — full-set chain verification (multi-edition)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: CHAIN_ISSUER,
      expectedOperator: CHAIN_OPERATOR,
      actualMinter: CHAIN_OPERATOR,
    });
  });

  it("rejects a receipt where a later edition (not #1) was never minted on-chain", async () => {
    const manifest = makeMultiEditionManifest();
    const receipt = makeMultiEditionReceipt(manifest);
    const { manifestPath, receiptPath } = await writeVerifyArtifacts(manifest, receipt);

    const expectedUri = convertStringToHex(manifest.metadataEndpoint);
    const expectedFee = Math.round(manifest.transferFeePercent * 1000);

    // Edition 1 (index 0) is genuinely on-chain; edition 2 (TOKEN_B) is
    // fabricated in the receipt and was never actually minted.
    mockReadNft.mockImplementation(async (_account: string, tokenId: string) => {
      if (tokenId === TOKEN_B) return null;
      return {
        nftTokenId: tokenId,
        issuer: CHAIN_ISSUER,
        uri: expectedUri,
        flags: 8,
        transferFee: expectedFee,
        taxon: 0,
      };
    });

    const result = await verifyRelease(manifestPath, receiptPath);

    expect(result.passed).toBe(false);
    const existsCheck = result.checks.find((c) => c.name === "chain-nft-exists");
    expect(existsCheck?.passed).toBe(false);
    // Must name the actual gap (2 of 3), not silently report success because
    // edition 1 alone looked fine.
    expect(existsCheck?.detail).toContain("2/3");

    // readNftFromLedger must actually have been asked about every edition,
    // not just the first.
    const checkedTokenIds = mockReadNft.mock.calls.map((call) => call[1]);
    expect(checkedTokenIds).toContain(TOKEN_A);
    expect(checkedTokenIds).toContain(TOKEN_B);
    expect(checkedTokenIds).toContain(TOKEN_C);
  });

  it("still passes when every edition of a legitimate multi-edition release is confirmed on-chain", async () => {
    const manifest = makeMultiEditionManifest();
    const receipt = makeMultiEditionReceipt(manifest);
    const { manifestPath, receiptPath } = await writeVerifyArtifacts(manifest, receipt);

    const expectedUri = convertStringToHex(manifest.metadataEndpoint);
    const expectedFee = Math.round(manifest.transferFeePercent * 1000);

    mockReadNft.mockImplementation(async (_account: string, tokenId: string) => ({
      nftTokenId: tokenId,
      issuer: CHAIN_ISSUER,
      uri: expectedUri,
      flags: 8,
      transferFee: expectedFee,
      taxon: 0,
    }));

    const result = await verifyRelease(manifestPath, receiptPath);

    expect(result.passed).toBe(true);
    const existsCheck = result.checks.find((c) => c.name === "chain-nft-exists");
    expect(existsCheck?.passed).toBe(true);
    expect(existsCheck?.detail).toContain("3/3");
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }
  });
});
