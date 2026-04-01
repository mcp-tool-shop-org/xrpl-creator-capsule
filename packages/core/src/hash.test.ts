import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertManifest } from "./validate.js";
import { computeManifestId, computeRevisionHash, stampManifestId } from "./hash.js";

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

describe("computeRevisionHash", () => {
  it("returns a 64-character hex string", async () => {
    const manifest = await loadManifest();
    const hash = computeRevisionHash(manifest);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", async () => {
    const manifest = await loadManifest();
    const h1 = computeRevisionHash(manifest);
    const h2 = computeRevisionHash(manifest);
    expect(h1).toBe(h2);
  });

  it("changes when price changes", async () => {
    const manifest = await loadManifest();
    const h1 = computeRevisionHash(manifest);
    const modified = { ...manifest, priceDrops: "99999999" };
    const h2 = computeRevisionHash(modified);
    expect(h1).not.toBe(h2);
  });

  it("changes when payout policy changes", async () => {
    const manifest = await loadManifest();
    const h1 = computeRevisionHash(manifest);
    const modified = {
      ...manifest,
      payoutPolicy: { ...manifest.payoutPolicy, terms: "New terms" },
    };
    const h2 = computeRevisionHash(modified);
    expect(h1).not.toBe(h2);
  });

  it("differs from manifestId", async () => {
    const manifest = await loadManifest();
    const id = computeManifestId(manifest);
    const rev = computeRevisionHash(manifest);
    expect(id).not.toBe(rev);
  });

  it("ignores the id field (is independent of stamp order)", async () => {
    const manifest = await loadManifest();
    const h1 = computeRevisionHash(manifest);
    const stamped = stampManifestId(manifest);
    const h2 = computeRevisionHash(stamped);
    expect(h1).toBe(h2);
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
