/**
 * Phase B5 Failure Drills — verify that deliberate mismatches produce
 * exact mismatch reasons, not silent passes.
 *
 * Run: npx vitest run artifacts/failure-drills.test.ts
 */
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { verifyRelease } from "../packages/cli/src/commands/verify-release.js";

const ARTIFACT_DIR = join(__dirname, "direct-rail");
const MANIFEST_PATH = join(ARTIFACT_DIR, "release.json");
const RECEIPT_PATH = join(ARTIFACT_DIR, "issuance-receipt.json");

let manifest: any;
let receipt: any;

beforeAll(async () => {
  manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
  receipt = JSON.parse(await readFile(RECEIPT_PATH, "utf-8"));
});

async function drillOffline(
  mutateManifest: (m: any) => any,
  mutateReceipt: (r: any) => any,
) {
  const ts = Date.now() + Math.random();
  const tmpManifest = join(__dirname, `_drill_manifest_${ts}.json`);
  const tmpReceipt = join(__dirname, `_drill_receipt_${ts}.json`);

  const m = mutateManifest(structuredClone(manifest));
  const r = mutateReceipt(structuredClone(receipt));

  await writeFile(tmpManifest, JSON.stringify(m, null, 2));
  await writeFile(tmpReceipt, JSON.stringify(r, null, 2));

  try {
    const result = await verifyRelease(tmpManifest, tmpReceipt);
    return result;
  } finally {
    await unlink(tmpManifest).catch(() => {});
    await unlink(tmpReceipt).catch(() => {});
  }
}

function expectFailed(result: Awaited<ReturnType<typeof verifyRelease>>, ...checkNames: string[]) {
  // The overall result should fail
  const offlineChecks = result.checks.filter(c => !c.name.startsWith("chain-"));
  const offlinePassed = offlineChecks.every(c => c.passed);
  expect(offlinePassed).toBe(false);

  const failedNames = result.checks.filter(c => !c.passed).map(c => c.name);
  for (const name of checkNames) {
    expect(failedNames, `Expected ${name} to fail`).toContain(name);
  }
}

describe("Phase B5 Failure Drills", () => {
  it("wrong signer (issuer mismatch)", async () => {
    const result = await drillOffline(
      (m) => m,
      (r) => { r.issuerAddress = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"; return r; },
    );
    expectFailed(result, "issuer-match");
  });

  it("tampered receipt (modified token ID)", async () => {
    const result = await drillOffline(
      (m) => m,
      (r) => {
        r.xrpl.nftTokenIds[0] = "DEADBEEF" + r.xrpl.nftTokenIds[0].slice(8);
        return r;
      },
    );
    expectFailed(result, "receipt-integrity");
  });

  it("manifest changed after issuance (title edited)", async () => {
    const result = await drillOffline(
      (m) => { m.title = "Modified Title After Issuance"; return m; },
      (r) => r,
    );
    expectFailed(result, "manifest-id-match", "revision-hash-match");
  });

  it("transfer fee mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.transferFeePercent = 10; return m; },
      (r) => r,
    );
    expectFailed(result, "transfer-fee-match");
  });

  it("metadata pointer mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.metadataEndpoint = "https://evil.example.com/swapped"; return m; },
      (r) => r,
    );
    expectFailed(result, "metadata-pointer");
  });

  it("edition count mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.editionSize = 5; return m; },
      (r) => r,
    );
    expectFailed(result, "edition-count");
  });

  it("operator mismatch", async () => {
    const result = await drillOffline(
      (m) => m,
      (r) => { r.operatorAddress = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"; return r; },
    );
    expectFailed(result, "operator-match");
  });

  it("license URI mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.license.uri = "https://evil.example.com/fake-license"; return m; },
      (r) => r,
    );
    expectFailed(result, "license-pointer");
  });

  it("cover CID mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.coverCid = "QmFAKEFAKEFAKEFAKEFAKEFAKE"; return m; },
      (r) => r,
    );
    expectFailed(result, "cover-cid");
  });

  it("media CID mismatch", async () => {
    const result = await drillOffline(
      (m) => { m.mediaCid = "QmFAKEFAKEFAKEFAKEFAKEFAKE"; return m; },
      (r) => r,
    );
    expectFailed(result, "media-cid");
  });
});
