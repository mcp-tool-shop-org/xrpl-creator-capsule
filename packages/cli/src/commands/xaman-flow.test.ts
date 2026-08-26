import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReleaseManifest } from "@capsule/core";

const { mockCreatePayload, mockSubscribeToPayload } = vi.hoisted(() => {
  return {
    mockCreatePayload: vi.fn(),
    mockSubscribeToPayload: vi.fn(),
  };
});

// Mirrors packages/xrpl/src/mint.test.ts's mocking style: replace only the
// networked class (XamanClient) while keeping the real, pure helpers
// (buildMintPayload, verifyPayloadResult, verifySignerAddress) so the
// verification logic under test is genuine, not faked.
vi.mock("@capsule/xaman", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capsule/xaman")>();
  return {
    ...actual,
    XamanClient: vi.fn().mockImplementation(() => ({
      createPayload: mockCreatePayload,
      subscribeToPayload: mockSubscribeToPayload,
    })),
  };
});

import { mintReleaseViaXaman, PartialXamanMintError } from "./xaman-flow.js";

const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function makeManifest(overrides?: Partial<ReleaseManifest>): ReleaseManifest {
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
      treasuryAddress: ISSUER,
      multiSig: false,
      terms: "Single artist.",
    },
    issuerAddress: ISSUER,
    operatorAddress: OPERATOR,
    createdAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function signedResult(txid: string) {
  return {
    payloadId: `payload-${txid}`,
    resolved: true,
    signed: true,
    rejected: false,
    expired: false,
    txid,
    signerAddress: OPERATOR,
  };
}

function rejectedResult() {
  return {
    payloadId: "payload-rejected",
    resolved: true,
    signed: false,
    rejected: true,
    expired: false,
  };
}

let tempDir: string;
let manifestPath: string;

beforeEach(async () => {
  process.env.XAMAN_API_KEY = "test-key";
  process.env.XAMAN_API_SECRET = "test-secret";
  tempDir = await mkdtemp(join(tmpdir(), "capsule-xaman-test-"));
  manifestPath = join(tempDir, "manifest.json");
  mockCreatePayload.mockReset().mockResolvedValue({
    payloadId: "p1",
    qrPngUrl: "https://example.com/qr.png",
    qrMatrix: "",
    deeplink: "https://example.com/deeplink",
    websocketUrl: "wss://example.com/ws",
  });
  mockSubscribeToPayload.mockReset();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.XAMAN_API_KEY;
  delete process.env.XAMAN_API_SECRET;
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("mintReleaseViaXaman", () => {
  // F-f927b88d (HIGH): this is the third instance of a pattern already fixed
  // twice in this codebase (packages/xrpl/src/mint.ts's PartialMintError,
  // F-d186739a; app/src/state/release.tsx, F-74549b0b). Editions already
  // signed and minted via Xaman before a later edition's signature fails are
  // real, irreversible, fee-paying on-chain NFTokenMints. Losing track of
  // them (the old behavior: throw a bare Error, discard `results`) means a
  // naive rerun restarts from edition 0 and double-mints them.

  it("surfaces already-signed editions via PartialXamanMintError and persists a record when a later edition's signature fails", async () => {
    const manifest = makeManifest({ editionSize: 3 });
    await writeFile(manifestPath, JSON.stringify(manifest));

    mockSubscribeToPayload
      .mockResolvedValueOnce(signedResult("TX_1"))
      .mockResolvedValueOnce(signedResult("TX_2"))
      .mockResolvedValueOnce(rejectedResult());

    let caught: unknown;
    try {
      await mintReleaseViaXaman(manifestPath, "testnet", OPERATOR);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PartialXamanMintError);
    const partial = caught as PartialXamanMintError;
    expect(partial.results.map((r) => r.txid)).toEqual(["TX_1", "TX_2"]);
    expect(partial.editionSize).toBe(3);

    // The already-minted editions must not merely live in the thrown
    // error's memory — they must be durably recorded on disk BEFORE the
    // rethrow, so a human (or a future recovery command) can discover them
    // even if the console output already scrolled past.
    expect(partial.recordPath).toBeTruthy();
    expect(await fileExists(partial.recordPath)).toBe(true);
    const record = JSON.parse(await readFile(partial.recordPath, "utf-8"));
    expect(record.editionSize).toBe(3);
    expect(record.mintedEditions.map((e: { txid?: string }) => e.txid)).toEqual([
      "TX_1",
      "TX_2",
    ]);
    expect(record.failedAtEdition).toBe(2);
  });

  it("still returns every edition's signed result for a fully successful Xaman mint run", async () => {
    const manifest = makeManifest({ editionSize: 3 });
    await writeFile(manifestPath, JSON.stringify(manifest));

    mockSubscribeToPayload
      .mockResolvedValueOnce(signedResult("TX_1"))
      .mockResolvedValueOnce(signedResult("TX_2"))
      .mockResolvedValueOnce(signedResult("TX_3"));

    const result = await mintReleaseViaXaman(manifestPath, "testnet", OPERATOR);

    expect(result.results.map((r) => r.txid)).toEqual(["TX_1", "TX_2", "TX_3"]);
    // No partial-mint record should be left behind after a clean run.
    expect(await fileExists(`${manifestPath}.partial-mint.json`)).toBe(false);
  });
});
