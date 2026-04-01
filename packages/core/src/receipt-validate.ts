import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { issuanceReceiptSchema } from "./receipt-schema.js";
import type { IssuanceReceipt } from "./receipt.js";
import type { ValidationResult } from "./validate.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const compiledValidator = ajv.compile<IssuanceReceipt>(issuanceReceiptSchema);

/** Validate an Issuance Receipt against the canonical schema. */
export function validateReceipt(receipt: unknown): ValidationResult {
  const valid = compiledValidator(receipt);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (compiledValidator.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`
  );
  return { valid: false, errors };
}

/** Validate and return typed receipt or throw. */
export function assertReceipt(receipt: unknown): IssuanceReceipt {
  const result = validateReceipt(receipt);
  if (!result.valid) {
    throw new Error(
      `Invalid Issuance Receipt:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  // Structural invariants beyond schema
  const r = receipt as IssuanceReceipt;
  const invariantErrors: string[] = [];

  if (r.issuerAddress === r.operatorAddress) {
    invariantErrors.push("issuerAddress and operatorAddress must differ");
  }

  if (r.xrpl.nftTokenIds.length !== r.xrpl.mintTxHashes.length) {
    invariantErrors.push(
      `nftTokenIds.length (${r.xrpl.nftTokenIds.length}) must equal mintTxHashes.length (${r.xrpl.mintTxHashes.length})`
    );
  }

  if (invariantErrors.length > 0) {
    throw new Error(
      `Issuance Receipt invariant violation:\n${invariantErrors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  return r;
}

/**
 * Compute a tamper-evident fingerprint of the receipt.
 * Strips the receiptHash field before hashing so it's self-consistent.
 */
export function computeReceiptHash(receipt: IssuanceReceipt): string {
  const { receiptHash: _rh, ...rest } = receipt;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Stamp a receipt with its fingerprint.
 * Returns a new object (does not mutate).
 */
export function stampReceiptHash(receipt: IssuanceReceipt): IssuanceReceipt {
  return { ...receipt, receiptHash: computeReceiptHash(receipt) };
}
