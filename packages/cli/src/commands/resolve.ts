import { readFile } from "node:fs/promises";
import {
  assertManifest,
  resolveManifestPointers,
  type ResolutionResult,
} from "@capsule/core";

/**
 * Resolve a Release Manifest's external pointers.
 * Validates pointer shapes (CIDs, URLs, issuer/operator separation).
 */
export async function resolveManifestFile(
  filePath: string
): Promise<ResolutionResult> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  const manifest = assertManifest(parsed);
  return resolveManifestPointers(manifest);
}
