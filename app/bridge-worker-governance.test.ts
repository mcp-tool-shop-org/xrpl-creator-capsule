// @vitest-environment node
/**
 * Wave 8 — F-d597d51f: coverage for the governance/payout handler group —
 * create_governance_policy, propose_payout, decide_payout, execute_payout,
 * verify_payout. This is the other "hash-chain validation" surface the
 * finding calls out: a four-stage chain (policy -> proposal -> decision ->
 * execution) gating real treasury payouts, each stage carrying forward a
 * hash of the one before it.
 *
 * Entirely local/offline — none of these handlers touch @capsule/xrpl, so
 * no network mocking is needed (unlike the verify_release/recover_release/
 * grant_access groups).
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManifestId,
  type ReleaseManifest,
  type GovernancePolicy,
  type PayoutProposal,
  type PayoutDecisionReceipt,
  type PayoutExecutionReceipt,
} from "@capsule/core";
import { dispatch } from "./bridge-worker-commands";

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const TREASURY = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const ARTIST = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const PRODUCER = "rBHMbioz9znTCqgjZ6Nx43uWY43kToEPa9";

function makeManifest(): ReleaseManifest {
  return {
    schemaVersion: "1.0.0",
    title: "Midnight Frequency",
    artist: "Vex Morrow",
    editionSize: 50,
    coverCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    mediaCid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    metadataEndpoint: "https://example.com/.well-known/xrpl-nft/midnight-frequency",
    license: {
      type: "custom",
      summary: "Personal, non-transferable license.",
      uri: "https://example.com/releases/midnight-frequency/license",
    },
    benefit: {
      kind: "stems",
      description: "Full stem pack for personal remixing.",
      contentPointer: "QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB",
    },
    priceDrops: "50000000",
    transferFeePercent: 5,
    payoutPolicy: { treasuryAddress: TREASURY, multiSig: true, terms: "Standard" },
    issuerAddress: ISSUER,
    operatorAddress: ARTIST,
    createdAt: "2026-04-01T00:00:00Z",
  };
}

describe("bridge-worker dispatch: governance/payout handlers", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function tmpDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "capsule-governance-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  async function writeJson(dir: string, name: string, data: unknown): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, JSON.stringify(data), "utf-8");
    return path;
  }

  /** Builds policy -> proposal -> decision(approved) -> execution, all via
   *  dispatch(), writing each artifact to its own file so the next stage
   *  reads it the way the real app does. Returns every path + parsed
   *  object for reuse across tests. */
  async function buildApprovedChain(dir: string) {
    const manifest = makeManifest();
    const manifestPath = await writeJson(dir, "manifest.json", manifest);

    const policy = (await dispatch({
      command: "create_governance_policy",
      params: {
        manifestPath,
        treasuryAddress: TREASURY,
        signers: [
          { address: ARTIST, role: "artist", label: "Lead Artist" },
          { address: PRODUCER, role: "producer", label: "Producer" },
        ],
        threshold: 2,
        createdBy: "tester",
      },
    })) as GovernancePolicy;
    const policyPath = await writeJson(dir, "policy.json", policy);

    const proposal = (await dispatch({
      command: "propose_payout",
      params: {
        policyPath,
        proposalId: "payout_001",
        outputs: [
          { address: ARTIST, amount: "75000000", asset: "XRP", role: "artist", reason: "Artist share" },
          { address: PRODUCER, amount: "25000000", asset: "XRP", role: "producer", reason: "Producer share" },
        ],
        createdBy: "tester",
      },
    })) as PayoutProposal;
    const proposalPath = await writeJson(dir, "proposal.json", proposal);

    const decision = (await dispatch({
      command: "decide_payout",
      params: {
        policyPath,
        proposalPath,
        approvals: [
          { signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" },
          { signerAddress: PRODUCER, approved: true, decidedAt: "2026-04-01T18:11:00Z" },
        ],
        decidedBy: "tester",
      },
    })) as PayoutDecisionReceipt;
    const decisionPath = await writeJson(dir, "decision.json", decision);

    const execution = (await dispatch({
      command: "execute_payout",
      params: {
        policyPath,
        proposalPath,
        decisionPath,
        txHashes: ["ABCDEF1234567890"],
        executedOutputs: proposal.outputs,
        executedBy: "tester",
      },
    })) as PayoutExecutionReceipt;
    const executionPath = await writeJson(dir, "execution.json", execution);

    return {
      manifest, manifestPath,
      policy, policyPath,
      proposal, proposalPath,
      decision, decisionPath,
      execution, executionPath,
    };
  }

  // ── create_governance_policy ────────────────────────────────────

  describe("create_governance_policy", () => {
    it("stamps a policy with manifestId derived from the manifest and a valid policyHash", async () => {
      const dir = await tmpDir();
      const manifest = makeManifest();
      const manifestPath = await writeJson(dir, "manifest.json", manifest);

      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [{ address: ARTIST, role: "artist" }],
          threshold: 1,
          createdBy: "tester",
        },
      })) as GovernancePolicy;

      expect(policy.manifestId).toBe(computeManifestId(manifest));
      expect(policy.policyHash).toBeTruthy();
      expect(policy.payoutPolicy.allowedAssets).toEqual(["XRP"]);
      expect(policy.network).toBe("testnet");
    });

    it("rejects a threshold that exceeds the signer count", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());

      await expect(
        dispatch({
          command: "create_governance_policy",
          params: {
            manifestPath,
            treasuryAddress: TREASURY,
            signers: [{ address: ARTIST, role: "artist" }],
            threshold: 5,
            createdBy: "tester",
          },
        })
      ).rejects.toThrow(/exceeds signer count/);
    });
  });

  // ── propose_payout ───────────────────────────────────────────────

  describe("propose_payout", () => {
    it("stamps a proposal carrying the policy's own policyHash forward", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());
      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [{ address: ARTIST, role: "artist" }],
          threshold: 1,
          createdBy: "tester",
        },
      })) as GovernancePolicy;
      const policyPath = await writeJson(dir, "policy.json", policy);

      const proposal = (await dispatch({
        command: "propose_payout",
        params: {
          policyPath,
          proposalId: "payout_solo",
          outputs: [{ address: ARTIST, amount: "50000000", asset: "XRP", role: "artist", reason: "Full share" }],
          createdBy: "tester",
        },
      })) as PayoutProposal;

      expect(proposal.policyHash).toBe(policy.policyHash);
      expect(proposal.proposalHash).toBeTruthy();
      expect(proposal.outputs).toHaveLength(1);
    });

    it("rejects an output whose asset is not in the policy's allowedAssets — never stamps a policy-violating proposal", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());
      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [{ address: ARTIST, role: "artist" }],
          threshold: 1,
          createdBy: "tester",
          allowedAssets: ["XRP"],
        },
      })) as GovernancePolicy;
      const policyPath = await writeJson(dir, "policy.json", policy);

      await expect(
        dispatch({
          command: "propose_payout",
          params: {
            policyPath,
            proposalId: "payout_bad_asset",
            outputs: [{ address: ARTIST, amount: "1000", asset: "USD", role: "artist", reason: "Wrong asset" }],
            createdBy: "tester",
          },
        })
      ).rejects.toThrow(/Proposal violates policy.*USD.*not in policy allowedAssets/s);
    });
  });

  // ── decide_payout ────────────────────────────────────────────────

  describe("decide_payout", () => {
    it("produces outcome:'rejected' (not a throw) when approvals fall short of threshold", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());
      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [
            { address: ARTIST, role: "artist" },
            { address: PRODUCER, role: "producer" },
          ],
          threshold: 2,
          createdBy: "tester",
        },
      })) as GovernancePolicy;
      const policyPath = await writeJson(dir, "policy.json", policy);
      const proposal = (await dispatch({
        command: "propose_payout",
        params: {
          policyPath,
          proposalId: "payout_under_threshold",
          outputs: [{ address: ARTIST, amount: "50000000", asset: "XRP", role: "artist", reason: "Full share" }],
          createdBy: "tester",
        },
      })) as PayoutProposal;
      const proposalPath = await writeJson(dir, "proposal.json", proposal);

      const decision = (await dispatch({
        command: "decide_payout",
        params: {
          policyPath,
          proposalPath,
          approvals: [{ signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" }],
          decidedBy: "tester",
        },
      })) as PayoutDecisionReceipt;

      expect(decision.decision.outcome).toBe("rejected");
      expect(decision.decision.thresholdMet).toBe(false);
      expect(decision.decision.approvedCount).toBe(1);
    });

    /**
     * Realistic tamper scenario, same family as the receipt/bundle
     * "hand-edited without re-stamping" tests elsewhere in this wave: a
     * proposal.json edited on disk (memo changed) without recomputing
     * proposalHash. decidePayoutCmd carries proposal.proposalHash forward
     * verbatim into the decision, then immediately self-checks via
     * checkDecisionAgainstProposal, which recomputes the hash from the
     * proposal's LIVE content — catching the mismatch before a decision
     * receipt is ever returned.
     */
    it("throws 'Decision inconsistency' when the proposal file was edited without re-stamping its hash", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());
      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [{ address: ARTIST, role: "artist" }],
          threshold: 1,
          createdBy: "tester",
        },
      })) as GovernancePolicy;
      const policyPath = await writeJson(dir, "policy.json", policy);
      const proposal = (await dispatch({
        command: "propose_payout",
        params: {
          policyPath,
          proposalId: "payout_tampered",
          outputs: [{ address: ARTIST, amount: "50000000", asset: "XRP", role: "artist", reason: "Full share" }],
          createdBy: "tester",
        },
      })) as PayoutProposal;
      // Edit memo post-stamp; proposalHash field is left stale on purpose.
      const tamperedProposal = { ...proposal, memo: "not what was actually approved" };
      const proposalPath = await writeJson(dir, "proposal.json", tamperedProposal);

      await expect(
        dispatch({
          command: "decide_payout",
          params: {
            policyPath,
            proposalPath,
            approvals: [{ signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" }],
            decidedBy: "tester",
          },
        })
      ).rejects.toThrow(/Decision inconsistency.*proposalHash/s);
    });
  });

  // ── execute_payout ───────────────────────────────────────────────

  describe("execute_payout", () => {
    it("stamps an execution receipt whose verification reflects a valid full hash chain", async () => {
      const dir = await tmpDir();
      const { execution } = await buildApprovedChain(dir);

      expect(execution.verification.matchesApprovedProposal).toBe(true);
      expect(execution.verification.errors).toEqual([]);
      expect(execution.executionHash).toBeTruthy();
      expect(execution.xrpl.txHashes).toEqual(["ABCDEF1234567890"]);
    });

    /**
     * bridge-worker-commands.ts's OWN guard (not delegated to
     * @capsule/core) — the one piece of this handler's logic that lives
     * entirely in this file. Prime mutation target: deleting this check
     * would let a rejected treasury payout be executed.
     */
    it("throws 'Cannot execute a rejected proposal' when the decision was not approved", async () => {
      const dir = await tmpDir();
      const manifestPath = await writeJson(dir, "manifest.json", makeManifest());
      const policy = (await dispatch({
        command: "create_governance_policy",
        params: {
          manifestPath,
          treasuryAddress: TREASURY,
          signers: [
            { address: ARTIST, role: "artist" },
            { address: PRODUCER, role: "producer" },
          ],
          threshold: 2,
          createdBy: "tester",
        },
      })) as GovernancePolicy;
      const policyPath = await writeJson(dir, "policy.json", policy);
      const proposal = (await dispatch({
        command: "propose_payout",
        params: {
          policyPath,
          proposalId: "payout_rejected",
          outputs: [{ address: ARTIST, amount: "50000000", asset: "XRP", role: "artist", reason: "Full share" }],
          createdBy: "tester",
        },
      })) as PayoutProposal;
      const proposalPath = await writeJson(dir, "proposal.json", proposal);
      // Only 1 of 2 required signers approves -> outcome "rejected".
      const decision = (await dispatch({
        command: "decide_payout",
        params: {
          policyPath,
          proposalPath,
          approvals: [{ signerAddress: ARTIST, approved: true, decidedAt: "2026-04-01T18:10:00Z" }],
          decidedBy: "tester",
        },
      })) as PayoutDecisionReceipt;
      expect(decision.decision.outcome).toBe("rejected");
      const decisionPath = await writeJson(dir, "decision.json", decision);

      await expect(
        dispatch({
          command: "execute_payout",
          params: {
            policyPath,
            proposalPath,
            decisionPath,
            txHashes: ["SHOULD_NOT_HAPPEN"],
            executedOutputs: proposal.outputs,
            executedBy: "tester",
          },
        })
      ).rejects.toThrow("Cannot execute a rejected proposal");
    });
  });

  // ── verify_payout ────────────────────────────────────────────────

  describe("verify_payout", () => {
    it("reports passed:true with every hash-integrity and cross-contract check green for an untampered chain", async () => {
      const dir = await tmpDir();
      const { policyPath, proposalPath, decisionPath, executionPath } = await buildApprovedChain(dir);

      const result = (await dispatch({
        command: "verify_payout",
        params: { policyPath, proposalPath, decisionPath, executionPath },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.passed).toBe(true);
      for (const check of result.checks) {
        expect(check.passed).toBe(true);
      }
      const names = result.checks.map((c) => c.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "policy-hash-integrity",
          "proposal-hash-integrity",
          "decision-hash-integrity",
          "execution-hash-integrity",
          "proposal-vs-policy",
          "decision-vs-proposal",
          "execution-vs-decision",
          "decision-outcome",
        ])
      );
    });

    it("detects an execution record edited after stamping (executionHash left stale)", async () => {
      const dir = await tmpDir();
      const { policyPath, proposalPath, decisionPath, execution, executionPath } =
        await buildApprovedChain(dir);

      // Simulate a hand-edited executed-outputs amount, executionHash not
      // recomputed.
      const tampered = {
        ...execution,
        executedOutputs: execution.executedOutputs.map((o, i) =>
          i === 0 ? { ...o, amount: "999999999" } : o
        ),
      };
      await writeFile(executionPath, JSON.stringify(tampered), "utf-8");

      const result = (await dispatch({
        command: "verify_payout",
        params: { policyPath, proposalPath, decisionPath, executionPath },
      })) as { passed: boolean; checks: Array<{ name: string; passed: boolean }> };

      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "execution-hash-integrity")?.passed).toBe(false);
    });

    it("rejects when any of the four artifact files is missing", async () => {
      const dir = await tmpDir();
      const { policyPath, proposalPath, decisionPath } = await buildApprovedChain(dir);

      await expect(
        dispatch({
          command: "verify_payout",
          params: {
            policyPath,
            proposalPath,
            decisionPath,
            executionPath: join(dir, "missing-execution.json"),
          },
        })
      ).rejects.toThrow();
    });
  });
});
