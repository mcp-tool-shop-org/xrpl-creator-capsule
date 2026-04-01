/**
 * Phase 3 — Simulation & Concurrency Trials
 *
 * Pressure-tests the engine under real-use density:
 *
 * Trial 1: Time-compressed operator simulation
 *   - Back-to-back releases, context isolation, naming confusion
 *
 * Trial 2: Adversarial interruption simulation
 *   - Broken paths, stale data, modified artifacts, partial state
 *
 * Trial 3: Concurrent real-use simulation
 *   - Cross-release contamination, governance overlap, session confusion
 *
 * Each scenario exercises the same engine functions the bridge-worker
 * calls. No UI layer — pure truth-boundary testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertManifest,
  validateManifest,
  computeManifestId,
  computeRevisionHash,
  stampManifestId,
  resolveManifestPointers,
  assertReceipt,
  computeReceiptHash,
  stampReceiptHash,
  assertAccessPolicy,
  checkPolicyCoherence,
  stampGrantHash,
  deriveRecoveryBundle,
  verifyBundleConsistency,
  assertGovernancePolicy,
  stampPolicyHash,
  stampProposalHash,
  stampDecisionHash,
  stampExecutionHash,
  computePolicyHash,
  computeProposalHash,
  computeDecisionHash,
  computeExecutionHash,
  checkProposalAgainstPolicy,
  evaluateApprovals,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
} from "@capsule/core";
import type {
  ReleaseManifest,
  IssuanceReceipt,
  AccessPolicy,
  GovernancePolicy,
  PayoutProposal,
  PayoutDecisionReceipt,
  PayoutExecutionReceipt,
  GovernanceSigner,
} from "@capsule/core";

// ── Helpers ──────────────────────────────────────────────────────────

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");
const TRIAL_DIR = join(import.meta.dirname, "..", "artifacts", "simulation-trials");

const ISSUER = "rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX";
const OPERATOR = "rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh";
const SIGNER_A = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const SIGNER_B = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const NON_HOLDER = "rNonHolderAddress000000000000000000";

/** Create a unique manifest with given overrides */
function makeManifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  return assertManifest({
    schemaVersion: "1.0.0",
    title: `Release-${randomUUID().slice(0, 8)}`,
    artist: "Simulation Artist",
    editionSize: 1,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/sim-release",
    license: {
      type: "personal-use",
      summary: "Personal, non-commercial use.",
      uri: "https://example.com/license",
    },
    benefit: {
      kind: "stems",
      description: "Bonus stems pack",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: {
      treasuryAddress: ISSUER,
      multiSig: false,
      terms: "Single artist release.",
    },
    issuerAddress: ISSUER,
    operatorAddress: OPERATOR,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

/** Create a mock receipt for a manifest */
function makeReceipt(manifest: ReleaseManifest, tokenSuffix: string = "0001"): IssuanceReceipt {
  const receipt: IssuanceReceipt = {
    schemaVersion: "1.0.0",
    manifestId: computeManifestId(manifest),
    manifestRevisionHash: computeRevisionHash(manifest),
    issuerAddress: manifest.issuerAddress,
    operatorAddress: manifest.operatorAddress,
    network: "testnet",
    issuedAt: new Date().toISOString(),
    xrpl: {
      nftTokenIds: [`00080000${ISSUER.slice(0, 20)}${tokenSuffix.padStart(24, "0")}`],
      mintTxHashes: [`AABB${tokenSuffix.padStart(60, "0")}`],
      transferFee: Math.round(manifest.transferFeePercent * 1000),
      tokenTaxon: 0,
    },
    pointers: {
      metadataUri: manifest.metadataEndpoint,
      licenseUri: manifest.license.uri,
      coverCid: manifest.coverCid,
      mediaCid: manifest.mediaCid,
    },
    storageProvider: "mock",
  };
  return stampReceiptHash(receipt as any) as any;
}

/** Create an access policy for a manifest + receipt */
function makeAccessPolicy(manifest: ReleaseManifest, receipt: IssuanceReceipt): AccessPolicy {
  return {
    schemaVersion: "1.0.0",
    kind: "access-policy",
    manifestId: computeManifestId(manifest),
    label: "simulation-policy",
    benefit: {
      kind: manifest.benefit.kind,
      contentPointer: manifest.benefit.contentPointer,
    },
    rule: {
      type: "holds-nft",
      issuerAddress: manifest.issuerAddress,
      qualifyingTokenIds: receipt.xrpl.nftTokenIds,
    },
    delivery: { mode: "download-token", ttlSeconds: 3600 },
    createdAt: new Date().toISOString(),
  };
}

/** Create a governance policy for a manifest */
function makeGovPolicy(manifestId: string, signers: GovernanceSigner[] = [
  { address: SIGNER_A, role: "artist" },
  { address: SIGNER_B, role: "producer" },
]): GovernancePolicy {
  return stampPolicyHash(assertGovernancePolicy({
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId,
    network: "testnet",
    treasuryAddress: ISSUER,
    signerPolicy: { signers, threshold: signers.length },
    payoutPolicy: { allowedAssets: ["XRP"], allowPartialPayouts: false },
    createdAt: new Date().toISOString(),
    createdBy: "simulation",
  }));
}

/** Full governance chain for a release */
function makeFullGovChain(manifestId: string) {
  const policy = makeGovPolicy(manifestId);

  const proposal = stampProposalHash({
    schemaVersion: "1.0.0" as const,
    kind: "payout-proposal" as const,
    manifestId,
    policyHash: policy.policyHash!,
    proposalId: `payout-${randomUUID().slice(0, 8)}`,
    network: "testnet" as const,
    treasuryAddress: ISSUER,
    createdAt: new Date().toISOString(),
    createdBy: "simulation",
    outputs: [
      { address: SIGNER_A, amount: "60.0", asset: "XRP", role: "artist" as const, reason: "Creator share" },
      { address: SIGNER_B, amount: "40.0", asset: "XRP", role: "producer" as const, reason: "Producer share" },
    ],
  });

  const approvals = [
    { signerAddress: SIGNER_A, approved: true, decidedAt: new Date().toISOString() },
    { signerAddress: SIGNER_B, approved: true, decidedAt: new Date().toISOString() },
  ];
  const evalResult = evaluateApprovals(proposal, policy, approvals);

  const decision = stampDecisionHash({
    schemaVersion: "1.0.0" as const,
    kind: "payout-decision-receipt" as const,
    manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    network: "testnet" as const,
    treasuryAddress: ISSUER,
    approvals,
    decision: {
      outcome: evalResult.outcome,
      thresholdMet: evalResult.thresholdMet,
      approvedCount: evalResult.approvedCount,
      rejectedCount: evalResult.rejectedCount,
    },
    decidedAt: new Date().toISOString(),
    decidedBy: "simulation",
  });

  const execution = stampExecutionHash({
    schemaVersion: "1.0.0" as const,
    kind: "payout-execution-receipt" as const,
    manifestId,
    policyHash: policy.policyHash!,
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash!,
    decisionHash: decision.decisionHash!,
    network: "testnet" as const,
    treasuryAddress: ISSUER,
    executedAt: new Date().toISOString(),
    executedBy: "simulation",
    xrpl: { txHashes: [`AABB${randomUUID().replace(/-/g, "").slice(0, 56)}SIM001`] },
    executedOutputs: proposal.outputs.map((o) => ({ ...o })),
    verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
  });

  return { policy, proposal, decision, execution };
}

/** Write artifact JSON to temp dir */
async function writeArtifact(dir: string, name: string, data: unknown): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  return path;
}

// ── Trial workspace ─────────────────────────────────────────────────

let trialDir: string;

beforeEach(async () => {
  trialDir = join(TRIAL_DIR, `run-${Date.now()}-${randomUUID().slice(0, 6)}`);
  await mkdir(trialDir, { recursive: true });
});

afterEach(async () => {
  try { await rm(trialDir, { recursive: true, force: true }); } catch { /* ok */ }
});

// =====================================================================
// TRIAL 1: Time-compressed operator simulation
// =====================================================================

describe("Trial 1: Time-compressed operator simulation", () => {

  it("scenario 1.1: three releases back-to-back have isolated manifest IDs", () => {
    const m1 = makeManifest({ title: "Album Alpha" });
    const m2 = makeManifest({ title: "Album Beta" });
    const m3 = makeManifest({ title: "Album Gamma" });

    const id1 = computeManifestId(m1);
    const id2 = computeManifestId(m2);
    const id3 = computeManifestId(m3);

    // All unique
    expect(new Set([id1, id2, id3]).size).toBe(3);

    // Stable on recompute
    expect(computeManifestId(m1)).toBe(id1);
    expect(computeManifestId(m2)).toBe(id2);
    expect(computeManifestId(m3)).toBe(id3);
  });

  it("scenario 1.2: receipt from Release A does not validate against Release B", () => {
    const mA = makeManifest({ title: "Release A" });
    const mB = makeManifest({ title: "Release B" });
    const receiptA = makeReceipt(mA, "AAAA");

    // Receipt A belongs to manifest A
    expect(receiptA.manifestId).toBe(computeManifestId(mA));

    // Receipt A does NOT match manifest B
    expect(receiptA.manifestId).not.toBe(computeManifestId(mB));

    // Revision hash mismatch
    expect(receiptA.manifestRevisionHash).not.toBe(computeRevisionHash(mB));
  });

  it("scenario 1.3: governance policy for Release A rejects proposal referencing Release B", () => {
    const mA = makeManifest({ title: "Release A" });
    const mB = makeManifest({ title: "Release B" });
    const idA = computeManifestId(mA);
    const idB = computeManifestId(mB);

    const policyA = makeGovPolicy(idA);

    // Proposal targeting Release B's manifestId
    const badProposal = stampProposalHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-proposal" as const,
      manifestId: idB, // WRONG — targets Release B
      policyHash: policyA.policyHash!,
      proposalId: "cross-release-attempt",
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      createdAt: new Date().toISOString(),
      createdBy: "simulation",
      outputs: [
        { address: SIGNER_A, amount: "100.0", asset: "XRP", role: "artist" as const, reason: "Full take" },
      ],
    });

    const check = checkProposalAgainstPolicy(badProposal, policyA);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("manifestId"))).toBe(true);
  });

  it("scenario 1.4: five rapid releases all produce valid recovery bundles", () => {
    for (let i = 0; i < 5; i++) {
      const manifest = makeManifest({ title: `Rapid Release ${i + 1}` });
      const receipt = makeReceipt(manifest, `R${i}`);
      const bundle = deriveRecoveryBundle(manifest, receipt);
      const verification = verifyBundleConsistency(bundle, manifest, receipt);

      expect(verification.valid).toBe(true);
      expect(bundle.manifestId).toBe(computeManifestId(manifest));
      expect(bundle.title).toBe(manifest.title);
    }
  });

  it("scenario 1.5: access policy from Release A denies access when checked against Release B receipt", () => {
    const mA = makeManifest({ title: "Release A" });
    const mB = makeManifest({ title: "Release B" });
    const receiptA = makeReceipt(mA, "AAAA");
    const receiptB = makeReceipt(mB, "BBBB");
    const policyA = makeAccessPolicy(mA, receiptA);

    // Policy A's qualifying tokens come from Receipt A
    // Receipt B has different tokens
    const tokensMatch = policyA.rule.qualifyingTokenIds.some(
      (t) => receiptB.xrpl.nftTokenIds.includes(t)
    );
    expect(tokensMatch).toBe(false);
  });

  it("scenario 1.6: repeated governance chains on same manifest diverge at proposal stage", () => {
    const manifest = makeManifest({ title: "Shared Release" });
    const manifestId = computeManifestId(manifest);

    const chain1 = makeFullGovChain(manifestId);
    const chain2 = makeFullGovChain(manifestId);

    // Policies may share hash if created at same instant (content-addressed).
    // But proposals have unique IDs → different hashes from proposal onward.
    expect(chain1.proposal.proposalId).not.toBe(chain2.proposal.proposalId);
    expect(chain1.proposal.proposalHash).not.toBe(chain2.proposal.proposalHash);
    expect(chain1.decision.decisionHash).not.toBe(chain2.decision.decisionHash);
    expect(chain1.execution.executionHash).not.toBe(chain2.execution.executionHash);

    // Both chains are internally valid
    expect(checkProposalAgainstPolicy(chain1.proposal, chain1.policy).valid).toBe(true);
    expect(checkProposalAgainstPolicy(chain2.proposal, chain2.policy).valid).toBe(true);

    // Chain1's execution does not validate against chain2's decision
    const crossCheck = checkExecutionAgainstDecision(chain1.execution, chain2.decision, chain2.proposal, chain2.policy);
    expect(crossCheck.valid).toBe(false);
  });
});

