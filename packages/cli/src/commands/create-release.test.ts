import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRelease } from "./create-release.js";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../../fixtures/sample-release.json"
);

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-cli-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("createRelease", () => {
  it("validates, stamps, and writes a manifest", async () => {
    const outputPath = join(tempDir, "release.json");
    const manifest = await createRelease({
      inputPath: FIXTURE_PATH,
      outputPath,
    });

    expect(manifest.title).toBe("Midnight Frequency");
    expect(manifest.id).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.schemaVersion).toBe("1.0.0");
  });

  it("throws for invalid input", async () => {
    const { writeFile } = await import("node:fs/promises");
    const badPath = join(tempDir, "bad.json");
    await writeFile(badPath, JSON.stringify({ schemaVersion: "1.0.0" }));

    await expect(
      createRelease({ inputPath: badPath, outputPath: join(tempDir, "out.json") })
    ).rejects.toThrow("Invalid Release Manifest");
  });
});
