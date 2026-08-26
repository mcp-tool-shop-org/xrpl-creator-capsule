import {
  assertManifest,
  resolveManifestPointers,
  type ResolutionResult,
} from "@capsule/core";
import { readJsonFile } from "../lib/json-input.js";

/**
 * Resolve a Release Manifest's external pointers.
 * Validates pointer shapes (CIDs, URLs, issuer/operator separation).
 */
export async function resolveManifestFile(
  filePath: string
): Promise<ResolutionResult> {
  // F-e676ca8f: this used to call JSON.parse directly with no try/catch,
  // unlike the identical read-then-parse step in create-release.ts and
  // validate.ts — a malformed manifest surfaced a bare JSON.parse
  // SyntaxError instead of a message naming the file.
  const parsed = await readJsonFile(filePath, "manifest");
  const manifest = assertManifest(parsed);
  return resolveManifestPointers(manifest);
}
