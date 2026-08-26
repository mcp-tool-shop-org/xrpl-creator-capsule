import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWalletPair } from "@capsule/xrpl";
import { createGovernancePolicy } from "./create-governance-policy.js";

// F-c939eb27: create-governance-policy.ts is the first link in the
// governance/payout chain named in the finding (policy -> proposal ->
// decision -> execution -> verify) and had no test file at all. No @capsule/xrpl
// network calls happen anywhere in this command — generateWalletPair() below
// is pure key generation, used only to get real, checksum-valid r-addresses
// without hand-typing base58 strings (mirrors verify-payout.test.ts).

const treasuryPair = generateWalletPair();
const signerAPair = generateWalletPair();
const signerBPair = generateWalletPair();
const TREASURY = treasuryPair.issuer.address;
const SIGNER_A = signerAPair.issuer.address;
const SIGNER_B = signerBPair.issuer.address;

let tempDir: string;
let manifestPath: string;
let outputPath: string;

function makeValidManifest() {
  return {
    schemaVersion: "1.0.0",
    title: "Test Release",
    artist: "Test Artist",
    editionSize: 1,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/test-release",
    license: { type: "custom", summary: "Personal license.", uri: "https://example.com/license" },
    benefit: {
      kind: "stems",
      description: "Full stem pack for personal remixing",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: {
      treasuryAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      multiSig: false,
      terms: "Single artist.",
    },
    issuerAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    operatorAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    createdAt: "2026-04-01T00:00:00Z",
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-create-governance-policy-test-"));
  manifestPath = join(tempDir, "manifest.json");
  outputPath = join(tempDir, "governance-policy.json");
  await writeFile(manifestPath, JSON.stringify(makeValidManifest()));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function baseOpts() {
  return {
    manifestPath,
    treasuryAddress: TREASURY,
    network: "testnet" as const,
    signers: [
      { address: SIGNER_A, role: "artist" as const },
      { address: SIGNER_B, role: "manager" as const },
    ],
    threshold: 2,
    allowedAssets: ["XRP"],
    createdBy: "test-suite",
    outputPath,
  };
}

describe("createGovernancePolicy — happy path", () => {
  it("creates a stamped policy and writes it to disk", async () => {
    const policy = await createGovernancePolicy(baseOpts());

    expect(policy.kind).toBe("governance-policy");
    expect(policy.treasuryAddress).toBe(TREASURY);
    expect(policy.signerPolicy.signers).toHaveLength(2);
    expect(policy.signerPolicy.threshold).toBe(2);
    expect(policy.payoutPolicy.allowedAssets).toEqual(["XRP"]);
    expect(policy.payoutPolicy.allowPartialPayouts).toBe(false);
    expect(policy.policyHash).toMatch(/^[a-f0-9]{64}$/);

    const onDisk = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(onDisk.policyHash).toBe(policy.policyHash);
  });

  it("includes maxOutputsPerProposal only when explicitly provided", async () => {
    const withMax = await createGovernancePolicy({ ...baseOpts(), maxOutputsPerProposal: 5 });
    expect(withMax.payoutPolicy.maxOutputsPerProposal).toBe(5);

    const withoutMax = await createGovernancePolicy(baseOpts());
    expect(withoutMax.payoutPolicy.maxOutputsPerProposal).toBeUndefined();
  });
});

describe("createGovernancePolicy — structural invariants", () => {
  it("throws when the threshold exceeds the number of signers", async () => {
    await expect(
      createGovernancePolicy({ ...baseOpts(), threshold: 3 })
    ).rejects.toThrow(/[Tt]hreshold.*exceeds signer count/);
  });

  it("throws when signer addresses are not unique", async () => {
    await expect(
      createGovernancePolicy({
        ...baseOpts(),
        signers: [
          { address: SIGNER_A, role: "artist" },
          { address: SIGNER_A, role: "manager" },
        ],
        threshold: 1,
      })
    ).rejects.toThrow(/unique/i);
  });
});

describe("createGovernancePolicy — malformed / invalid manifest", () => {
  it("names the manifest file for malformed JSON instead of a bare SyntaxError", async () => {
    await writeFile(manifestPath, "{ not valid json");

    let caught: unknown;
    try {
      await createGovernancePolicy(baseOpts());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain(manifestPath);
  });

  it("rejects a well-formed but schema-invalid manifest", async () => {
    await writeFile(manifestPath, JSON.stringify({ not: "a manifest" }));

    await expect(createGovernancePolicy(baseOpts())).rejects.toThrow(/Invalid Release Manifest/);
  });
});
