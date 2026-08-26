// @vitest-environment node
/**
 * Wave 8 — F-d597d51f: coverage for the verify_release handler, the
 * receipt/hash-chain validator the finding calls out by name ("hash-chain
 * validation ... has no corresponding test file anywhere in the repo").
 *
 * @capsule/xrpl's verifyAuthorizedMinter/readNftFromLedger make real XRPL
 * ledger requests — mocked here (same convention as
 * packages/cli/src/commands/verify-release.test.ts) so this suite is fast,
 * deterministic, and offline.
 *
 * IMPORTANT — wave 8 discovered a real defect here (see the "multi-edition
 * chain check" describe block below): verifyReleaseCmd used to
 * chain-verify only receipt.xrpl.nftTokenIds[0]. Per the wave-8 dispatch
 * ("Do NOT change handler behavior... document honestly"), that gap was
 * PINNED as current behavior rather than fixed, and reported prominently
 * in that agent's output.
 *
 * Wave 9 (Director-directed) ported the fix already applied to the
 * parallel CLI implementation (packages/cli/src/commands/verify-release.ts,
 * see that file's comment "Verify every minted edition still exists
 * on-chain — not just the first.") into verifyReleaseCmd. The
 * "multi-edition chain check" block below is now a spec test asserting the
 * fixed behavior — a fabricated edition anywhere in the set now fails
 * verification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertStringToHex } from "xrpl";
import {
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  type ReleaseManifest,
  type IssuanceReceipt,
} from "@capsule/core";

vi.mock("@capsule/xrpl", () => ({
  verifyAuthorizedMinter: vi.fn(),
  readNftFromLedger: vi.fn(),
}));

import { dispatch } from "./bridge-worker-commands";
import { verifyAuthorizedMinter, readNftFromLedger } from "@capsule/xrpl";
const mockVerifyMinter = vi.mocked(verifyAuthorizedMinter);
const mockReadNft = vi.mocked(readNftFromLedger);

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

function makeManifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
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
      summary: "Personal, non-transferable license.",
      uri: "https://example.com/releases/midnight-frequency/license",
    },
    benefit: {
      kind: "stems",
      description: "Full stem pack for personal remixing.",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: { treasuryAddress: ISSUER, multiSig: false, terms: "Standard" },
    issuerAddress: ISSUER,
    operatorAddress: OPERATOR,
    createdAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeReceipt(
  manifest: ReleaseManifest,
  tokenIds: string[],
  txHashes: string[]
): IssuanceReceipt {
  return stampReceiptHash({
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network: "testnet",
    issuedAt: "2026-04-01T08:00:00Z",
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
      mintTxHashes: txHashes,
      nftTokenIds: tokenIds,
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

async function writeArtifacts(
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt,
  tmpDirs: string[]
): Promise<{ manifestPath: string; receiptPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "capsule-verify-release-test-"));
  tmpDirs.push(dir);
  const manifestPath = join(dir, "manifest.json");
  const receiptPath = join(dir, "receipt.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
  await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");
  return { manifestPath, receiptPath };
}

describe("bridge-worker dispatch: verify_release", () => {
  const tmpDirs: string[] = [];
  const TOKEN = "000800002E71B67C4EDD9F0B5E23F7A2D8B2C9F1A6E7D4C3B2A190807060504";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  it("passes every local + chain check for a matching, untampered manifest/receipt pair", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, receipt, tmpDirs);

    const expectedUri = convertStringToHex(manifest.metadataEndpoint);
    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue({
      nftTokenId: TOKEN,
      issuer: ISSUER,
      uri: expectedUri,
      flags: 8,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
      taxon: 0,
    });

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };

    expect(result.passed).toBe(true);
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }
    const names = result.checks.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "manifest-id-match",
        "revision-hash-match",
        "receipt-integrity",
        "issuer-match",
        "operator-match",
        "transfer-fee-match",
        "edition-count",
        "metadata-pointer",
        "license-pointer",
        "cover-cid",
        "media-cid",
        "chain-minter-status",
        "chain-nft-exists",
        "chain-nft-uri",
        "chain-nft-issuer",
        "chain-nft-transfer-fee",
      ])
    );
    // Reads the operator account first, per bridge-worker-commands.ts's
    // fallback order (operator, then issuer only if not found there).
    expect(mockReadNft).toHaveBeenCalledWith(OPERATOR, TOKEN, "testnet");
  });

  it("fails manifest-id-match (and overall passed:false) when the receipt's manifestId is tampered", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const tampered = { ...receipt, manifestId: "0".repeat(64) };
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, tampered, tmpDirs);

    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue(null);

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "manifest-id-match")?.passed).toBe(false);
  });

  it("fails revision-hash-match when the manifest was edited after issuance", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    // The manifest on disk now differs from what the receipt was issued
    // against — simulates an operator editing the manifest post-mint.
    const editedManifest = { ...manifest, priceDrops: "999999999" };
    const { manifestPath, receiptPath } = await writeArtifacts(editedManifest, receipt, tmpDirs);

    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue(null);

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "revision-hash-match")?.passed).toBe(false);
    // Identity (title/artist/edition/cid/issuer) is untouched, so manifest-id
    // still matches — only the revision (full-content) hash catches this.
    expect(result.checks.find((c) => c.name === "manifest-id-match")?.passed).toBe(true);
  });

  it("fails receipt-integrity when the receipt content is tampered but receiptHash is kept stale", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const tampered = { ...receipt, issuedAt: "2099-01-01T00:00:00.000Z" };
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, tampered, tmpDirs);

    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue(null);

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "receipt-integrity")?.passed).toBe(false);
  });

  it("fails transfer-fee-match when the receipt's on-chain fee disagrees with the manifest's declared percent", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const tampered = { ...receipt, xrpl: { ...receipt.xrpl, transferFee: 1 } };
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, tampered, tmpDirs);

    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue(null);

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

    expect(result.checks.find((c) => c.name === "transfer-fee-match")?.passed).toBe(false);
  });

  it("reports chain-connectivity failure (not a thrown error) when the ledger call throws", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, receipt, tmpDirs);

    mockVerifyMinter.mockRejectedValue(new Error("ECONNREFUSED: testnet unreachable"));

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };

    expect(result.passed).toBe(false);
    const connCheck = result.checks.find((c) => c.name === "chain-connectivity");
    expect(connCheck?.passed).toBe(false);
    expect(connCheck?.detail).toContain("ECONNREFUSED");
  });

  it("falls back to the issuer address when the NFT is not found under the operator account", async () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, [TOKEN], ["TX0001"]);
    const { manifestPath, receiptPath } = await writeArtifacts(manifest, receipt, tmpDirs);

    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    const expectedUri = convertStringToHex(manifest.metadataEndpoint);
    mockReadNft.mockImplementation(async (account: string) => {
      if (account === OPERATOR) return null;
      return {
        nftTokenId: TOKEN,
        issuer: ISSUER,
        uri: expectedUri,
        flags: 8,
        transferFee: Math.round(manifest.transferFeePercent * 1000),
        taxon: 0,
      };
    });

    const result = (await dispatch({
      command: "verify_release",
      params: { manifestPath, receiptPath },
    })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

    expect(result.checks.find((c) => c.name === "chain-nft-exists")?.passed).toBe(true);
    expect(mockReadNft).toHaveBeenCalledWith(OPERATOR, TOKEN, "testnet");
    expect(mockReadNft).toHaveBeenCalledWith(ISSUER, TOKEN, "testnet");
  });

  it("rejects (dispatch throws) when the receipt file is missing", async () => {
    const manifest = makeManifest();
    const dir = await mkdtemp(join(tmpdir(), "capsule-verify-release-test-"));
    tmpDirs.push(dir);
    const manifestPath = join(dir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
    const missingReceiptPath = join(dir, "nonexistent-receipt.json");

    await expect(
      dispatch({
        command: "verify_release",
        params: { manifestPath, receiptPath: missingReceiptPath },
      })
    ).rejects.toThrow();
  });

  it("rejects when the receipt on disk fails assertReceipt's schema (malformed input feeding the error banner)", async () => {
    const manifest = makeManifest();
    const { manifestPath } = await writeArtifacts(manifest, makeReceipt(manifest, [TOKEN], ["TX0001"]), tmpDirs);
    const dir = await mkdtemp(join(tmpdir(), "capsule-verify-release-test-"));
    tmpDirs.push(dir);
    const badReceiptPath = join(dir, "bad-receipt.json");
    await writeFile(badReceiptPath, JSON.stringify({ not: "a receipt" }), "utf-8");

    await expect(
      dispatch({
        command: "verify_release",
        params: { manifestPath, receiptPath: badReceiptPath },
      })
    ).rejects.toThrow(/Invalid Issuance Receipt/);
  });

  /**
   * SPEC (wave 9, Director-directed port) — see file header. Wave 8 pinned
   * a real defect here: verifyReleaseCmd's chain-verification block used to
   * read only receipt.xrpl.nftTokenIds[0], so editions 2..N of a
   * multi-edition release were never checked against the ledger. That gap
   * is now closed by porting the per-edition loop already proven in
   * packages/cli/src/commands/verify-release.ts (see that file's comment
   * "Verify every minted edition still exists on-chain — not just the
   * first."). This test now asserts the fixed behavior: a fabricated
   * edition anywhere in the set — not just edition 1 — fails verification.
   */
  describe("multi-edition chain check", () => {
    it("fails chain-nft-exists and overall passed:false when edition 2 of 3 was fabricated (never actually minted)", async () => {
      const manifest = makeManifest({ editionSize: 3 });
      const TOKEN_A = "AAAA0000000000000000000000000000000000000000000000000000000001";
      const TOKEN_B = "AAAA0000000000000000000000000000000000000000000000000000000002";
      const TOKEN_C = "AAAA0000000000000000000000000000000000000000000000000000000003";
      const receipt = makeReceipt(
        manifest,
        [TOKEN_A, TOKEN_B, TOKEN_C],
        ["TX0001", "TX0002", "TX0003"]
      );
      const { manifestPath, receiptPath } = await writeArtifacts(manifest, receipt, tmpDirs);

      mockVerifyMinter.mockResolvedValue({
        verified: true,
        issuerAddress: ISSUER,
        expectedOperator: OPERATOR,
        actualMinter: OPERATOR,
      });
      const expectedUri = convertStringToHex(manifest.metadataEndpoint);
      const expectedFee = Math.round(manifest.transferFeePercent * 1000);
      // TOKEN_B ("edition 2") was never actually minted on-chain — it does
      // not exist under either the operator or issuer account. A correct
      // implementation checking every edition must fail chain-nft-exists.
      mockReadNft.mockImplementation(async (_account: string, tokenId: string) => {
        if (tokenId === TOKEN_B) return null;
        return {
          nftTokenId: tokenId,
          issuer: ISSUER,
          uri: expectedUri,
          flags: 8,
          transferFee: expectedFee,
          taxon: 0,
        };
      });

      const result = (await dispatch({
        command: "verify_release",
        params: { manifestPath, receiptPath },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };

      // Fixed behavior: the fabricated edition 2 sinks the overall result,
      // even though edition 1 (checked first) is genuine.
      expect(result.passed).toBe(false);
      const existsCheck = result.checks.find((c) => c.name === "chain-nft-exists");
      expect(existsCheck?.passed).toBe(false);
      expect(existsCheck?.detail).toContain("2/3");

      // Proves it structurally, not just by outcome: every edition is
      // actually queried against the ledger now, not just edition 1.
      const checkedTokenIds = mockReadNft.mock.calls.map((call) => call[1]);
      expect(checkedTokenIds).toContain(TOKEN_A);
      expect(checkedTokenIds).toContain(TOKEN_B);
      expect(checkedTokenIds).toContain(TOKEN_C);
    });

    it("passes chain-nft-exists/uri/issuer/transfer-fee (and overall passed:true) when all 3 editions are genuine", async () => {
      const manifest = makeManifest({ editionSize: 3 });
      const TOKEN_A = "AAAA0000000000000000000000000000000000000000000000000000000001";
      const TOKEN_B = "AAAA0000000000000000000000000000000000000000000000000000000002";
      const TOKEN_C = "AAAA0000000000000000000000000000000000000000000000000000000003";
      const receipt = makeReceipt(
        manifest,
        [TOKEN_A, TOKEN_B, TOKEN_C],
        ["TX0001", "TX0002", "TX0003"]
      );
      const { manifestPath, receiptPath } = await writeArtifacts(manifest, receipt, tmpDirs);

      mockVerifyMinter.mockResolvedValue({
        verified: true,
        issuerAddress: ISSUER,
        expectedOperator: OPERATOR,
        actualMinter: OPERATOR,
      });
      const expectedUri = convertStringToHex(manifest.metadataEndpoint);
      const expectedFee = Math.round(manifest.transferFeePercent * 1000);
      // All three editions genuinely exist on-chain under the operator
      // account, with matching URI/issuer/transfer fee.
      mockReadNft.mockImplementation(async (_account: string, tokenId: string) => ({
        nftTokenId: tokenId,
        issuer: ISSUER,
        uri: expectedUri,
        flags: 8,
        transferFee: expectedFee,
        taxon: 0,
      }));

      const result = (await dispatch({
        command: "verify_release",
        params: { manifestPath, receiptPath },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };

      expect(result.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "chain-nft-exists")?.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "chain-nft-uri")?.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "chain-nft-issuer")?.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "chain-nft-transfer-fee")?.passed).toBe(true);

      const checkedTokenIds = mockReadNft.mock.calls.map((call) => call[1]);
      expect(checkedTokenIds).toContain(TOKEN_A);
      expect(checkedTokenIds).toContain(TOKEN_B);
      expect(checkedTokenIds).toContain(TOKEN_C);
    });
  });
});
