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
