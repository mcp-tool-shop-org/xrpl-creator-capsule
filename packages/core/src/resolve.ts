import type { ReleaseManifest } from "./manifest.js";

export interface ResolutionResult {
  passed: boolean;
  checks: ResolutionCheck[];
}

export interface ResolutionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Verify that a manifest's external pointers are structurally coherent.
 * This does NOT fetch remote resources — it validates pointer shapes
 * so that actual network resolution can be done by the caller.
 */
export function resolveManifestPointers(
  manifest: ReleaseManifest
): ResolutionResult {
  const checks: ResolutionCheck[] = [];

  // Cover CID looks like a valid IPFS CID (v0 or v1) or Arweave ID
  checks.push(checkCidShape("coverCid", manifest.coverCid));
  checks.push(checkCidShape("mediaCid", manifest.mediaCid));

  // Metadata endpoint is a parseable URL
  checks.push(checkUrlShape("metadataEndpoint", manifest.metadataEndpoint));

  // License URI is parseable
  checks.push(checkUrlOrCid("license.uri", manifest.license.uri));

  // Benefit content pointer is a CID or URL
  checks.push(
    checkUrlOrCid("benefit.contentPointer", manifest.benefit.contentPointer)
  );

  // Issuer and operator are different addresses
  checks.push({
    name: "issuer-operator-separation",
    passed: manifest.issuerAddress !== manifest.operatorAddress,
    detail:
      manifest.issuerAddress !== manifest.operatorAddress
        ? "Issuer and operator are separate accounts"
        : "Issuer and operator must be different accounts",
  });

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

// ── Helpers ──────────────────────────────────────────────────────────

const CID_V0_RE = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_RE = /^b[a-z2-7]{58,}$/;
const ARWEAVE_RE = /^[a-zA-Z0-9_-]{43}$/;

function isCidLike(value: string): boolean {
  return CID_V0_RE.test(value) || CID_V1_RE.test(value) || ARWEAVE_RE.test(value);
}

function isUrlParseable(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function checkCidShape(name: string, value: string): ResolutionCheck {
  const passed = isCidLike(value);
  return {
    name: `${name}-shape`,
    passed,
    detail: passed
      ? `${name} looks like a valid CID/Arweave ID`
      : `${name} does not match known CID or Arweave ID patterns`,
  };
}

function checkUrlShape(name: string, value: string): ResolutionCheck {
  const passed = isUrlParseable(value);
  return {
    name: `${name}-shape`,
    passed,
    detail: passed
      ? `${name} is a parseable URL`
      : `${name} is not a parseable URL`,
  };
}

function checkUrlOrCid(name: string, value: string): ResolutionCheck {
  const passed = isCidLike(value) || isUrlParseable(value);
  return {
    name: `${name}-shape`,
    passed,
    detail: passed
      ? `${name} is a valid CID or URL`
      : `${name} is neither a valid CID nor a parseable URL`,
  };
}
