import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateManifestFile } from "./validate.js";

// F-c939eb27: validate.ts (the "capsule validate" command — one of the two
// "core creator commands" named in the finding alongside resolve.ts) had no
// test file at all. This is the FIRST command a release author runs, and it
// has a subtle, load-bearing contract that's easy to break silently: unlike
// most of this package's file-reading helpers (readJsonFile in
// lib/json-input.ts), a malformed JSON file here is reported as a normal
// `{ valid: false, errors: [...] }` ValidationResult — it does NOT throw.
// bin.ts's "validate" case relies on that: it branches on `result.valid`
// and never wraps the call in try/catch.

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-validate-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

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

describe("validateManifestFile — schema-valid input", () => {
  it("reports valid:true with no errors for a well-formed manifest", async () => {
    const filePath = join(tempDir, "manifest.json");
    await writeFile(filePath, JSON.stringify(makeValidManifest()));

    const result = await validateManifestFile(filePath);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validateManifestFile — schema-invalid input", () => {
  it("reports valid:false with populated errors for well-formed JSON that violates the schema", async () => {
    const filePath = join(tempDir, "manifest.json");
    await writeFile(filePath, JSON.stringify({ not: "a manifest" }));

    const result = await validateManifestFile(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("flags a manifest with a field of the wrong type", async () => {
    const filePath = join(tempDir, "manifest.json");
    const manifest = makeValidManifest();
    // editionSize must be a number per the schema — corrupt it to a string.
    const broken = { ...manifest, editionSize: "one" };
    await writeFile(filePath, JSON.stringify(broken));

    const result = await validateManifestFile(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("editionSize"))).toBe(true);
  });
});

describe("validateManifestFile — malformed JSON (own inline parse, not lib/json-input.ts)", () => {
  it("returns a failed ValidationResult instead of throwing", async () => {
    const filePath = join(tempDir, "manifest.json");
    await writeFile(filePath, "{ not valid json");

    // The core contract under test: this resolves normally to a
    // ValidationResult, it does not reject. bin.ts's "validate" case reads
    // result.valid directly with no try/catch around the call, so a throw
    // here would crash the CLI with an unhandled rejection instead of the
    // clean "Manifest validation failed" message path.
    const result = await validateManifestFile(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(filePath);
    expect(result.errors[0]).toContain("Failed to parse");
  });
});

describe("validateManifestFile — missing file", () => {
  it("propagates ENOENT rather than swallowing it into a validation result", async () => {
    const filePath = join(tempDir, "does-not-exist.json");

    await expect(validateManifestFile(filePath)).rejects.toThrow(/ENOENT/);
  });
});
