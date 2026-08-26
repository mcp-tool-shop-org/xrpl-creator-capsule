import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertManifest } from "@capsule/core";
import {
  buildConfigureMinterPayload,
  buildMintPayload,
  buildBuyPayload,
} from "./payloads.js";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../fixtures/sample-release.json"
);

async function loadManifest() {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return assertManifest(JSON.parse(raw));
}

describe("buildConfigureMinterPayload", () => {
  it("creates an AccountSet payload", () => {
    const payload = buildConfigureMinterPayload(
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      "testnet"
    );
    expect(payload.kind).toBe("configure-minter");
    expect(payload.txjson.TransactionType).toBe("AccountSet");
    expect(payload.txjson.NFTokenMinter).toBe(
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    );
    expect(payload.network).toBe("testnet");
  });

  it("includes return URL when provided", () => {
    const payload = buildConfigureMinterPayload(
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      "testnet",
      "https://example.com/callback"
    );
    expect(payload.returnUrl).toBe("https://example.com/callback");
  });

  it("attaches capsule metadata", () => {
    const payload = buildConfigureMinterPayload(
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      "mainnet"
    );
    expect(payload.metadata?.capsuleAction).toBe("configure-minter");
    expect(payload.metadata?.operatorAddress).toBe(
      "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    );
  });
});

describe("buildMintPayload", () => {
  it("creates an NFTokenMint payload from manifest", async () => {
    const manifest = await loadManifest();
    const payload = buildMintPayload(manifest, "testnet");

    expect(payload.kind).toBe("mint-release");
    expect(payload.txjson.TransactionType).toBe("NFTokenMint");
    expect(payload.txjson.Issuer).toBe(manifest.issuerAddress);
    expect(payload.txjson.Flags).toBe(0x00000008); // tfTransferable
    expect(payload.txjson.TransferFee).toBe(
      Math.round(manifest.transferFeePercent * 1000)
    );
    expect(payload.txjson.NFTokenTaxon).toBe(0);
  });

  it("hex-encodes the metadata URI", async () => {
    const manifest = await loadManifest();
    const payload = buildMintPayload(manifest, "testnet");

    const uri = payload.txjson.URI as string;
    expect(uri).toMatch(/^[0-9A-F]+$/); // uppercase hex
    const decoded = Buffer.from(uri, "hex").toString("utf-8");
    expect(decoded).toBe(manifest.metadataEndpoint);
  });

  it("attaches release metadata", async () => {
    const manifest = await loadManifest();
    const payload = buildMintPayload(manifest, "testnet");

    expect(payload.metadata?.releaseTitle).toBe(manifest.title);
    expect(payload.metadata?.releaseArtist).toBe(manifest.artist);
  });

  it("rejects metadata endpoint over 256 bytes", async () => {
    const manifest = await loadManifest();
    const longUri = { ...manifest, metadataEndpoint: "https://example.com/" + "x".repeat(300) };
    expect(() => buildMintPayload(longUri, "testnet")).toThrow("256 bytes");
  });
});

// F-b458d21c: buildMintPayload's TransferFee computation
// (Math.round(transferFeePercent * 1000)) was named directly in the finding
// as untested — the existing "creates an NFTokenMint payload" test above
// only exercises the fixture's fixed 5% value. These pin the actual
// rounding contract at its boundaries and a fractional input.
describe("buildMintPayload — transferFee computation", () => {
  it("rounds a fractional transferFeePercent to the nearest XRPL TransferFee unit", async () => {
    const manifest = await loadManifest();
    const fractional = { ...manifest, transferFeePercent: 12.3456 };

    const payload = buildMintPayload(fractional, "testnet");

    expect(payload.txjson.TransferFee).toBe(12346); // Math.round(12345.6)
  });

  it("computes TransferFee 0 at the 0% boundary", async () => {
    const manifest = await loadManifest();
    const zero = { ...manifest, transferFeePercent: 0 };

    const payload = buildMintPayload(zero, "testnet");

    expect(payload.txjson.TransferFee).toBe(0);
  });

  it("computes TransferFee 50000 at the 50% boundary", async () => {
    const manifest = await loadManifest();
    const fifty = { ...manifest, transferFeePercent: 50 };

    const payload = buildMintPayload(fifty, "testnet");

    expect(payload.txjson.TransferFee).toBe(50000);
  });

  // Documents CURRENT behavior, not a fix. packages/xrpl/src/mint.ts's
  // percentToTransferFee defensively throws outside 0-50%; this sibling
  // function in @capsule/xaman has no equivalent guard, so a manifest
  // object that reaches buildMintPayload without having passed through
  // @capsule/core's assertManifest (whose schema DOES enforce 0-50, see
  // packages/core/src/schema.ts) would silently produce a TransferFee
  // outside XRPL's own valid 0-50000 field range, deferring the failure to
  // either Xaman or ledger submission instead of failing fast with a clear
  // message here. Flagged for the coordinator rather than fixed — this
  // agent's scope is tests only, and the two-module inconsistency may be
  // intentional (payloads.ts's contract may assume assertManifest already
  // ran upstream).
  it("does not (currently) reject an out-of-range transferFeePercent the way mint.ts's percentToTransferFee does", async () => {
    const manifest = await loadManifest();
    const outOfRange = { ...manifest, transferFeePercent: 75 };

    const payload = buildMintPayload(outOfRange, "testnet");

    expect(payload.txjson.TransferFee).toBe(75000);
  });
});

describe("buildBuyPayload", () => {
  it("creates an NFTokenAcceptOffer payload", () => {
    const payload = buildBuyPayload("OFFER123ABC", "testnet");
    expect(payload.kind).toBe("buy-release");
    expect(payload.txjson.TransactionType).toBe("NFTokenAcceptOffer");
    expect(payload.txjson.NFTokenSellOffer).toBe("OFFER123ABC");
  });

  it("attaches sell offer ID in metadata", () => {
    const payload = buildBuyPayload("OFFER123ABC", "mainnet");
    expect(payload.metadata?.sellOfferId).toBe("OFFER123ABC");
    expect(payload.network).toBe("mainnet");
  });
});
