import { readFile } from "node:fs/promises";
import { validateManifest, type ValidationResult } from "@capsule/core";

/**
 * Validate a Release Manifest file against the canonical schema.
 */
export async function validateManifestFile(
  filePath: string
): Promise<ValidationResult> {
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      errors: [`Failed to parse ${filePath} as JSON`],
    };
  }
  return validateManifest(parsed);
}
