import Ajv from "ajv";
import addFormats from "ajv-formats";
import { accessPolicySchema } from "./access-policy-schema.js";
import type { AccessPolicy } from "./access-policy.js";
import type { ValidationResult } from "./validate.js";
import type { ReleaseManifest } from "./manifest.js";
import type { IssuanceReceipt } from "./receipt.js";
import { computeManifestId } from "./hash.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const compiledValidator = ajv.compile<AccessPolicy>(accessPolicySchema);

/** Validate an AccessPolicy against its schema. */
export function validateAccessPolicy(policy: unknown): ValidationResult {
  const valid = compiledValidator(policy);
  if (valid) return { valid: true, errors: [] };
  const errors = (compiledValidator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

/** Validate and return typed policy or throw. */
export function assertAccessPolicy(policy: unknown): AccessPolicy {
  const result = validateAccessPolicy(policy);
  if (!result.valid) {
    throw new Error(
      `Invalid AccessPolicy:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  return policy as AccessPolicy;
}

/**
 * Verify that an AccessPolicy is coherent with a manifest and receipt.
 *
 * Checks:
 * - policy.manifestId matches the manifest's computed identity
 * - policy.benefit.kind matches the manifest's benefit kind
 * - policy.benefit.contentPointer matches the manifest's benefit contentPointer
 * - policy.rule.issuerAddress matches the manifest's issuerAddress
 * - policy.rule.qualifyingTokenIds are a subset of the receipt's nftTokenIds
 */
export interface PolicyCoherenceResult {
  coherent: boolean;
  errors: string[];
}

export function checkPolicyCoherence(
  policy: AccessPolicy,
  manifest: ReleaseManifest,
  receipt: IssuanceReceipt
): PolicyCoherenceResult {
  const errors: string[] = [];

  const expectedManifestId = computeManifestId(manifest);
  if (policy.manifestId !== expectedManifestId) {
    errors.push(
      `Policy manifestId ${policy.manifestId.slice(0, 16)}... does not match manifest ${expectedManifestId.slice(0, 16)}...`
    );
  }

  if (policy.benefit.kind !== manifest.benefit.kind) {
    errors.push(
      `Policy benefit kind "${policy.benefit.kind}" does not match manifest benefit kind "${manifest.benefit.kind}"`
    );
  }

  if (policy.benefit.contentPointer !== manifest.benefit.contentPointer) {
    errors.push(
      `Policy contentPointer does not match manifest benefit contentPointer`
    );
  }

  if (policy.rule.issuerAddress !== manifest.issuerAddress) {
    errors.push(
      `Policy issuerAddress ${policy.rule.issuerAddress} does not match manifest issuerAddress ${manifest.issuerAddress}`
    );
  }

  const receiptTokenSet = new Set(receipt.xrpl.nftTokenIds);
  const unknownTokens = policy.rule.qualifyingTokenIds.filter(
    (t) => !receiptTokenSet.has(t)
  );
  if (unknownTokens.length > 0) {
    errors.push(
      `Policy references ${unknownTokens.length} token ID(s) not in issuance receipt`
    );
  }

  return { coherent: errors.length === 0, errors };
}
