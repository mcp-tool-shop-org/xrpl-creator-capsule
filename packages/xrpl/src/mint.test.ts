import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReleaseManifest } from "@capsule/core";
import { generateWalletPair, type WalletPair } from "./wallet.js";

const { mockConnect, mockDisconnect, mockSubmitAndWait } = vi.hoisted(() => {
  return {
    mockConnect: vi.fn(),
    mockDisconnect: vi.fn(),
    mockSubmitAndWait: vi.fn(),
  };
});

vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      submitAndWait: mockSubmitAndWait,
    })),
  };
});

import { mintRelease, PartialMintError } from "./mint.js";

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

function successTx(nftId: string, hash: string) {
  return {
    result: {
      hash,
      meta: {
        TransactionResult: "tesSUCCESS",
        AffectedNodes: [
          {
            CreatedNode: {
              NewFields: { NFTokens: [{ NFToken: { NFTokenID: nftId } }] },
            },
          },
        ],
      },
    },
  };
}

function failedTx(resultCode: string) {
  return {
    result: {
      hash: "IGNORED_HASH",
      meta: { TransactionResult: resultCode },
    },
  };
}

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockSubmitAndWait.mockReset();
});

describe("mintRelease", () => {
  // F-d186739a (HIGH): a mid-run mint failure used to discard every already
  // -submitted, already-irreversible on-chain mint from iterations before
  // the failure — the caller never learned those NFTokenIDs/tx hashes
  // existed, so a naive retry would double-mint. Half 1 (the defect fix):
  // on a failure after some editions already succeeded, the thrown error
  // must carry those already-minted tokenIds/txHashes rather than losing
  // them. Half 2 (must-not-regress baseline): a fully successful run must
  // still return every tokenId/txHash exactly as before.

  it("surfaces already-minted tokenIds/txHashes via PartialMintError when a later edition fails", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair, { editionSize: 3 });

    mockSubmitAndWait
      .mockResolvedValueOnce(successTx("NFT_1", "HASH_1"))
      .mockResolvedValueOnce(successTx("NFT_2", "HASH_2"))
      .mockResolvedValueOnce(failedTx("tecNO_PERMISSION"));

    let caught: unknown;
    try {
      await mintRelease(manifest, pair, "testnet");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PartialMintError);
    const partial = caught as PartialMintError;
    expect(partial.tokenIds).toEqual(["NFT_1", "NFT_2"]);
    expect(partial.txHashes).toEqual(["HASH_1", "HASH_2"]);
    expect(partial.editionSize).toBe(3);
    // The ledger connection must still be released on failure.
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("still returns every tokenId/txHash for a fully successful mint run", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair, { editionSize: 3 });

    mockSubmitAndWait
      .mockResolvedValueOnce(successTx("NFT_1", "HASH_1"))
      .mockResolvedValueOnce(successTx("NFT_2", "HASH_2"))
      .mockResolvedValueOnce(successTx("NFT_3", "HASH_3"));

    const result = await mintRelease(manifest, pair, "testnet");

    expect(result.tokenIds).toEqual(["NFT_1", "NFT_2", "NFT_3"]);
    expect(result.txHashes).toEqual(["HASH_1", "HASH_2", "HASH_3"]);
    expect(result.network).toBe("testnet");
  });

  it("still throws a PartialMintError (with an empty partial set) when the very first mint fails", async () => {
    const pair = generateWalletPair();
    const manifest = makeManifest(pair, { editionSize: 2 });

    mockSubmitAndWait.mockResolvedValueOnce(failedTx("tecNO_PERMISSION"));

    let caught: unknown;
    try {
      await mintRelease(manifest, pair, "testnet");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PartialMintError);
    const partial = caught as PartialMintError;
    expect(partial.tokenIds).toEqual([]);
    expect(partial.txHashes).toEqual([]);
  });
});
