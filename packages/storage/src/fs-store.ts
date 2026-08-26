import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
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
    if (!isSafeContentId(cid)) {
      throw new Error(`Invalid content identifier: ${cid}`);
    }
    const resolvedBaseDir = resolve(this.baseDir);
    const resolvedPath = resolve(resolvedBaseDir, cid);
    // Defense in depth: even though isSafeContentId already rejects any
    // separator or ".." segment, also confirm the resolved path is still a
    // descendant of baseDir before ever touching the filesystem with it.
    if (resolvedPath !== resolvedBaseDir && !resolvedPath.startsWith(resolvedBaseDir + sep)) {
      throw new Error(`Invalid content identifier: path escapes store root`);
    }
    return resolvedPath;
  }
}

/**
 * A content identifier for this store must be a single path segment: no
 * path separators (either direction, for cross-platform safety) and no
 * "." or ".." traversal segments. This rejects crafted cids such as
 * "../outside/secret.txt" (CWE-22 path traversal) while still accepting
 * this store's own "Qm<sha256-hex>" identifiers produced by put().
 */
function isSafeContentId(cid: string): boolean {
  if (typeof cid !== "string" || cid.length === 0) return false;
  if (cid.includes("/") || cid.includes("\\")) return false;
  if (cid === "." || cid === "..") return false;
  return true;
}
