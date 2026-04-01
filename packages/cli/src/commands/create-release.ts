import { readFile, writeFile } from "node:fs/promises";
import {
  type ReleaseManifest,
  assertManifest,
  stampManifestId,
} from "@capsule/core";

export interface CreateReleaseOptions {
  /** Path to a JSON file with release fields */
  inputPath: string;
  /** Output path for the stamped manifest */
  outputPath: string;
}

/**
 * Create a release from a manifest input file.
 *
 * Reads the input, validates against the schema, stamps a deterministic ID,
 * and writes the canonical manifest.
 */
export async function createRelease(
  opts: CreateReleaseOptions
): Promise<ReleaseManifest> {
  const raw = await readFile(opts.inputPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse ${opts.inputPath} as JSON`);
  }

  // Validate and type-narrow
  const manifest = assertManifest(parsed);

  // Stamp deterministic ID
  const stamped = stampManifestId(manifest);

  // Write canonical output
  await writeFile(opts.outputPath, JSON.stringify(stamped, null, 2) + "\n");

  return stamped;
}
