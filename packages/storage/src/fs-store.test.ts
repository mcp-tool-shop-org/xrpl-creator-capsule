import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { FsContentStore } from "./fs-store.js";

let tempDir: string;
let store: FsContentStore;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-fs-test-"));
  store = new FsContentStore(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("FsContentStore", () => {
  it("stores and retrieves content", async () => {
    const data = new TextEncoder().encode("filesystem test");
    const cid = await store.put(data);

    expect(cid).toMatch(/^Qm[a-f0-9]{64}$/);
    expect(await store.has(cid)).toBe(true);

    const retrieved = await store.get(cid);
    expect(retrieved).toEqual(data);
  });

  it("returns deterministic CIDs", async () => {
    const data = new TextEncoder().encode("deterministic-fs");
    const cid1 = await store.put(data);
    const cid2 = await store.put(data);
    expect(cid1).toBe(cid2);
  });

  it("returns null for missing CIDs", async () => {
    expect(await store.get("Qmnonexistent")).toBeNull();
    expect(await store.has("Qmnonexistent")).toBe(false);
  });

  describe("path traversal protection", () => {
    it("still stores and retrieves content with a legitimately generated cid (non-regression)", async () => {
      const data = new TextEncoder().encode("legit content");
      const cid = await store.put(data);
      expect(await store.get(cid)).toEqual(data);
      expect(await store.has(cid)).toBe(true);
    });

    it("rejects a path-traversal-shaped cid instead of reading a file outside baseDir (CWE-22)", async () => {
      // Place a secret file OUTSIDE this store's baseDir.
      const outsideDir = await mkdtemp(join(tmpdir(), "capsule-fs-outside-"));
      const secretPath = join(outsideDir, "secret.txt");
      const secretContent = "top secret contents";
      await writeFile(secretPath, secretContent, "utf8");

      try {
        // Crafted cid that, if naively joined with baseDir, resolves to the
        // secret file above (baseDir/../<outsideDir-name>/secret.txt).
        const traversalCid = join("..", basename(outsideDir), "secret.txt");

        const got = await store.get(traversalCid);
        expect(got).toBeNull();
        expect(await store.has(traversalCid)).toBe(false);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