// =====================================================================
// TRIAL 2: Adversarial interruption simulation
// =====================================================================

describe("Trial 2: Adversarial interruption simulation", () => {

  it("scenario 2.1: manifest modified after receipt — revision hash detects tampering", () => {
    const manifest = makeManifest({ title: "Original Title" });
    const receipt = makeReceipt(manifest, "MOD1");

    // Tamper with manifest after issuance
    const tampered = { ...manifest, title: "Modified Title" };
    const newRevision = computeRevisionHash(tampered);

    expect(receipt.manifestRevisionHash).not.toBe(newRevision);
  });

  it("scenario 2.2: receipt hash tampered — integrity check detects it", () => {
    const manifest = makeManifest();
    const receipt = makeReceipt(manifest, "TAMP");

    // Tamper with receipt field
    const tampered = { ...receipt, issuedAt: "2099-01-01T00:00:00Z" };
    const recomputed = computeReceiptHash(tampered as any);
    expect(tampered.receiptHash).not.toBe(recomputed);
  });

  it("scenario 2.3: recovery bundle from wrong manifest fails consistency", () => {
    const mA = makeManifest({ title: "Manifest A" });
    const mB = makeManifest({ title: "Manifest B" });
    const receiptA = makeReceipt(mA, "RCA1");

    // Derive bundle from correct pair
    const bundle = deriveRecoveryBundle(mA, receiptA);

    // Verify against wrong manifest
    const crossCheck = verifyBundleConsistency(bundle, mB, receiptA);
    expect(crossCheck.valid).toBe(false);
  });

  it("scenario 2.4: stale governance policy (modified signers) breaks proposal validation", () => {
    const manifest = makeManifest();
    const manifestId = computeManifestId(manifest);

    // V1: two signers, threshold 2
    const policyV1 = makeGovPolicy(manifestId, [
      { address: SIGNER_A, role: "artist" },
      { address: SIGNER_B, role: "producer" },
    ]);

    // V2: different signer set (simulates policy update)
    const policyV2 = makeGovPolicy(manifestId, [
      { address: SIGNER_A, role: "artist" },
      { address: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv", role: "producer" },
    ]);

    // Different signers → different hash
    expect(policyV1.policyHash).not.toBe(policyV2.policyHash);

    // Proposal targets V1's hash
    const proposal = stampProposalHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-proposal" as const,
      manifestId,
      policyHash: policyV1.policyHash!,
      proposalId: "stale-policy-test",
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      createdAt: new Date().toISOString(),
      createdBy: "simulation",
      outputs: [
        { address: SIGNER_A, amount: "50.0", asset: "XRP", role: "artist" as const, reason: "Split" },
      ],
    });

    // Valid against V1
    expect(checkProposalAgainstPolicy(proposal, policyV1).valid).toBe(true);

    // Invalid against V2 (policyHash mismatch)
    const check = checkProposalAgainstPolicy(proposal, policyV2);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("policyHash"))).toBe(true);
  });

  it("scenario 2.5: decision with forged signer address fails validation", () => {
    const manifest = makeManifest();
    const manifestId = computeManifestId(manifest);
    const policy = makeGovPolicy(manifestId);

    const proposal = stampProposalHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-proposal" as const,
      manifestId,
      policyHash: policy.policyHash!,
      proposalId: "forged-signer-test",
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      createdAt: new Date().toISOString(),
      createdBy: "simulation",
      outputs: [
        { address: SIGNER_A, amount: "100.0", asset: "XRP", role: "artist" as const, reason: "Full" },
      ],
    });

    // Approval from a non-signer
    const forgedApprovals = [
      { signerAddress: "rFORGED_ADDRESS_NOT_IN_POLICY_LIST", approved: true, decidedAt: new Date().toISOString() },
      { signerAddress: SIGNER_B, approved: true, decidedAt: new Date().toISOString() },
    ];

    const decision = stampDecisionHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-decision-receipt" as const,
      manifestId,
      policyHash: policy.policyHash!,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash!,
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      approvals: forgedApprovals,
      decision: { outcome: "approved", thresholdMet: true, approvedCount: 2, rejectedCount: 0 },
      decidedAt: new Date().toISOString(),
      decidedBy: "simulation",
    });

    const check = checkDecisionAgainstProposal(decision, proposal, policy);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.toLowerCase().includes("signer"))).toBe(true);
  });

  it("scenario 2.6: execution with wrong decisionHash breaks chain verification", () => {
    const manifest = makeManifest();
    const manifestId = computeManifestId(manifest);
    const { policy, proposal, decision } = makeFullGovChain(manifestId);

    // Execution referencing a fabricated decisionHash
    const badExecution = stampExecutionHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-execution-receipt" as const,
      manifestId,
      policyHash: policy.policyHash!,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash!,
      decisionHash: "0000000000000000000000000000000000000000000000000000000000000BAD",
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      executedAt: new Date().toISOString(),
      executedBy: "simulation",
      xrpl: { txHashes: ["AABB00000000000000000000000000000000000000000000000000000000BAD1"] },
      executedOutputs: proposal.outputs.map((o) => ({ ...o })),
      verification: { matchesApprovedProposal: true, errors: [], warnings: [] },
    });

    const check = checkExecutionAgainstDecision(badExecution, decision, proposal, policy);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("decisionHash"))).toBe(true);
  });

  it("scenario 2.7: rejected decision blocks execution attempt", () => {
    const manifest = makeManifest();
    const manifestId = computeManifestId(manifest);
    const policy = makeGovPolicy(manifestId);

    const proposal = stampProposalHash({
      schemaVersion: "1.0.0" as const,
      kind: "payout-proposal" as const,
      manifestId,
      policyHash: policy.policyHash!,
      proposalId: "rejected-test",
      network: "testnet" as const,
      treasuryAddress: ISSUER,
      createdAt: new Date().toISOString(),
      createdBy: "simulation",
      outputs: [
        { address: SIGNER_A, amount: "100.0", asset: "XRP", role: "artist" as const, reason: "Full take" },
      ],
    });

    // One approves, one rejects → threshold not met (2/2)
    const approvals = [
      { signerAddress: SIGNER_A, approved: true, decidedAt: new Date().toISOString() },
      { signerAddress: SIGNER_B, approved: false, decidedAt: new Date().toISOString() },
    ];
    const evalResult = evaluateApprovals(proposal, policy, approvals);
    expect(evalResult.outcome).toBe("rejected");
    expect(evalResult.thresholdMet).toBe(false);
  });

  it("scenario 2.8: governance hash recomputation detects field tampering", () => {
    const manifest = makeManifest();
    const manifestId = computeManifestId(manifest);
    const policy = makeGovPolicy(manifestId);

    // Tamper with treasury after stamping
    const tampered = { ...policy, treasuryAddress: "rTamperedTreasuryAddress" } as GovernancePolicy;
    const recomputed = computePolicyHash(tampered);
    expect(tampered.policyHash).not.toBe(recomputed);
  });

  it("scenario 2.9: disk round-trip preserves hash integrity", async () => {
    const manifest = makeManifest({ title: "Disk Round-Trip" });
    const manifestId = computeManifestId(manifest);
    const chain = makeFullGovChain(manifestId);

    // Write to disk
    await writeArtifact(trialDir, "policy.json", chain.policy);
    await writeArtifact(trialDir, "proposal.json", chain.proposal);
    await writeArtifact(trialDir, "decision.json", chain.decision);
    await writeArtifact(trialDir, "execution.json", chain.execution);

    // Read back
    const rePolicy = assertGovernancePolicy(JSON.parse(await readFile(join(trialDir, "policy.json"), "utf-8")));
    const reProposal = JSON.parse(await readFile(join(trialDir, "proposal.json"), "utf-8")) as PayoutProposal;
    const reDecision = JSON.parse(await readFile(join(trialDir, "decision.json"), "utf-8")) as PayoutDecisionReceipt;
    const reExecution = JSON.parse(await readFile(join(trialDir, "execution.json"), "utf-8")) as PayoutExecutionReceipt;

    // All hashes survive round-trip
    expect(computePolicyHash(rePolicy)).toBe(chain.policy.policyHash);
    expect(computeProposalHash(reProposal)).toBe(chain.proposal.proposalHash);
    expect(computeDecisionHash(reDecision)).toBe(chain.decision.decisionHash);
    expect(computeExecutionHash(reExecution)).toBe(chain.execution.executionHash);

    // Cross-contract checks still pass
    expect(checkProposalAgainstPolicy(reProposal, rePolicy).valid).toBe(true);
    expect(checkDecisionAgainstProposal(reDecision, reProposal, rePolicy).valid).toBe(true);
    expect(checkExecutionAgainstDecision(reExecution, reDecision, reProposal, rePolicy).valid).toBe(true);
  });
});

