import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { accessGrantReceiptSchema } from "./access-grant-schema.js";
import type { AccessGrantReceipt } from "./access-grant.js";
import type { ValidationResult } from "./validate.js";
import { sortKeysDeep } from "./hash.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const compiledValidator = ajv.compile<AccessGrantReceipt>(accessGrantReceiptSchema);

/** Validate an AccessGrantReceipt against its schema. */
export function validateAccessGrant(grant: unknown): ValidationResult {
  const valid = compiledValidator(grant);
  if (valid) return { valid: true, errors: [] };
  const errors = (compiledValidator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

/** Validate and return typed grant or throw. */
export function assertAccessGrant(grant: unknown): AccessGrantReceipt {
  const result = validateAccessGrant(grant);
  if (!result.valid) {
    throw new Error(
      `Invalid AccessGrantReceipt:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  return grant as AccessGrantReceipt;
}

/** Compute tamper-evident fingerprint of an access grant receipt. */
export function computeGrantHash(grant: AccessGrantReceipt): string {
  const { grantHash: _gh, ...rest } = grant;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stamp a grant receipt with its fingerprint. Returns new object. */
export function stampGrantHash(grant: AccessGrantReceipt): AccessGrantReceipt {
  return { ...grant, grantHash: computeGrantHash(grant) };
}
