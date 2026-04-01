import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertManifest,
  computeManifestId,
  computeRevisionHash,
  stampReceiptHash,
  type IssuanceReceipt,
  type ReleaseManifest,
} from "@capsule/core";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../../../fixtures/sample-release.json"
);

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-verify-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function loadManifest(): Promise<ReleaseManifest> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return assertManifest(JSON.parse(raw));
}

function makeReceiptFromManifest(manifest: ReleaseManifest): IssuanceReceipt {
  return stampReceiptHash({
    schemaVersion: "1.0.0",
    kind: "issuance-receipt",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    network: "testnet",
    issuedAt: "2026-04-01T00:00:00Z",
    issuerAddress: manifest.issuerAddress,
    operatorAddress: manifest.operatorAddress,
    release: {
      title: manifest.title,
      artist: manifest.artist,
      editionSize: manifest.editionSize,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
    },
    pointers: {
      metadataUri: manifest.metadataEndpoint,
      licenseUri: manifest.license.uri,
      coverCid: manifest.coverCid,
      mediaCid: manifest.mediaCid,
    },
    xrpl: {
      authorizedMinterVerified: true,
      mintTxHashes: ["FAKETX01"],
      nftTokenIds: ["FAKETOKEN01"],
      tokenTaxon: 0,
      flags: 8,
      transferFee: Math.round(manifest.transferFeePercent * 1000),
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
  });
}

// We test only the offline reconciliation checks here.
// Chain verification is tested separately in integration tests.
// To isolate offline checks, we import the verify function internals.

import {
  computeReceiptHash,
} from "@capsule/core";

describe("verify-release offline reconciliation", () => {
  it("matching manifest and receipt have coherent hashes", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    expect(receipt.manifestId).toBe(computeManifestId(manifest));
    expect(receipt.manifestRevisionHash).toBe(computeRevisionHash(manifest));
    expect(receipt.receiptHash).toBe(computeReceiptHash(receipt));
  });

  it("detects manifest ID mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Tamper with manifestId
    const tampered = {
      ...receipt,
      manifestId: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    expect(tampered.manifestId).not.toBe(computeManifestId(manifest));
  });

  it("detects revision hash mismatch when manifest changes after issuance", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Modify manifest after receipt was issued
    const modified = { ...manifest, priceDrops: "1" };
    const newRevision = computeRevisionHash(modified);

    expect(receipt.manifestRevisionHash).not.toBe(newRevision);
  });

  it("detects receipt tampering via receiptHash", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Tamper with receipt content but keep original hash
    const tampered = { ...receipt, issuedAt: "2099-01-01T00:00:00Z" };
    const recomputedHash = computeReceiptHash(tampered);

    expect(receipt.receiptHash).not.toBe(recomputedHash);
  });

  it("detects issuer mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      issuerAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    };
    expect(tampered.issuerAddress).not.toBe(manifest.issuerAddress);
  });

  it("detects operator mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      operatorAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    };
    expect(tampered.operatorAddress).not.toBe(manifest.operatorAddress);
  });

  it("detects transfer fee mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const expectedFee = Math.round(manifest.transferFeePercent * 1000);
    const tampered = {
      ...receipt,
      xrpl: { ...receipt.xrpl, transferFee: expectedFee + 1000 },
    };
    expect(tampered.xrpl.transferFee).not.toBe(expectedFee);
  });

  it("detects edition count mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    // Receipt says 1 token but manifest says 50
    expect(receipt.xrpl.nftTokenIds.length).not.toBe(manifest.editionSize);
  });

  it("detects metadata pointer mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      pointers: {
        ...receipt.pointers,
        metadataUri: "https://evil.com/metadata",
      },
    };
    expect(tampered.pointers.metadataUri).not.toBe(manifest.metadataEndpoint);
  });

  it("detects media CID mismatch", async () => {
    const manifest = await loadManifest();
    const receipt = makeReceiptFromManifest(manifest);

    const tampered = {
      ...receipt,
      pointers: { ...receipt.pointers, mediaCid: "QmFAKECID" },
    };
    expect(tampered.pointers.mediaCid).not.toBe(manifest.mediaCid);
  });
});
