import Ajv from "ajv";
import addFormats from "ajv-formats";
import { releaseManifestSchema } from "./schema.js";
import type { ReleaseManifest } from "./manifest.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const compiledValidator = ajv.compile<ReleaseManifest>(releaseManifestSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a Release Manifest against the canonical schema. */
export function validateManifest(manifest: unknown): ValidationResult {
  const valid = compiledValidator(manifest);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (compiledValidator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

/** Validate and return typed manifest or throw. */
export function assertManifest(manifest: unknown): ReleaseManifest {
  const result = validateManifest(manifest);
  if (!result.valid) {
    throw new Error(
      `Invalid Release Manifest:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  return manifest as ReleaseManifest;
}
