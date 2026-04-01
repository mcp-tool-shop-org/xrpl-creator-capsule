import { createHash } from "node:crypto";
import type { ReleaseManifest } from "./manifest.js";

/**
 * Fields that form the identity of a release.
 * Changing any of these means it's a different release.
 */
const IDENTITY_FIELDS = [
  "title",
  "artist",
  "editionSize",
  "coverCid",
  "mediaCid",
  "issuerAddress",
] as const;

/**
 * Compute a deterministic SHA-256 hash of the release's identity fields.
 * This becomes the manifest `id` — stable across metadata or policy updates.
 */
export function computeManifestId(manifest: ReleaseManifest): string {
  const payload: Record<string, unknown> = {};
  for (const field of IDENTITY_FIELDS) {
    payload[field] = manifest[field];
  }
  const canonical = JSON.stringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Stamp a manifest with its deterministic id.
 * Returns a new object (does not mutate).
 */
export function stampManifestId(manifest: ReleaseManifest): ReleaseManifest {
  return { ...manifest, id: computeManifestId(manifest) };
}
