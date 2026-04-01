import { createHash } from "node:crypto";
import type { ContentStore } from "./store.js";

/**
 * In-memory content store for testing and development.
 * CIDs are SHA-256 hex hashes prefixed with "mock-" for clarity.
 */
export class MockContentStore implements ContentStore {
  private data = new Map<string, Uint8Array>();

  async put(content: Uint8Array): Promise<string> {
    const hash = createHash("sha256").update(content).digest("hex");
    const cid = `mock-${hash}`;
    this.data.set(cid, new Uint8Array(content));
    return cid;
  }

  async get(cid: string): Promise<Uint8Array | null> {
    return this.data.get(cid) ?? null;
  }

  async has(cid: string): Promise<boolean> {
    return this.data.has(cid);
  }

  /** Number of stored items (test helper) */
  get size(): number {
    return this.data.size;
  }

  /** Clear all stored content (test helper) */
  clear(): void {
    this.data.clear();
  }
}
