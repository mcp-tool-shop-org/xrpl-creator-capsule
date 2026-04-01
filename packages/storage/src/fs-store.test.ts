import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
