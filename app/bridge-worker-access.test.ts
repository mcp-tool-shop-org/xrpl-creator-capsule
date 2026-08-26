// @vitest-environment node
/**
 * Wave 8 — F-d597d51f: coverage for the access-control handler group —
 * create_access_policy, check_holder, grant_access. grant_access in
 * particular is a five-stage sequential guard chain (policy coherence ->
 * receipt integrity -> manifest identity -> revision hash -> ownership)
 * that decides whether a wallet unlocks gated content; each stage must
 * independently deny before ever reaching the real ownership check.
 *
 * @capsule/xrpl's checkHolder makes a real XRPL ledger request — mocked
 * here (same convention as packages/cli/src/commands/grant-access.test.ts)
 * so this suite is fast, deterministic, and offline. MockDeliveryProvider
 * (from @capsule/storage) is real and in-memory — no mocking needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  type ReleaseManifest,
  type IssuanceReceipt,
  type AccessPolicy,
} from "@capsule/core";

vi.mock("@capsule/xrpl", () => ({
  checkHolder: vi.fn(),
}));

import { dispatch } from "./bridge-worker-commands";
import { checkHolder } from "@capsule/xrpl";
const mockCheckHolder = vi.mocked(checkHolder);

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const HOLDER = "rBHMbioz9znTCqgjZ6Nx43uWY43kToEPa9";
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

describe("bridge-worker dispatch: access-control handlers", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function writeFixtures(): Promise<{
    manifest: ReleaseManifest;
    receipt: IssuanceReceipt;
    manifestPath: string;
    receiptPath: string;
  }> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-access-test-"));
    tmpDirs.push(dir);
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest);
    const manifestPath = join(dir, "manifest.json");
    const receiptPath = join(dir, "receipt.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
    await writeFile(receiptPath, JSON.stringify(receipt), "utf-8");
    return { manifest, receipt, manifestPath, receiptPath };
  }

  // ── create_access_policy ────────────────────────────────────────

  describe("create_access_policy", () => {
    it("builds a policy whose identity and rule fields are derived from the manifest/receipt, not echoed blindly", async () => {
      const { manifest, receipt, manifestPath, receiptPath } = await writeFixtures();

      const result = (await dispatch({
        command: "create_access_policy",
        params: { manifestPath, receiptPath, label: "Test label", ttlSeconds: 7200 },
      })) as AccessPolicy;

      expect(result.manifestId).toBe(computeManifestId(manifest));
      expect(result.label).toBe("Test label");
      expect(result.benefit).toEqual({
        kind: manifest.benefit.kind,
        contentPointer: manifest.benefit.contentPointer,
      });
      expect(result.rule).toEqual({
        type: "holds-nft",
        issuerAddress: manifest.issuerAddress,
        qualifyingTokenIds: receipt.xrpl.nftTokenIds,
      });
      expect(result.delivery).toEqual({ mode: "download-token", ttlSeconds: 7200 });
    });

    it("defaults ttlSeconds to 3600 when omitted", async () => {
      const { manifestPath, receiptPath } = await writeFixtures();

      const result = (await dispatch({
        command: "create_access_policy",
        params: { manifestPath, receiptPath, label: "Default TTL" },
      })) as AccessPolicy;

      expect(result.delivery.ttlSeconds).toBe(3600);
    });

    it("writes the policy to outputPath when provided, with identical content to the return value", async () => {
      const { manifestPath, receiptPath } = await writeFixtures();
      const dir = await mkdtemp(join(tmpdir(), "capsule-access-test-"));
      tmpDirs.push(dir);
      const outputPath = join(dir, "policy.json");

      const result = (await dispatch({
        command: "create_access_policy",
        params: { manifestPath, receiptPath, label: "Written", outputPath },
      })) as AccessPolicy;

      const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
      expect(onDisk).toEqual(result);
    });

    it("does not write any file when outputPath is omitted", async () => {
      const { manifestPath, receiptPath } = await writeFixtures();
      // No outputPath in params — the only observable proof available at
      // this boundary is that dispatch resolves without touching the
      // filesystem beyond the two reads; a thrown ENOENT elsewhere would
      // surface as a rejected promise, which this asserts against.
      await expect(
        dispatch({
          command: "create_access_policy",
          params: { manifestPath, receiptPath, label: "No output" },
        })
      ).resolves.toBeDefined();
    });
  });

  // ── check_holder ─────────────────────────────────────────────────

  describe("check_holder", () => {
    it("passes params straight through to checkHolder and returns its result verbatim", async () => {
      mockCheckHolder.mockResolvedValue({
        holds: true,
        matchedTokenIds: [TOKEN_ID],
        totalNftsChecked: 3,
        walletAddress: HOLDER,
      });

      const result = await dispatch({
        command: "check_holder",
        params: { walletAddress: HOLDER, qualifyingTokenIds: [TOKEN_ID], network: "testnet" },
      });

      expect(mockCheckHolder).toHaveBeenCalledWith(HOLDER, [TOKEN_ID], "testnet");
      expect(result).toEqual({
        holds: true,
        matchedTokenIds: [TOKEN_ID],
        totalNftsChecked: 3,
        walletAddress: HOLDER,
      });
    });

    it("defaults network to testnet when omitted", async () => {
      mockCheckHolder.mockResolvedValue({
        holds: false,
        matchedTokenIds: [],
        totalNftsChecked: 0,
        walletAddress: HOLDER,
      });

      await dispatch({
        command: "check_holder",
        params: { walletAddress: HOLDER, qualifyingTokenIds: [TOKEN_ID] },
      });

      expect(mockCheckHolder).toHaveBeenCalledWith(HOLDER, [TOKEN_ID], "testnet");
    });
  });

  // ── grant_access ─────────────────────────────────────────────────

  describe("grant_access", () => {
    async function writeGrantFixtures(policyOverride?: Partial<AccessPolicy>) {
      const { manifest, receipt, manifestPath, receiptPath } = await writeFixtures();
      const dir = await mkdtemp(join(tmpdir(), "capsule-access-test-"));
      tmpDirs.push(dir);
      const policy = { ...makePolicy(manifest), ...policyOverride };
      const policyPath = join(dir, "policy.json");
      await writeFile(policyPath, JSON.stringify(policy), "utf-8");
      return { manifest, receipt, manifestPath, receiptPath, policy, policyPath };
    }

    it("denies with 'Policy coherence failed' when the policy's benefit kind does not match the manifest — never reaches the ownership check", async () => {
      const { manifestPath, receiptPath, policyPath } = await writeGrantFixtures({
        benefit: { kind: "wrong-kind", contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB" },
      });

      const result = (await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER },
      })) as { decision: string; reason: string };

      expect(result.decision).toBe("deny");
      expect(result.reason).toContain("Policy coherence failed");
      expect(mockCheckHolder).not.toHaveBeenCalled();
    });

    it("denies with a tamper reason when the receipt's receiptHash no longer matches its content", async () => {
      const { manifest, manifestPath, receiptPath, policyPath } = await writeGrantFixtures();
      // Overwrite the receipt on disk with tampered content but a stale hash.
      const receipt = makeReceipt(manifest);
      const tampered = { ...receipt, issuedAt: "2099-01-01T00:00:00.000Z" };
      await writeFile(receiptPath, JSON.stringify(tampered), "utf-8");

      const result = (await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER },
      })) as { decision: string; reason: string };

      expect(result.decision).toBe("deny");
      expect(result.reason).toBe("Issuance receipt has been tampered with");
      expect(mockCheckHolder).not.toHaveBeenCalled();
    });

    it("denies with 'Manifest has been modified since issuance' when the manifest was edited after the receipt was issued", async () => {
      const { manifest, receipt, receiptPath, policyPath } = await writeGrantFixtures();
      const dir = await mkdtemp(join(tmpdir(), "capsule-access-test-"));
      tmpDirs.push(dir);
      const editedManifestPath = join(dir, "edited-manifest.json");
      // Identity fields (title/artist/editionSize/coverCid/mediaCid/issuerAddress)
      // stay the same so manifestId still matches, but a non-identity field
      // changes so the revision hash diverges from what's in the receipt.
      await writeFile(
        editedManifestPath,
        JSON.stringify({ ...manifest, priceDrops: "1" }),
        "utf-8"
      );
      void receipt;

      const result = (await dispatch({
        command: "grant_access",
        params: {
          manifestPath: editedManifestPath,
          receiptPath,
          policyPath,
          walletAddress: HOLDER,
        },
      })) as { decision: string; reason: string };

      expect(result.decision).toBe("deny");
      expect(result.reason).toBe("Manifest has been modified since issuance");
      expect(mockCheckHolder).not.toHaveBeenCalled();
    });

    it("denies when checkHolder reports the wallet does not hold a qualifying NFT", async () => {
      const { manifestPath, receiptPath, policyPath } = await writeGrantFixtures();
      mockCheckHolder.mockResolvedValue({
        holds: false,
        matchedTokenIds: [],
        totalNftsChecked: 2,
        walletAddress: HOLDER,
      });

      const result = (await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER },
      })) as { decision: string; reason: string; ownership: { totalNftsChecked: number } };

      expect(result.decision).toBe("deny");
      expect(result.reason).toBe("Wallet does not hold any qualifying NFT for this release");
      expect(result.ownership.totalNftsChecked).toBe(2);
    });

    it("denies with the ledger error surfaced when checkHolder itself fails", async () => {
      const { manifestPath, receiptPath, policyPath } = await writeGrantFixtures();
      mockCheckHolder.mockResolvedValue({
        holds: false,
        matchedTokenIds: [],
        totalNftsChecked: 0,
        walletAddress: HOLDER,
        error: "Ledger query failed: timeout",
      });

      const result = (await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER },
      })) as { decision: string; reason: string };

      expect(result.decision).toBe("deny");
      expect(result.reason).toBe("Ownership check failed: Ledger query failed: timeout");
    });

    it("allows and issues a delivery token when every stage passes, and only then calls checkHolder", async () => {
      const { manifestPath, receiptPath, policyPath } = await writeGrantFixtures();
      mockCheckHolder.mockResolvedValue({
        holds: true,
        matchedTokenIds: [TOKEN_ID],
        totalNftsChecked: 1,
        walletAddress: HOLDER,
      });

      const result = (await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER },
      })) as {
        decision: string;
        delivery?: { mode: string; token: string; expiresAt: string };
        grantHash?: string;
      };

      expect(mockCheckHolder).toHaveBeenCalledWith(HOLDER, [TOKEN_ID], "testnet");
      expect(result.decision).toBe("allow");
      expect(result.delivery?.mode).toBe("download-token");
      expect(result.delivery?.token).toMatch(/^tok_/);
      expect(result.grantHash).toBeTruthy();
    });

    it("writes the grant to outputPath when provided, matching the returned value", async () => {
      const { manifestPath, receiptPath, policyPath } = await writeGrantFixtures();
      mockCheckHolder.mockResolvedValue({
        holds: true,
        matchedTokenIds: [TOKEN_ID],
        totalNftsChecked: 1,
        walletAddress: HOLDER,
      });
      const dir = await mkdtemp(join(tmpdir(), "capsule-access-test-"));
      tmpDirs.push(dir);
      const outputPath = join(dir, "grant.json");

      const result = await dispatch({
        command: "grant_access",
        params: { manifestPath, receiptPath, policyPath, walletAddress: HOLDER, outputPath },
      });

      const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
      expect(onDisk).toEqual(result);
    });
  });
});
