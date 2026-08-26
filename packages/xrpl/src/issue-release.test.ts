import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReleaseManifest } from "@capsule/core";
import type { ContentStore } from "@capsule/storage";
import { generateWalletPair, type WalletPair } from "./wallet.js";
import type { MinterVerification } from "./verify-minter.js";
import type { MintResult } from "./mint.js";

const { mockVerifyAuthorizedMinter } = vi.hoisted(() => {
  return { mockVerifyAuthorizedMinter: vi.fn() };
});

vi.mock("./verify-minter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./verify-minter.js")>();
  return {
    ...actual,
    verifyAuthorizedMinter: mockVerifyAuthorizedMinter,
  };
});

const { mockMintRelease } = vi.hoisted(() => {
  return { mockMintRelease: vi.fn() };
});

vi.mock("./mint.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mint.js")>();
  return {
    ...actual,
    mintRelease: mockMintRelease,
  };
});

import { issueRelease } from "./issue-release.js";

function makeManifest(
  pair: WalletPair,
  overrides?: Partial<ReleaseManifest>
): ReleaseManifest {
  return {
    schemaVersion: "1.0.0",
    title: "Midnight Frequency",
    artist: "Vex Morrow",
    editionSize: 3,
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
      treasuryAddress: pair.issuer.address,
      multiSig: false,
      terms: "Single artist.",
    },
    issuerAddress: pair.issuer.address,
    operatorAddress: pair.operator.address,
    createdAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Minimal in-memory ContentStore whose `has()` result is fully controlled
 * by the test — unlike @capsule/storage's MockContentStore (which derives
 * CIDs from content hashes via put()), this lets a test assert a specific,
 * fixed manifest CID is present or absent without fighting that scheme.
 */
class FakeContentStore implements ContentStore {
  constructor(private resolved: Set<string>) {}
  async put(content: Uint8Array): Promise<string> {
    return `fake-${content.length}`;
  }
  async get(): Promise<Uint8Array | null> {
    return null;
  }
  async has(cid: string): Promise<boolean> {
    return this.resolved.has(cid);
  }
}

function verifiedMinter(operatorAddress: string): MinterVerification {
  return {
    verified: true,
    issuerAddress: "rISSUER",
    expectedOperator: operatorAddress,
    actualMinter: operatorAddress,
  };
}

function mintResult(overrides?: Partial<MintResult>): MintResult {
  return {
    tokenIds: ["NFT_1"],
    txHashes: ["MINT_HASH_1"],
    network: "testnet",
    ...overrides,
  };
}

beforeEach(() => {
  mockVerifyAuthorizedMinter.mockReset();
  mockMintRelease.mockReset();
});

describe("issueRelease — storage resolution pre-flight (F-b09d1d8a)", () => {
  // F-b09d1d8a (HIGH): a false from storage.has() for media/coverCid used to
  // only append a warning and minting proceeded anyway — permanently baking
  // a broken URI on-chain with no flag to require resolution first. Half 1:
  // by default, an unresolved CID must now be a hard pre-flight error that
  // blocks minting entirely (mintRelease must never even be called). Half
  // 2 (must-not-regress baseline): passing allowUnresolvedStorage: true
  // must preserve the exact old warn-and-proceed behavior.

  it("throws before minting when the media CID is unresolved in storage (default)", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair);
    // Cover resolved, media NOT resolved.
    const storage = new FakeContentStore(new Set([manifest.coverCid]));
    mockVerifyAuthorizedMinter.mockResolvedValue(
      verifiedMinter(pair.operator.address)
    );
    mockMintRelease.mockResolvedValue(mintResult());

    await expect(
      issueRelease({
        manifest,
        wallets: pair,
        network: "testnet",
        storage,
        storageProvider: "mock",
      })
    ).rejects.toThrow(/Media CID .* not found in storage/);

    expect(mockMintRelease).not.toHaveBeenCalled();
    expect(mockVerifyAuthorizedMinter).not.toHaveBeenCalled();
  });

  it("throws before minting when the cover CID is unresolved in storage (default)", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair);
    // Media resolved, cover NOT resolved.
    const storage = new FakeContentStore(new Set([manifest.mediaCid]));
    mockVerifyAuthorizedMinter.mockResolvedValue(
      verifiedMinter(pair.operator.address)
    );
    mockMintRelease.mockResolvedValue(mintResult());

    await expect(
      issueRelease({
        manifest,
        wallets: pair,
        network: "testnet",
        storage,
        storageProvider: "mock",
      })
    ).rejects.toThrow(/Cover CID .* not found in storage/);

    expect(mockMintRelease).not.toHaveBeenCalled();
  });

  it("still mints and only warns (does not error) when allowUnresolvedStorage is explicitly true", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair);
    const storage = new FakeContentStore(new Set()); // nothing resolved
    mockVerifyAuthorizedMinter.mockResolvedValue(
      verifiedMinter(pair.operator.address)
    );
    mockMintRelease.mockResolvedValue(mintResult());

    const receipt = await issueRelease({
      manifest,
      wallets: pair,
      network: "testnet",
      storage,
      storageProvider: "mock",
      allowUnresolvedStorage: true,
    });

    expect(mockMintRelease).toHaveBeenCalledTimes(1);
    expect(receipt.verification.errors).toEqual([]);
    expect(receipt.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Media CID .* not found in storage/),
        expect.stringMatching(/Cover CID .* not found in storage/),
      ])
    );
    expect(receipt.storage.mediaResolved).toBe(false);
    expect(receipt.storage.coverResolved).toBe(false);
  });
});

describe("issueRelease — authorizedMinterTxHash pass-through (F-e20f853d, paired with F-abd9c7e0)", () => {
  // F-e20f853d (MEDIUM): `authorizedMinterTxHash: minterCheck.actualMinter
  // ? undefined : undefined` evaluated to undefined on EVERY path — both
  // ternary arms were identical, so the receipt's minter-authorization
  // audit trail was always empty. verifyAuthorizedMinter is a read-only
  // account_info call with no tx hash of its own (see MinterVerification —
  // no hash field exists on it), so the only place a real hash can come
  // from is the earlier authorizeOperatorAsMinter step (fixed under
  // F-abd9c7e0 in wallet.ts to actually return one) — the caller must
  // thread it through as an option.

  it("carries the real authorization tx hash into the receipt when supplied by the caller", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair);
    const storage = new FakeContentStore(
      new Set([manifest.mediaCid, manifest.coverCid])
    );
    mockVerifyAuthorizedMinter.mockResolvedValue(
      verifiedMinter(pair.operator.address)
    );
    mockMintRelease.mockResolvedValue(mintResult());

    const receipt = await issueRelease({
      manifest,
      wallets: pair,
      network: "testnet",
      storage,
      storageProvider: "mock",
      authorizedMinterTxHash: "ACCOUNTSET_TX_HASH_REAL",
    });

    expect(receipt.xrpl.authorizedMinterTxHash).toBe(
      "ACCOUNTSET_TX_HASH_REAL"
    );
  });

  it("leaves authorizedMinterTxHash undefined when the caller does not supply one", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair);
    const storage = new FakeContentStore(
      new Set([manifest.mediaCid, manifest.coverCid])
    );
    mockVerifyAuthorizedMinter.mockResolvedValue(
      verifiedMinter(pair.operator.address)
    );
    mockMintRelease.mockResolvedValue(mintResult());

    const receipt = await issueRelease({
      manifest,
      wallets: pair,
      network: "testnet",
      storage,
      storageProvider: "mock",
    });

    expect(receipt.xrpl.authorizedMinterTxHash).toBeUndefined();
  });
});
