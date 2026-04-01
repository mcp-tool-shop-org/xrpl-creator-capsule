/**
 * Xaman result verification.
 *
 * Per Xaman's secure-payment guidance:
 * 1. Confirm the payload is resolved and signed
 * 2. Validate the transaction ID on-ledger
 * 3. Check delivered amounts rather than trusting the payload flow alone
 *
 * This module handles step 1 (payload result validation).
 * Steps 2-3 are delegated to @capsule/xrpl for on-ledger confirmation.
 */

import type { XamanResolvedResult } from "./types.js";

export interface PayloadVerification {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Verify that a Xaman resolved result meets the minimum requirements
 * for a trusted transaction.
 *
 * This is the pre-check before on-ledger verification.
 */
export function verifyPayloadResult(
  result: XamanResolvedResult,
  expectedKind?: string
): PayloadVerification {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must be resolved
  if (!result.resolved) {
    errors.push("Payload is not yet resolved");
    return { valid: false, errors, warnings };
  }

  // Must be signed (not rejected or expired)
  if (!result.signed) {
    if (result.rejected) {
      errors.push("Payload was rejected by the user");
    } else if (result.expired) {
      errors.push("Payload expired before signing");
    } else {
      errors.push("Payload was not signed");
    }
    return { valid: false, errors, warnings };
  }

  // Must have a transaction ID
  if (!result.txid) {
    errors.push(
      "Payload was signed but no transaction ID returned — " +
        "cannot verify on-ledger"
    );
    return { valid: false, errors, warnings };
  }

  // Must have a signer address
  if (!result.signerAddress) {
    warnings.push(
      "No signer address in result — on-ledger verification will " +
        "need to extract it from the transaction"
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check that the signer address matches an expected address.
 *
 * Use this to confirm the right wallet signed:
 * - For configure-minter: signer should be the issuer
 * - For mint-release: signer should be the operator
 * - For buy-release: signer is the buyer (no pre-constraint)
 */
export function verifySignerAddress(
  result: XamanResolvedResult,
  expectedAddress: string
): PayloadVerification {
  const base = verifyPayloadResult(result);
  if (!base.valid) return base;

  if (result.signerAddress && result.signerAddress !== expectedAddress) {
    base.errors.push(
      `Signer address ${result.signerAddress} does not match ` +
        `expected ${expectedAddress}`
    );
    base.valid = false;
  }

  return base;
}
