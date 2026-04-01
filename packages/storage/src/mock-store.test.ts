import { describe, it, expect } from "vitest";
import { MockContentStore } from "./mock-store.js";

describe("MockContentStore", () => {
  it("stores and retrieves content", async () => {
    const store = new MockContentStore();
    const data = new TextEncoder().encode("hello world");
    const cid = await store.put(data);

    expect(cid).toMatch(/^mock-[a-f0-9]{64}$/);
    expect(await store.has(cid)).toBe(true);

    const retrieved = await store.get(cid);
    expect(retrieved).toEqual(data);
  });

  it("returns deterministic CIDs", async () => {
    const store = new MockContentStore();
    const data = new TextEncoder().encode("deterministic");
    const cid1 = await store.put(data);
    const cid2 = await store.put(data);
    expect(cid1).toBe(cid2);
  });

  it("returns null for missing CIDs", async () => {
    const store = new MockContentStore();
    expect(await store.get("mock-nonexistent")).toBeNull();
    expect(await store.has("mock-nonexistent")).toBe(false);
  });

  it("tracks size correctly", async () => {
    const store = new MockContentStore();
    expect(store.size).toBe(0);

    await store.put(new TextEncoder().encode("one"));
    expect(store.size).toBe(1);

    await store.put(new TextEncoder().encode("two"));
    expect(store.size).toBe(2);
  });

  it("clears all content", async () => {
    const store = new MockContentStore();
    await store.put(new TextEncoder().encode("data"));
    expect(store.size).toBe(1);

    store.clear();
    expect(store.size).toBe(0);
  });
});
