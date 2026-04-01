import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertManifest } from "./validate.js";
import { resolveManifestPointers } from "./resolve.js";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../fixtures/sample-release.json"
);

async function loadManifest() {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return assertManifest(JSON.parse(raw));
}

describe("resolveManifestPointers", () => {
  it("passes for a valid manifest", async () => {
    const manifest = await loadManifest();
    const result = resolveManifestPointers(manifest);
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("checks issuer/operator separation", async () => {
    const manifest = await loadManifest();
    const result = resolveManifestPointers(manifest);
    const sep = result.checks.find((c) => c.name === "issuer-operator-separation");
    expect(sep?.passed).toBe(true);
  });

  it("fails when issuer equals operator", async () => {
    const manifest = await loadManifest();
    const bad = { ...manifest, operatorAddress: manifest.issuerAddress };
    const result = resolveManifestPointers(bad);
    expect(result.passed).toBe(false);
    const sep = result.checks.find((c) => c.name === "issuer-operator-separation");
    expect(sep?.passed).toBe(false);
  });

  it("fails for invalid CID shapes", async () => {
    const manifest = await loadManifest();
    const bad = { ...manifest, coverCid: "not-a-cid" };
    const result = resolveManifestPointers(bad);
    const cover = result.checks.find((c) => c.name === "coverCid-shape");
    expect(cover?.passed).toBe(false);
  });

  it("fails for invalid metadata URL", async () => {
    const manifest = await loadManifest();
    const bad = { ...manifest, metadataEndpoint: "not a url" };
    const result = resolveManifestPointers(bad);
    const meta = result.checks.find((c) => c.name === "metadataEndpoint-shape");
    expect(meta?.passed).toBe(false);
  });

  it("accepts a URL as benefit contentPointer", async () => {
    const manifest = await loadManifest();
    const withUrl = {
      ...manifest,
      benefit: { ...manifest.benefit, contentPointer: "https://cdn.example.com/stems.zip" },
    };
    const result = resolveManifestPointers(withUrl);
    const benefit = result.checks.find((c) => c.name === "benefit.contentPointer-shape");
    expect(benefit?.passed).toBe(true);
  });
});
