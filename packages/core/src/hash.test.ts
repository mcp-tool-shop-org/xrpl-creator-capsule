import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertManifest } from "./validate.js";
import { computeManifestId, stampManifestId } from "./hash.js";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../fixtures/sample-release.json"
);

async function loadManifest() {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return assertManifest(JSON.parse(raw));
}

describe("computeManifestId", () => {
  it("returns a 64-character hex string", async () => {
    const manifest = await loadManifest();
    const id = computeManifestId(manifest);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", async () => {
    const manifest = await loadManifest();
    const id1 = computeManifestId(manifest);
    const id2 = computeManifestId(manifest);
    expect(id1).toBe(id2);
  });

  it("changes when identity fields change", async () => {
    const manifest = await loadManifest();
    const id1 = computeManifestId(manifest);
    const modified = { ...manifest, title: "Different Title" };
    const id2 = computeManifestId(modified);
    expect(id1).not.toBe(id2);
  });

  it("does NOT change when non-identity fields change", async () => {
    const manifest = await loadManifest();
    const id1 = computeManifestId(manifest);
    const modified = { ...manifest, priceDrops: "99999999" };
    const id2 = computeManifestId(modified);
    expect(id1).toBe(id2);
  });
});

describe("stampManifestId", () => {
  it("adds id field without mutating original", async () => {
    const manifest = await loadManifest();
    const stamped = stampManifestId(manifest);
    expect(stamped.id).toBeDefined();
    expect(stamped.id).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.id).toBeUndefined();
  });
});
