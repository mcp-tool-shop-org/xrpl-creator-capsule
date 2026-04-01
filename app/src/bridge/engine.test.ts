import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  loadFile,
  saveFile,
  validateManifest,
  resolveManifest,
  stampManifest,
  mintRelease,
  verifyRelease,
  createAccessPolicy,
  checkHolderAccess,
  grantAccess,
  recoverRelease,
  verifyRecovery,
  createGovernancePolicy,
  proposePayout,
  decidePayout,
  executePayout,
  verifyPayout,
} from "./engine";

const mockInvoke = vi.mocked(invoke);

describe("engine bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── File operations ─────────────────────────────────────────────

  describe("loadFile", () => {
    it("invokes load_file with path", async () => {
      mockInvoke.mockResolvedValueOnce("file contents");
      const result = await loadFile("/some/path.json");
      expect(mockInvoke).toHaveBeenCalledWith("load_file", { path: "/some/path.json" });
      expect(result).toBe("file contents");
    });

    it("propagates invoke rejection", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("File not found"));
      await expect(loadFile("/bad/path")).rejects.toThrow("File not found");
    });
  });

  describe("saveFile", () => {
    it("invokes save_file with path and content", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await saveFile("/out/file.json", '{"key":"val"}');
      expect(mockInvoke).toHaveBeenCalledWith("save_file", {
        path: "/out/file.json",
        content: '{"key":"val"}',
      });
    });
  });

  // ── Manifest commands ───────────────────────────────────────────

  describe("validateManifest", () => {
    it("maps success to ValidationResult", async () => {
      const expected = { valid: true, errors: [] };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await validateManifest("/manifest.json");
      expect(mockInvoke).toHaveBeenCalledWith("engine_call", {
        command: "validate_manifest",
        params: { path: "/manifest.json" },
      });
      expect(result).toEqual(expected);
    });

    it("maps validation failure to ValidationResult with errors", async () => {
      const expected = { valid: false, errors: ["Missing title", "Bad CID"] };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await validateManifest("/bad.json");
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("propagates engine error as rejection", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Schema parse failed"));
      await expect(validateManifest("/corrupt.json")).rejects.toThrow("Schema parse failed");
    });
  });

  describe("resolveManifest", () => {
    it("maps success to ResolutionResult", async () => {
      const expected = {
        checks: [{ name: "cover-cid", passed: true, detail: "OK" }],
        passed: true,
      };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await resolveManifest("/manifest.json");
      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(1);
    });
  });

  describe("stampManifest", () => {
    it("maps success to StampResult", async () => {
      const expected = {
        manifest: { title: "Test" } as any,
        manifestId: "id-123",
        revisionHash: "hash-abc",
      };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await stampManifest("/manifest.json");
      expect(result.manifestId).toBe("id-123");
      expect(result.revisionHash).toBe("hash-abc");
    });
  });

  // ── Mint ────────────────────────────────────────────────────────

  describe("mintRelease", () => {
    it("passes all options through to engine_call", async () => {
      const receipt = { manifestId: "id-123", issuedAt: "2026-01-01" };
      mockInvoke.mockResolvedValueOnce(receipt);

      const opts = {
        manifestPath: "/m.json",
        walletsPath: "/w.json",
        network: "testnet",
        receiptPath: "/r.json",
      };
      const result = await mintRelease(opts);

      expect(mockInvoke).toHaveBeenCalledWith("engine_call", {
        command: "mint_release",
        params: opts,
      });
      expect(result).toEqual(receipt);
    });

    it("propagates mint failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Insufficient funds"));
      await expect(
        mintRelease({
          manifestPath: "/m.json",
          walletsPath: "/w.json",
          network: "testnet",
          receiptPath: "/r.json",
        }),
      ).rejects.toThrow("Insufficient funds");
    });
  });

  // ── Verify ──────────────────────────────────────────────────────

  describe("verifyRelease", () => {
    it("maps success to VerifyResult", async () => {
      const expected = {
        passed: true,
        checks: [{ name: "hash", passed: true, detail: "Match" }],
      };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await verifyRelease("/m.json", "/r.json");
      expect(mockInvoke).toHaveBeenCalledWith("engine_call", {
        command: "verify_release",
        params: { manifestPath: "/m.json", receiptPath: "/r.json" },
      });
      expect(result.passed).toBe(true);
    });
  });

  // ── Access ──────────────────────────────────────────────────────

  describe("createAccessPolicy", () => {
    it("passes options through correctly", async () => {
      const policy = { kind: "access-policy", manifestId: "id-123" };
      mockInvoke.mockResolvedValueOnce(policy);
      const opts = {
        manifestPath: "/m.json",
        receiptPath: "/r.json",
        label: "test-policy",
        ttlSeconds: 3600,
        outputPath: "/out.json",
      };
      const result = await createAccessPolicy(opts);
      expect(mockInvoke).toHaveBeenCalledWith("engine_call", {
        command: "create_access_policy",
        params: opts,
      });
      expect(result).toEqual(policy);
    });
  });

  describe("checkHolderAccess", () => {
    it("maps holder check result", async () => {
      const expected = { holds: true, matchedTokenIds: ["TOKEN1"], totalNftsChecked: 5, walletAddress: "rAddr" };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await checkHolderAccess({
        walletAddress: "rAddr",
        qualifyingTokenIds: ["TOKEN1"],
        network: "testnet",
      });
      expect(result.holds).toBe(true);
    });

    it("maps non-holder result", async () => {
      const expected = { holds: false, matchedTokenIds: [], totalNftsChecked: 5, walletAddress: "rBad" };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await checkHolderAccess({
        walletAddress: "rBad",
        qualifyingTokenIds: ["TOKEN1"],
        network: "testnet",
      });
      expect(result.holds).toBe(false);
      expect(result.matchedTokenIds).toHaveLength(0);
    });
  });

  describe("grantAccess", () => {
    it("maps allow grant receipt", async () => {
      const grant = { decision: "allow", reason: "Holds NFT" };
      mockInvoke.mockResolvedValueOnce(grant);
      const result = await grantAccess({
        manifestPath: "/m.json",
        receiptPath: "/r.json",
        policyPath: "/p.json",
        walletAddress: "rHolder",
      });
      expect(result.decision).toBe("allow");
    });

    it("maps deny grant receipt", async () => {
      const grant = { decision: "deny", reason: "No qualifying NFTs" };
      mockInvoke.mockResolvedValueOnce(grant);
      const result = await grantAccess({
        manifestPath: "/m.json",
        receiptPath: "/r.json",
        policyPath: "/p.json",
        walletAddress: "rNonHolder",
      });
      expect(result.decision).toBe("deny");
    });
  });

  // ── Recovery ────────────────────────────────────────────────────

  describe("recoverRelease", () => {
    it("maps success with bundle and verification", async () => {
      const expected = {
        bundle: { kind: "recovery-bundle" },
        verification: { valid: true, checks: [] },
        chainChecks: [],
        allPassed: true,
      };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await recoverRelease({
        manifestPath: "/m.json",
        receiptPath: "/r.json",
      });
      expect(result.allPassed).toBe(true);
    });
  });

  describe("verifyRecovery", () => {
    it("maps bundle verification result", async () => {
      const expected = { valid: true, checks: [{ name: "hash", passed: true, detail: "OK" }] };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await verifyRecovery({
        bundlePath: "/b.json",
        manifestPath: "/m.json",
        receiptPath: "/r.json",
      });
      expect(result.valid).toBe(true);
    });
  });

  // ── Governance ──────────────────────────────────────────────────

  describe("createGovernancePolicy", () => {
    it("passes all options through", async () => {
      const policy = { kind: "governance-policy", policyHash: "abc" };
      mockInvoke.mockResolvedValueOnce(policy);
      const result = await createGovernancePolicy({
        manifestPath: "/m.json",
        treasuryAddress: "rTreasury",
        network: "testnet",
        signers: [{ address: "rS1", role: "artist" }],
        threshold: 1,
        createdBy: "rS1",
      });
      expect(result).toEqual(policy);
    });
  });

  describe("proposePayout", () => {
    it("maps proposal result", async () => {
      const proposal = { proposalId: "p-1", proposalHash: "ph-1" };
      mockInvoke.mockResolvedValueOnce(proposal);
      const result = await proposePayout({
        policyPath: "/gov.json",
        proposalId: "p-1",
        outputs: [{ address: "rA", amount: "100", asset: "XRP", role: "artist", reason: "split" }],
        createdBy: "rS1",
      });
      expect(result).toEqual(proposal);
    });
  });

  describe("decidePayout", () => {
    it("maps decision result", async () => {
      const decision = { decision: { outcome: "approved", thresholdMet: true, approvedCount: 1, rejectedCount: 0 } };
      mockInvoke.mockResolvedValueOnce(decision);
      const result = await decidePayout({
        policyPath: "/gov.json",
        proposalPath: "/prop.json",
        approvals: [{ signerAddress: "rS1", approved: true, decidedAt: "2026-01-01" }],
        decidedBy: "rS1",
      });
      expect(result.decision.outcome).toBe("approved");
    });
  });

  describe("executePayout", () => {
    it("maps execution result", async () => {
      const execution = { executionHash: "exec-1" };
      mockInvoke.mockResolvedValueOnce(execution);
      const result = await executePayout({
        policyPath: "/gov.json",
        proposalPath: "/prop.json",
        decisionPath: "/dec.json",
        txHashes: ["TX1"],
        executedOutputs: [{ address: "rA", amount: "100", asset: "XRP", role: "artist", reason: "split" }],
        executedBy: "rS1",
      });
      expect(result).toEqual(execution);
    });
  });

  describe("verifyPayout", () => {
    it("maps full chain verification", async () => {
      const expected = { passed: true, checks: [{ name: "chain", passed: true, detail: "OK" }] };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await verifyPayout({
        policyPath: "/gov.json",
        proposalPath: "/prop.json",
        decisionPath: "/dec.json",
        executionPath: "/exec.json",
      });
      expect(result.passed).toBe(true);
    });

    it("maps failed chain verification", async () => {
      const expected = {
        passed: false,
        checks: [{ name: "chain", passed: false, detail: "Hash mismatch in decision" }],
      };
      mockInvoke.mockResolvedValueOnce(expected);
      const result = await verifyPayout({
        policyPath: "/gov.json",
        proposalPath: "/prop.json",
        decisionPath: "/dec.json",
        executionPath: "/exec.json",
      });
      expect(result.passed).toBe(false);
      expect(result.checks[0].detail).toContain("mismatch");
    });
  });
});
