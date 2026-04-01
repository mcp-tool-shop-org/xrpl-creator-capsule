import { describe, it, expect } from "vitest";
import type { IssuanceReceipt } from "./receipt.js";
import {
  validateReceipt,
  assertReceipt,
  computeReceiptHash,
  stampReceiptHash,
} from "./receipt-validate.js";

function makeValidReceipt(): IssuanceReceipt {
  return {
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId:
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    manifestRevisionHash:
      "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
    network: "testnet",
    issuedAt: "2026-04-01T00:00:00Z",
    issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    release: {
      title: "Night Signals",
      artist: "Test Artist",
      editionSize: 1,
      transferFee: 5000,
    },
    pointers: {
      metadataUri: "https://example.com/.well-known/xrpl-nft/night-signals",
      licenseUri: "https://example.com/license",
      coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    },
    xrpl: {
      authorizedMinterVerified: true,
      mintTxHashes: ["AABB11223344"],
      nftTokenIds: ["00081234ABCD"],
      tokenTaxon: 0,
      flags: 8,
      transferFee: 5000,
    },
    storage: {
      provider: "mock",
      mediaResolved: true,
      coverResolved: true,
    },
    verification: {
      manifestMatchesPointers: true,
      issuerOperatorSeparated: true,
      networkAllowed: true,
      errors: [],
      warnings: [],
    },
  };
}

describe("validateReceipt", () => {
  it("accepts a valid receipt", () => {
    const result = validateReceipt(makeValidReceipt());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects receipt missing required fields", () => {
    const result = validateReceipt({ schemaVersion: "1.0.0" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects wrong kind", () => {
    const receipt = { ...makeValidReceipt(), kind: "something-else" };
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid manifestId format", () => {
    const receipt = { ...makeValidReceipt(), manifestId: "not-hex" };
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid network", () => {
    const receipt = { ...makeValidReceipt(), network: "localhost" };
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(false);
  });
});

describe("assertReceipt", () => {
  it("returns typed receipt for valid input", () => {
    const receipt = assertReceipt(makeValidReceipt());
    expect(receipt.kind).toBe("issuance-receipt");
  });

  it("throws when issuer equals operator", () => {
    const receipt = makeValidReceipt();
    receipt.operatorAddress = receipt.issuerAddress;
    expect(() => assertReceipt(receipt)).toThrow("must differ");
  });

  it("throws when tokenIds/txHashes count mismatch", () => {
    const receipt = makeValidReceipt();
    receipt.xrpl.nftTokenIds = ["a", "b"];
    receipt.xrpl.mintTxHashes = ["x"];
    expect(() => assertReceipt(receipt)).toThrow("must equal");
  });
});

describe("computeReceiptHash", () => {
  it("returns a 64-char hex string", () => {
    const hash = computeReceiptHash(makeValidReceipt());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const receipt = makeValidReceipt();
    const h1 = computeReceiptHash(receipt);
    const h2 = computeReceiptHash(receipt);
    expect(h1).toBe(h2);
  });

  it("changes when receipt content changes", () => {
    const r1 = makeValidReceipt();
    const r2 = { ...makeValidReceipt(), issuedAt: "2026-04-02T00:00:00Z" };
    expect(computeReceiptHash(r1)).not.toBe(computeReceiptHash(r2));
  });

  it("ignores existing receiptHash field", () => {
    const receipt = makeValidReceipt();
    const h1 = computeReceiptHash(receipt);
    const stamped = { ...receipt, receiptHash: "deadbeef".repeat(8) };
    const h2 = computeReceiptHash(stamped);
    expect(h1).toBe(h2);
  });
});

describe("stampReceiptHash", () => {
  it("adds receiptHash without mutating original", () => {
    const receipt = makeValidReceipt();
    const stamped = stampReceiptHash(receipt);
    expect(stamped.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toBeUndefined();
  });

  it("produces a self-consistent hash", () => {
    const stamped = stampReceiptHash(makeValidReceipt());
    const recomputed = computeReceiptHash(stamped);
    expect(stamped.receiptHash).toBe(recomputed);
  });
});
