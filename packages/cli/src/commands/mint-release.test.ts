import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mintReleaseCommand } from "./mint-release.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-mint-release-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// Schema-valid fixture (mirrors recover-release.test.ts's makeManifest) so
// tests that need to get past manifest parsing/validation can reach the
// wallets-parsing step without a real mint ever being attempted.
function makeValidManifest() {
  return {
    schemaVersion: "1.0.0",
    title: "Test Release",
    artist: "Test Artist",
    editionSize: 1,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/test-release",
    license: { type: "custom", summary: "Personal license.", uri: "https://example.com/license" },
    benefit: {
      kind: "stems",
      description: "Full stem pack for personal remixing",
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

describe("mintReleaseCommand — malformed JSON artifacts (F-5a0ce89b)", () => {
  // Both assertions stop before issueRelease() is ever reached (the parse
  // failure throws first), so this needs no @capsule/xrpl mocking and
  // makes no network call — matching the "never a real mainnet call"
  // constraint for this domain's tests.

  it("names the manifest file when it is malformed, instead of a bare SyntaxError", async () => {
    const manifestPath = join(tempDir, "manifest.json");
    const walletsPath = join(tempDir, "wallets.json");
    await writeFile(manifestPath, "{ this is not json");
    await writeFile(walletsPath, "{}");

    let caught: unknown;
    try {
      await mintReleaseCommand({
        manifestPath,
        walletsPath,
        network: "testnet",
        receiptPath: join(tempDir, "receipt.json"),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain(manifestPath);
    expect(message).not.toMatch(/^Unexpected token/);
  });

  it("names wallets.json when it is malformed — the failure right before a mint", async () => {
    const manifestPath = join(tempDir, "manifest.json");
    const walletsPath = join(tempDir, "wallets.json");
    await writeFile(manifestPath, JSON.stringify(makeValidManifest()));
    await writeFile(walletsPath, "{ not valid json");

    let caught: unknown;
    try {
      await mintReleaseCommand({
        manifestPath,
        walletsPath,
        network: "testnet",
        receiptPath: join(tempDir, "receipt.json"),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain(walletsPath);
    expect(message).not.toMatch(/^Unexpected token/);
  });
});
