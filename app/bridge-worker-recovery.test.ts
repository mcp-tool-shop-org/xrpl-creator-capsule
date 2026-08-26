// @vitest-environment node
/**
 * Wave 8 — F-d597d51f: coverage for the recovery handler group —
 * recover_release, verify_recovery.
 *
 * @capsule/xrpl's verifyAuthorizedMinter/readNftFromLedger make real XRPL
 * ledger requests — mocked here so this suite is fast, deterministic, and
 * offline (same convention as bridge-worker-verify-release.test.ts).
 *
 * IMPORTANT — same defect class as verify_release (see
 * bridge-worker-verify-release.test.ts's file header for the full writeup
 * and the CLI reference fix): recoverReleaseCmd's chain-verification block
 * also used to read only receipt.xrpl.nftTokenIds[0]. Wave 8 pinned this as
 * current behavior; wave 9 (Director-directed) ported the fix already
 * applied to packages/cli/src/commands/recover-release.ts (per-edition
 * ledger loop) into recoverReleaseCmd. The "recover_release" pin test below
 * is now a spec test asserting the fixed behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  deriveRecoveryBundle,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
  type RecoveryBundle,
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
const TOKEN = "000800002E71B67C4EDD9F0B5E23F7A2D8B2C9F1A6E7D4C3B2A190807060504";

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
  tokenIds: string[] = [TOKEN],
  txHashes: string[] = ["TX0001"]
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
      transferFee: 5000,
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

describe("bridge-worker dispatch: recovery handlers", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyMinter.mockResolvedValue({
      verified: true,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: OPERATOR,
    });
    mockReadNft.mockResolvedValue({
      nftTokenId: TOKEN,
      issuer: ISSUER,
      uri: "deadbeef",
      flags: 8,
      transferFee: 5000,
      taxon: 0,
    });
  });

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function tmpDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-recovery-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  // ── recover_release ──────────────────────────────────────────────

  describe("recover_release", () => {
    it("derives a bundle consistent with its source artifacts and reports allPassed:true on the happy path", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath },
      })) as {
        bundle: RecoveryBundle;
        verification: { valid: boolean };
        chainChecks: Array<{ name: string; passed: boolean }>;
        allPassed: boolean;
      };

      expect(result.bundle.manifestId).toBe(computeManifestId(manifest));
      expect(result.bundle.tokenIds).toEqual(receipt.xrpl.nftTokenIds);
      expect(result.bundle.accessPolicyLabel).toBeUndefined();
      expect(result.verification.valid).toBe(true);
      for (const check of result.chainChecks) {
        expect(check.passed).toBe(true);
      }
      expect(result.allPassed).toBe(true);
    });

    it("attaches accessPolicyLabel and qualifyingTokenIds when a policy is provided", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const policy: AccessPolicy = {
        schemaVersion: "1.0.0",
        kind: "access-policy",
        manifestId: computeManifestId(manifest),
        label: "Bonus pack",
        benefit: { kind: "stems", contentPointer: manifest.benefit.contentPointer },
        rule: { type: "holds-nft", issuerAddress: ISSUER, qualifyingTokenIds: [TOKEN] },
        delivery: { mode: "download-token", ttlSeconds: 3600 },
        createdAt: "2026-04-01T09:00:00Z",
      };
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      const policyPath = join(dir, "policy.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");
      await writeFile(policyPath, JSON.stringify(policy), "utf-8");

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath, policyPath },
      })) as { bundle: RecoveryBundle };

      expect(result.bundle.accessPolicyLabel).toBe("Bonus pack");
      expect(result.bundle.qualifyingTokenIds).toEqual([TOKEN]);
    });

    it("writes the bundle to outputPath when provided", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      const outputPath = join(dir, "bundle.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath, outputPath },
      })) as { bundle: RecoveryBundle };

      const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
      expect(onDisk).toEqual(result.bundle);
    });

    it("catches a hand-edited receipt (stale receiptHash) via its own immediate self-verification, even though it derives the bundle from that same receipt", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      // Simulates a receipt file edited on disk without re-stamping —
      // receiptHash still reflects the pre-edit content.
      const tamperedReceipt = { ...receipt, issuedAt: "2099-01-01T00:00:00.000Z" };
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(tamperedReceipt), "utf-8");

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath },
      })) as { verification: { valid: boolean; checks: Array<{ name: string; passed: boolean }> } };

      expect(result.verification.valid).toBe(false);
      expect(result.verification.checks.find((c) => c.name === "receipt-hash")?.passed).toBe(false);
    });

    it("reports allPassed:false and a chain-minter-status failure when the authorized minter cannot be confirmed", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");

      mockVerifyMinter.mockResolvedValue({
        verified: false,
        issuerAddress: ISSUER,
        expectedOperator: OPERATOR,
        actualMinter: undefined,
        error: "No NFTokenMinter set on issuer account",
      });

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath },
      })) as { chainChecks: Array<{ name: string; passed: boolean }>; allPassed: boolean };

      expect(result.chainChecks.find((c) => c.name === "chain-minter-status")?.passed).toBe(false);
      expect(result.allPassed).toBe(false);
    });

    it("rejects when the manifest file is missing", async () => {
      const dir = await tmpDir();
      const receiptPath = join(dir, "receipt.json");
      await writeFile(receiptPath, JSON.stringify(makeReceipt(makeManifest())), "utf-8");

      await expect(
        dispatch({
          command: "recover_release",
          params: { manifestPath: join(dir, "missing-manifest.json"), receiptPath },
        })
      ).rejects.toThrow();
    });

    /**
     * SPEC (wave 9, Director-directed port) — see file header. Mirrors the
     * identical fix already ported for verify_release: recoverReleaseCmd's
     * chain-verification block now loops every entry in
     * receipt.xrpl.nftTokenIds (matching
     * packages/cli/src/commands/recover-release.ts's "Verify every minted
     * edition still exists on-chain — not just the first" loop), so a
     * fabricated edition anywhere in the set sinks allPassed.
     */
    it("fails chain-nft-exists and overall allPassed:false when edition 2 of 3 was fabricated (never actually minted)", async () => {
      const manifest = makeManifest({ editionSize: 3 });
      const TOKEN_A = "AAAA0000000000000000000000000000000000000000000000000000000001";
      const TOKEN_B = "AAAA0000000000000000000000000000000000000000000000000000000002";
      const TOKEN_C = "AAAA0000000000000000000000000000000000000000000000000000000003";
      const receipt = makeReceipt(manifest, [TOKEN_A, TOKEN_B, TOKEN_C], ["TX1", "TX2", "TX3"]);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");

      // TOKEN_B ("edition 2") was never actually minted — absent from the
      // ledger under either account. The per-edition loop must surface
      // this instead of only checking edition 1.
      mockReadNft.mockImplementation(async (_account: string, tokenId: string) => {
        if (tokenId === TOKEN_B) return null;
        return { nftTokenId: tokenId, issuer: ISSUER, uri: "deadbeef", flags: 8, transferFee: 5000, taxon: 0 };
      });

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath },
      })) as { chainChecks: Array<{ name: string; passed: boolean; detail: string }>; allPassed: boolean };

      // Fixed behavior: the fabricated edition 2 sinks allPassed, even
      // though edition 1 (checked first) is genuine.
      expect(result.allPassed).toBe(false);
      const existsCheck = result.chainChecks.find((c) => c.name === "chain-nft-exists");
      expect(existsCheck?.passed).toBe(false);
      expect(existsCheck?.detail).toContain("2/3");

      // Proves it structurally: every edition is actually queried against
      // the ledger now, not just edition 1.
      const checkedTokenIds = mockReadNft.mock.calls.map((call) => call[1]);
      expect(checkedTokenIds).toContain(TOKEN_A);
      expect(checkedTokenIds).toContain(TOKEN_B);
      expect(checkedTokenIds).toContain(TOKEN_C);
    });

    it("reports allPassed:true with all 3 editions confirmed when every edition is genuine", async () => {
      const manifest = makeManifest({ editionSize: 3 });
      const TOKEN_A = "AAAA0000000000000000000000000000000000000000000000000000000001";
      const TOKEN_B = "AAAA0000000000000000000000000000000000000000000000000000000002";
      const TOKEN_C = "AAAA0000000000000000000000000000000000000000000000000000000003";
      const receipt = makeReceipt(manifest, [TOKEN_A, TOKEN_B, TOKEN_C], ["TX1", "TX2", "TX3"]);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");

      // All three editions genuinely exist on-chain under the operator
      // account.
      mockReadNft.mockImplementation(async (_account: string, tokenId: string) => ({
        nftTokenId: tokenId,
        issuer: ISSUER,
        uri: "deadbeef",
        flags: 8,
        transferFee: 5000,
        taxon: 0,
      }));

      const result = (await dispatch({
        command: "recover_release",
        params: { manifestPath, receiptPath },
      })) as { chainChecks: Array<{ name: string; passed: boolean; detail: string }>; allPassed: boolean };

      expect(result.allPassed).toBe(true);
      const existsCheck = result.chainChecks.find((c) => c.name === "chain-nft-exists");
      expect(existsCheck?.passed).toBe(true);
      expect(existsCheck?.detail).toContain("3/3");

      const checkedTokenIds = mockReadNft.mock.calls.map((call) => call[1]);
      expect(checkedTokenIds).toContain(TOKEN_A);
      expect(checkedTokenIds).toContain(TOKEN_B);
      expect(checkedTokenIds).toContain(TOKEN_C);
    });
  });

  // ── verify_recovery ──────────────────────────────────────────────

  describe("verify_recovery", () => {
    async function writeVerifyRecoveryFixtures(): Promise<{
      manifest: ReleaseManifest;
      receipt: IssuanceReceipt;
      bundle: RecoveryBundle;
      manifestPath: string;
      receiptPath: string;
      bundlePath: string;
    }> {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const bundle = deriveRecoveryBundle(manifest, receipt);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      const bundlePath = join(dir, "bundle.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");
      await writeFile(bundlePath, JSON.stringify(bundle), "utf-8");
      return { manifest, receipt, bundle, manifestPath, receiptPath, bundlePath };
    }

    it("reports valid:true for a bundle genuinely derived from the given manifest/receipt", async () => {
      const { manifestPath, receiptPath, bundlePath } = await writeVerifyRecoveryFixtures();

      const result = (await dispatch({
        command: "verify_recovery",
        params: { manifestPath, receiptPath, bundlePath },
      })) as { valid: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.valid).toBe(true);
      for (const check of result.checks) {
        expect(check.passed).toBe(true);
      }
    });

    it("detects a bundle whose title was edited after generation (bundleHash now stale)", async () => {
      const { manifestPath, receiptPath, bundle, bundlePath } = await writeVerifyRecoveryFixtures();
      const tampered = { ...bundle, title: "Not The Real Title" };
      await writeFile(bundlePath, JSON.stringify(tampered), "utf-8");

      const result = (await dispatch({
        command: "verify_recovery",
        params: { manifestPath, receiptPath, bundlePath },
      })) as { valid: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.name === "bundle-integrity")?.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "title")?.passed).toBe(false);
    });

    it("detects a bundle presented for a manifest it was never derived from", async () => {
      const { receiptPath, bundlePath } = await writeVerifyRecoveryFixtures();
      const otherManifest = makeManifest({ title: "A Completely Different Release" });
      const dir = await tmpDir();
      const otherManifestPath = join(dir, "other-manifest.json");
      await writeFile(otherManifestPath, JSON.stringify(otherManifest), "utf-8");

      const result = (await dispatch({
        command: "verify_recovery",
        params: { manifestPath: otherManifestPath, receiptPath, bundlePath },
      })) as { valid: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.name === "manifest-id")?.passed).toBe(false);
    });

    it("checks accessPolicyLabel consistency when a policy is supplied", async () => {
      const manifest = makeManifest();
      const receipt = makeReceipt(manifest);
      const policy: AccessPolicy = {
        schemaVersion: "1.0.0",
        kind: "access-policy",
        manifestId: computeManifestId(manifest),
        label: "Real Label",
        benefit: { kind: "stems", contentPointer: manifest.benefit.contentPointer },
        rule: { type: "holds-nft", issuerAddress: ISSUER, qualifyingTokenIds: [TOKEN] },
        delivery: { mode: "download-token", ttlSeconds: 3600 },
        createdAt: "2026-04-01T09:00:00Z",
      };
      const bundle = deriveRecoveryBundle(manifest, receipt, policy);
      const dir = await tmpDir();
      const manifestPath = join(dir, "manifest.json");
      const receiptPath = join(dir, "receipt.json");
      const policyPath = join(dir, "policy.json");
      const bundlePath = join(dir, "bundle.json");
      await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
      await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");
      await writeFile(policyPath, JSON.stringify(policy), "utf-8");
      // Corrupt only the bundle's policy label pointer, independent of the
      // policy file itself.
      await writeFile(bundlePath, JSON.stringify({ ...bundle, accessPolicyLabel: "Wrong Label" }), "utf-8");

      const result = (await dispatch({
        command: "verify_recovery",
        params: { manifestPath, receiptPath, policyPath, bundlePath },
      })) as { valid: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.name === "access-policy")?.passed).toBe(false);
    });

    it("rejects when the bundle file is missing", async () => {
      const { manifestPath, receiptPath } = await writeVerifyRecoveryFixtures();
      const dir = await tmpDir();
      await expect(
        dispatch({
          command: "verify_recovery",
          params: { manifestPath, receiptPath, bundlePath: join(dir, "missing-bundle.json") },
        })
      ).rejects.toThrow();
    });
  });
});
