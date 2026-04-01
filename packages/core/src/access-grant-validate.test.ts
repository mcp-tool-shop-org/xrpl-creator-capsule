import { describe, it, expect } from "vitest";
import type { AccessGrantReceipt } from "./access-grant.js";
import {
  validateAccessGrant,
  assertAccessGrant,
  computeGrantHash,
  stampGrantHash,
} from "./access-grant-validate.js";

function makeValidGrant(decision: "allow" | "deny" = "allow"): AccessGrantReceipt {
  const base: AccessGrantReceipt = {
    schemaVersion: "1.0.0",
    kind: "access-grant-receipt",
    manifestId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    policyLabel: "Stems pack for holders",
    subjectAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    network: "testnet",
    decision,
    reason: decision === "allow"
      ? "Wallet holds qualifying NFT"
      : "Wallet does not hold any qualifying NFT",
    benefit: {
      kind: "stems",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    ownership: {
      matchedTokenIds: decision === "allow"
        ? ["000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D96"]
        : [],
      totalNftsChecked: 1,
    },
    decidedAt: "2026-04-01T10:00:00Z",
  };

  if (decision === "allow") {
    base.delivery = {
      mode: "download-token",
      token: "tok_abc123",
      expiresAt: "2026-04-01T11:00:00Z",
    };
  }

  return base;
}

describe("validateAccessGrant", () => {
  it("accepts a valid allow grant", () => {
    const result = validateAccessGrant(makeValidGrant("allow"));
    expect(result.valid).toBe(true);
  });

  it("accepts a valid deny grant", () => {
    const result = validateAccessGrant(makeValidGrant("deny"));
    expect(result.valid).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = validateAccessGrant({ schemaVersion: "1.0.0" });
    expect(result.valid).toBe(false);
  });

  it("rejects wrong kind", () => {
    const g = { ...makeValidGrant(), kind: "wrong" };
    expect(validateAccessGrant(g).valid).toBe(false);
  });

  it("rejects invalid decision value", () => {
    const g = { ...makeValidGrant(), decision: "maybe" };
    expect(validateAccessGrant(g).valid).toBe(false);
  });

  it("rejects invalid subjectAddress", () => {
    const g = { ...makeValidGrant(), subjectAddress: "not-valid" };
    expect(validateAccessGrant(g).valid).toBe(false);
  });
});

describe("assertAccessGrant", () => {
  it("returns typed grant for valid input", () => {
    const grant = assertAccessGrant(makeValidGrant());
    expect(grant.kind).toBe("access-grant-receipt");
  });

  it("throws for invalid input", () => {
    expect(() => assertAccessGrant({})).toThrow("Invalid AccessGrantReceipt");
  });
});

describe("computeGrantHash", () => {
  it("returns a 64-char hex string", () => {
    const hash = computeGrantHash(makeValidGrant());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const g = makeValidGrant();
    expect(computeGrantHash(g)).toBe(computeGrantHash(g));
  });

  it("changes when grant content changes", () => {
    const g1 = makeValidGrant("allow");
    const g2 = makeValidGrant("deny");
    expect(computeGrantHash(g1)).not.toBe(computeGrantHash(g2));
  });

  it("covers nested fields — changing matchedTokenIds changes hash", () => {
    const g1 = makeValidGrant();
    const g2 = makeValidGrant();
    g2.ownership.matchedTokenIds = ["DEADBEEF"];
    expect(computeGrantHash(g1)).not.toBe(computeGrantHash(g2));
  });

  it("ignores existing grantHash field", () => {
    const g = makeValidGrant();
    const h1 = computeGrantHash(g);
    const stamped = { ...g, grantHash: "deadbeef".repeat(8) };
    expect(computeGrantHash(stamped)).toBe(h1);
  });
});

describe("stampGrantHash", () => {
  it("adds grantHash without mutating original", () => {
    const g = makeValidGrant();
    const stamped = stampGrantHash(g);
    expect(stamped.grantHash).toMatch(/^[a-f0-9]{64}$/);
    expect(g.grantHash).toBeUndefined();
  });

  it("produces a self-consistent hash", () => {
    const stamped = stampGrantHash(makeValidGrant());
    expect(stamped.grantHash).toBe(computeGrantHash(stamped));
  });
});
