import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveManifestFile } from "./resolve.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-resolve-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("resolveManifestFile — malformed JSON (F-e676ca8f)", () => {
  // Prior to this fix, this command was the one place left calling
  // JSON.parse directly with no try/catch, unlike the identical
  // read-then-parse step in create-release.ts and validate.ts.
  it("throws a friendly, file-naming error instead of a bare SyntaxError", async () => {
    const filePath = join(tempDir, "manifest.json");
    await writeFile(filePath, "{ not valid json");

    let caught: unknown;
    try {
      await resolveManifestFile(filePath);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain("as JSON");
    expect(message).toContain(filePath);
    expect(message).not.toMatch(/^Unexpected token/);
  });

  it("still surfaces manifest schema errors normally for well-formed-but-invalid JSON", async () => {
    const filePath = join(tempDir, "manifest.json");
    await writeFile(filePath, JSON.stringify({ not: "a manifest" }));

    await expect(resolveManifestFile(filePath)).rejects.toThrow();
  });
});
