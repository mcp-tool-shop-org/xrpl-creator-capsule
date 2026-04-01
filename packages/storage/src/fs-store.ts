import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { ContentStore } from "./store.js";

/**
 * Filesystem-backed content store for local development.
 * Stores files in a directory using content-addressed filenames.
 * Simulates CID-based storage without requiring IPFS.
 */
export class FsContentStore implements ContentStore {
  constructor(private readonly baseDir: string) {}

  async put(content: Uint8Array): Promise<string> {
    const hash = createHash("sha256").update(content).digest("hex");
    const cid = `Qm${hash}`;
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.filePath(cid), content);
    return cid;
  }

  async get(cid: string): Promise<Uint8Array | null> {
    try {
      const buf = await readFile(this.filePath(cid));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }

  async has(cid: string): Promise<boolean> {
    try {
      await access(this.filePath(cid));
      return true;
    } catch {
      return false;
    }
  }

  private filePath(cid: string): string {
    return join(this.baseDir, cid);
  }
}
