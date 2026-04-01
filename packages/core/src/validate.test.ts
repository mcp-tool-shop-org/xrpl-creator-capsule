import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateManifest, assertManifest } from "./validate.js";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../fixtures/sample-release.json"
);

async function loadFixture(): Promise<unknown> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

describe("validateManifest", () => {
  it("accepts a valid manifest", async () => {
    const data = await loadFixture();
    const result = validateManifest(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a manifest missing required fields", () => {
    const result = validateManifest({ schemaVersion: "1.0.0" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects wrong schemaVersion", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.schemaVersion = "2.0.0";
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("rejects editionSize of 0", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.editionSize = 0;
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
  });

  it("rejects editionSize over 10000", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.editionSize = 10001;
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
  });

  it("rejects transferFeePercent over 50", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.transferFeePercent = 51;
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric priceDrops", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.priceDrops = "50XRP";
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid issuerAddress format", async () => {
    const data = (await loadFixture()) as Record<string, unknown>;
    data.issuerAddress = "0xNotAnXrplAddress";
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
  });
});

describe("assertManifest", () => {
  it("returns typed manifest for valid input", async () => {
    const data = await loadFixture();
    const manifest = assertManifest(data);
    expect(manifest.title).toBe("Midnight Frequency");
    expect(manifest.schemaVersion).toBe("1.0.0");
  });

  it("throws for invalid input", () => {
    expect(() => assertManifest({})).toThrow("Invalid Release Manifest");
  });
});
