import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJsonArgument, readJsonFile } from "./json-input.js";

describe("parseJsonArgument (F-557e9844)", () => {
  it("parses valid JSON", () => {
    expect(parseJsonArgument("[1,2,3]", "--outputs")).toEqual([1, 2, 3]);
  });

  it("names the flag when the value is malformed, instead of a bare parser error", () => {
    let caught: unknown;
    try {
      parseJsonArgument("not valid json", "--outputs");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Invalid JSON for --outputs");
    // The old behavior was a bare JSON.parse SyntaxError with no flag
    // context — assert we didn't just relabel the same unhelpful text.
    expect(message).not.toMatch(/^Unexpected token/);
  });

  it("names a different flag correctly for a second call site", () => {
    expect(() => parseJsonArgument("{broken", "--signers")).toThrow(
      "Invalid JSON for --signers"
    );
  });
});

describe("readJsonFile (F-5a0ce89b, F-e676ca8f)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "capsule-json-input-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses a valid JSON file", async () => {
    const filePath = join(tempDir, "data.json");
    await writeFile(filePath, JSON.stringify({ a: 1 }));
    await expect(readJsonFile(filePath)).resolves.toEqual({ a: 1 });
  });

  it("names the path when the file is malformed, instead of a bare parser error", async () => {
    const filePath = join(tempDir, "data.json");
    await writeFile(filePath, "{ this is not json");

    let caught: unknown;
    try {
      await readJsonFile(filePath);
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

  it("includes the optional label alongside the path", async () => {
    const filePath = join(tempDir, "data.json");
    await writeFile(filePath, "{ broken");

    let caught: unknown;
    try {
      await readJsonFile(filePath, "manifest");
    } catch (err) {
      caught = err;
    }

    expect((caught as Error).message).toContain("manifest (");
    expect((caught as Error).message).toContain(filePath);
  });

  it("propagates a real file-not-found error unchanged (not treated as a parse error)", async () => {
    const filePath = join(tempDir, "does-not-exist.json");

    let caught: unknown;
    try {
      await readJsonFile(filePath);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("ENOENT");
    // Must NOT have been rewrapped as a parse failure — a missing file and
    // a malformed file are different problems with different fixes.
    expect((caught as Error).message).not.toContain("Failed to parse");
  });
});