// =====================================================================
// TRIAL 3: Concurrent real-use simulation
// =====================================================================

describe("Trial 3: Concurrent real-use simulation", () => {

  it("scenario 3.1: two releases created in parallel never share manifest IDs", () => {
    const releases = Array.from({ length: 10 }, (_, i) =>
      makeManifest({ title: `Parallel Release ${i}` })
    );

    const ids = releases.map((m) => computeManifestId(m));
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
  });

  it("scenario 3.2: governance on Release A is invisible to Release B", () => {
    const mA = makeManifest({ title: "Gov Release A" });
    const mB = makeManifest({ title: "Gov Release B" });
    const idA = computeManifestId(mA);
    const idB = computeManifestId(mB);

    const chainA = makeFullGovChain(idA);
    const chainB = makeFullGovChain(idB);

    // Each chain references its own manifest
    expect(chainA.policy.manifestId).toBe(idA);
    expect(chainB.policy.manifestId).toBe(idB);
    expect(chainA.policy.manifestId).not.toBe(chainB.policy.manifestId);

    // Cross-chain proposal validation fails
    const crossCheck = checkProposalAgainstPolicy(chainA.proposal, chainB.policy);
    expect(crossCheck.valid).toBe(false);
  });

  it("scenario 3.3: recovery bundles from parallel releases never cross-validate", () => {
    const mA = makeManifest({ title: "Recovery A" });
    const mB = makeManifest({ title: "Recovery B" });
    const receiptA = makeReceipt(mA, "RCYA");
    const receiptB = makeReceipt(mB, "RCYB");

    const bundleA = deriveRecoveryBundle(mA, receiptA);
    const bundleB = deriveRecoveryBundle(mB, receiptB);

    // Self-consistency passes
    expect(verifyBundleConsistency(bundleA, mA, receiptA).valid).toBe(true);
    expect(verifyBundleConsistency(bundleB, mB, receiptB).valid).toBe(true);

    // Cross-consistency fails
    expect(verifyBundleConsistency(bundleA, mB, receiptB).valid).toBe(false);
    expect(verifyBundleConsistency(bundleB, mA, receiptA).valid).toBe(false);
  });

  it("scenario 3.4: access tokens from Release A do not unlock Release B", () => {
    const mA = makeManifest({ title: "Access A" });
    const mB = makeManifest({ title: "Access B" });
    const receiptA = makeReceipt(mA, "ACSA");
    const receiptB = makeReceipt(mB, "ACSB");

    const policyA = makeAccessPolicy(mA, receiptA);
    const policyB = makeAccessPolicy(mB, receiptB);

    // Tokens are release-specific
    const tokenOverlap = policyA.rule.qualifyingTokenIds.some(
      (t) => policyB.rule.qualifyingTokenIds.includes(t)
    );
    expect(tokenOverlap).toBe(false);

    // ManifestIDs are different
    expect(policyA.manifestId).not.toBe(policyB.manifestId);
  });

  it("scenario 3.5: 10 parallel governance chains maintain internal consistency", () => {
    const chains = Array.from({ length: 10 }, (_, i) => {
      const manifest = makeManifest({ title: `Parallel Gov ${i}` });
      const manifestId = computeManifestId(manifest);
      return { manifestId, ...makeFullGovChain(manifestId) };
    });

    for (const chain of chains) {
      // Hash integrity
      expect(computePolicyHash(chain.policy)).toBe(chain.policy.policyHash);
      expect(computeProposalHash(chain.proposal)).toBe(chain.proposal.proposalHash);
      expect(computeDecisionHash(chain.decision)).toBe(chain.decision.decisionHash);
      expect(computeExecutionHash(chain.execution)).toBe(chain.execution.executionHash);

      // Cross-contract references
      expect(chain.proposal.policyHash).toBe(chain.policy.policyHash);
      expect(chain.decision.proposalHash).toBe(chain.proposal.proposalHash);
      expect(chain.execution.decisionHash).toBe(chain.decision.decisionHash);

      // Validation passes
      expect(checkProposalAgainstPolicy(chain.proposal, chain.policy).valid).toBe(true);
      expect(checkDecisionAgainstProposal(chain.decision, chain.proposal, chain.policy).valid).toBe(true);
      expect(checkExecutionAgainstDecision(chain.execution, chain.decision, chain.proposal, chain.policy).valid).toBe(true);
    }

    // No hash collisions across chains
    const allPolicyHashes = chains.map((c) => c.policy.policyHash);
    expect(new Set(allPolicyHashes).size).toBe(10);
  });

  it("scenario 3.6: governance chain from Release A fails all cross-contract checks against Release B", () => {
    const mA = makeManifest({ title: "Cross A" });
    const mB = makeManifest({ title: "Cross B" });
    const idA = computeManifestId(mA);
    const idB = computeManifestId(mB);

    const chainA = makeFullGovChain(idA);
    const policyB = makeGovPolicy(idB);

    // Every cross-check should fail
    const proposalCross = checkProposalAgainstPolicy(chainA.proposal, policyB);
    expect(proposalCross.valid).toBe(false);

    // Decision against B's context should fail
    const decisionCross = checkDecisionAgainstProposal(chainA.decision, chainA.proposal, policyB);
    expect(decisionCross.valid).toBe(false);
  });

  it("scenario 3.7: simultaneous disk writes maintain artifact isolation", async () => {
    const releases = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        const dir = join(trialDir, `release-${i}`);
        await mkdir(dir, { recursive: true });

        const manifest = makeManifest({ title: `Disk Release ${i}` });
        const receipt = makeReceipt(manifest, `DR${i}`);
        const manifestId = computeManifestId(manifest);

        await writeArtifact(dir, "manifest.json", manifest);
        await writeArtifact(dir, "receipt.json", receipt);

        return { dir, manifest, receipt, manifestId };
      })
    );

    // Read back and verify isolation
    for (const rel of releases) {
      const readManifest = assertManifest(JSON.parse(await readFile(join(rel.dir, "manifest.json"), "utf-8")));
      const readId = computeManifestId(readManifest);
      expect(readId).toBe(rel.manifestId);
      expect(readManifest.title).toBe(rel.manifest.title);
    }

    // No cross-contamination
    for (let i = 0; i < releases.length; i++) {
      for (let j = i + 1; j < releases.length; j++) {
        expect(releases[i].manifestId).not.toBe(releases[j].manifestId);
      }
    }
  });

  it("scenario 3.8: Studio-style draft→manifest→receipt→recovery full loop", () => {
    // Simulates what Studio Mode does: build manifest from draft fields
    const studioDraft = {
      title: "My First Album",
      artist: "New Creator",
      editionSize: 3,
      coverCid: "QmStudioCoverCid",
      mediaCid: "QmStudioMediaCid",
      benefitKind: "bonus-track",
      benefitDescription: "3 unreleased demos",
      transferFeePercent: 5,
    };

    // Draft → Manifest (what PublishPage.draftToManifest does)
    const manifest = makeManifest({
      title: studioDraft.title,
      artist: studioDraft.artist,
      editionSize: studioDraft.editionSize,
      coverCid: studioDraft.coverCid,
      mediaCid: studioDraft.mediaCid,
      benefit: {
        kind: studioDraft.benefitKind,
        description: studioDraft.benefitDescription,
        contentPointer: studioDraft.mediaCid,
      },
      transferFeePercent: studioDraft.transferFeePercent,
    });

    // Validate
    const validation = validateManifest(manifest);
    expect(validation.valid).toBe(true);

    // Stamp
    const stamped = stampManifestId(manifest);
    expect(stamped.id).toBeDefined();

    // Mock mint → receipt
    const receipt = makeReceipt(manifest, "STU1");
    expect(receipt.manifestId).toBe(computeManifestId(manifest));

    // Access policy
    const policy = makeAccessPolicy(manifest, receipt);
    expect(policy.manifestId).toBe(receipt.manifestId);

    // Recovery
    const bundle = deriveRecoveryBundle(manifest, receipt, policy);
    const verification = verifyBundleConsistency(bundle, manifest, receipt, policy);
    expect(verification.valid).toBe(true);
    expect(bundle.title).toBe("My First Album");
    expect(bundle.artist).toBe("New Creator");
  });

  it("scenario 3.9: second release immediately after first has clean isolation", () => {
    // Release 1
    const m1 = makeManifest({ title: "First Release" });
    const r1 = makeReceipt(m1, "FR01");
    const p1 = makeAccessPolicy(m1, r1);
    const b1 = deriveRecoveryBundle(m1, r1, p1);
    const g1 = makeFullGovChain(computeManifestId(m1));

    // Release 2 — immediately after
    const m2 = makeManifest({ title: "Second Release" });
    const r2 = makeReceipt(m2, "SR02");
    const p2 = makeAccessPolicy(m2, r2);
    const b2 = deriveRecoveryBundle(m2, r2, p2);
    const g2 = makeFullGovChain(computeManifestId(m2));

    // Complete isolation
    expect(computeManifestId(m1)).not.toBe(computeManifestId(m2));
    expect(r1.manifestId).not.toBe(r2.manifestId);
    expect(p1.manifestId).not.toBe(p2.manifestId);
    expect(b1.manifestId).not.toBe(b2.manifestId);
    expect(g1.policy.manifestId).not.toBe(g2.policy.manifestId);

    // Both fully valid internally
    expect(verifyBundleConsistency(b1, m1, r1, p1).valid).toBe(true);
    expect(verifyBundleConsistency(b2, m2, r2, p2).valid).toBe(true);
    expect(checkExecutionAgainstDecision(g1.execution, g1.decision, g1.proposal, g1.policy).valid).toBe(true);
    expect(checkExecutionAgainstDecision(g2.execution, g2.decision, g2.proposal, g2.policy).valid).toBe(true);
  });

  it("scenario 3.10: holder from Release A cannot access Release B", () => {
    const mA = makeManifest({ title: "Holder Test A" });
    const mB = makeManifest({ title: "Holder Test B" });
    const receiptA = makeReceipt(mA, "HTA1");
    const receiptB = makeReceipt(mB, "HTB1");

    // Policy A only accepts tokens from Receipt A
    const policyA = makeAccessPolicy(mA, receiptA);

    // A holder of Release B's token
    const holderBToken = receiptB.xrpl.nftTokenIds[0];

    // That token is NOT in Policy A's qualifying list
    expect(policyA.rule.qualifyingTokenIds).not.toContain(holderBToken);

    // Policy B only accepts tokens from Receipt B
    const policyB = makeAccessPolicy(mB, receiptB);

    // A holder of Release A's token
    const holderAToken = receiptA.xrpl.nftTokenIds[0];

    // That token is NOT in Policy B's qualifying list
    expect(policyB.rule.qualifyingTokenIds).not.toContain(holderAToken);
  });
});
