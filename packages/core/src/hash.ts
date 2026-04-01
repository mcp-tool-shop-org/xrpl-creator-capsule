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
 * Compute a SHA-256 hash of the FULL manifest payload.
 * This is the revision hash — it changes when anything changes
 * (price, policy, benefit, metadata endpoint, etc.).
 *
 * Used at mint/sale time to record exactly which version of the
 * manifest a collector bought against.
 */
export function computeRevisionHash(manifest: ReleaseManifest): string {
  // Strip the `id` field so revision hash is independent of identity stamp
  const { id: _id, ...rest } = manifest;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
export function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Stamp a manifest with its deterministic id.
 * Returns a new object (does not mutate).
 */
export function stampManifestId(manifest: ReleaseManifest): ReleaseManifest {
  return { ...manifest, id: computeManifestId(manifest) };
}
