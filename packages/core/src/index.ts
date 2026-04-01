export type {
  ReleaseManifest,
  CollectorBenefit,
  PayoutPolicy,
  LicenseTerms,
} from "./manifest.js";

export { releaseManifestSchema } from "./schema.js";
export { validateManifest, assertManifest } from "./validate.js";
export type { ValidationResult } from "./validate.js";

export { computeManifestId, stampManifestId } from "./hash.js";

export {
  resolveManifestPointers,
} from "./resolve.js";
export type { ResolutionResult, ResolutionCheck } from "./resolve.js";
