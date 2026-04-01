import { describe, it, expect } from "vitest";
import { verifyPayloadResult, verifySignerAddress } from "./verify.js";
import type { XamanResolvedResult } from "./types.js";

function makeSignedResult(
  overrides?: Partial<XamanResolvedResult>
): XamanResolvedResult {
  return {
    payloadId: "test-payload-123",
    resolved: true,
    signed: true,
    rejected: false,
    expired: false,
    txid: "ABCDEF1234567890",
    signerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    ...overrides,
  };
}

describe("verifyPayloadResult", () => {
  it("passes for a valid signed result", () => {
    const v = verifyPayloadResult(makeSignedResult());
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it("fails for unresolved payload", () => {
    const v = verifyPayloadResult(makeSignedResult({ resolved: false }));
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/not yet resolved/);
  });

  it("fails for rejected payload", () => {
    const v = verifyPayloadResult(
      makeSignedResult({ signed: false, rejected: true })
    );
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/rejected/);
  });

  it("fails for expired payload", () => {
    const v = verifyPayloadResult(
      makeSignedResult({ signed: false, rejected: false, expired: true })
    );
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/expired/);
  });

  it("fails for signed but no txid", () => {
    const v = verifyPayloadResult(makeSignedResult({ txid: undefined }));
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/transaction ID/);
  });

  it("warns when signer address is missing", () => {
    const v = verifyPayloadResult(
      makeSignedResult({ signerAddress: undefined })
    );
    expect(v.valid).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings[0]).toMatch(/signer address/i);
  });
});

describe("verifySignerAddress", () => {
  it("passes when signer matches expected", () => {
    const v = verifySignerAddress(
      makeSignedResult(),
      "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
    );
    expect(v.valid).toBe(true);
  });

  it("fails when signer does not match", () => {
    const v = verifySignerAddress(
      makeSignedResult(),
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    );
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/does not match/);
  });

  it("still fails on base verification errors", () => {
    const v = verifySignerAddress(
      makeSignedResult({ resolved: false }),
      "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
    );
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/not yet resolved/);
  });
});
