import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  loadFile,
  saveFile,
  validateManifest as engineValidate,
  resolveManifest as engineResolve,
  stampManifest as engineStamp,
  mintRelease as engineMint,
  verifyRelease as engineVerify,
  createAccessPolicy as engineCreatePolicy,
  grantAccess as engineGrant,
  recoverRelease as engineRecover,
  createGovernancePolicy as engineCreateGovPolicy,
  proposePayout as engineProposePayout,
  decidePayout as engineDecidePayout,
  executePayout as engineExecutePayout,
  verifyPayout as engineVerifyPayout,
  type ReleaseManifest,
  type IssuanceReceipt,
  type ValidationResult,
  type ResolutionResult,
  type StampResult,
  type VerifyResult,
  type AccessPolicy,
  type AccessGrantReceipt,
  type RecoverResult,
  type GovernancePolicy,
  type PayoutProposal,
  type PayoutDecisionReceipt,
  type PayoutExecutionReceipt,
  type GovernanceSigner,
  type GovernanceApproval,
  type PayoutOutput,
  type ExecutedPayoutOutput,
  type VerifyPayoutResult,
} from "../bridge/engine";

// ── Status types ────────────────────────────────────────────────────

export type ArtifactStatus = "empty" | "loading" | "loaded" | "error";
export type ActionStatus = "idle" | "running" | "done" | "error";

// ── State shapes ────────────────────────────────────────────────────

export interface ManifestState {
  status: ArtifactStatus;
  path: string | null;
  data: ReleaseManifest | null;
  validation: ValidationResult | null;
  resolution: ResolutionResult | null;
  stamp: StampResult | null;
  error: string | null;
}

export interface MintState {
  status: ArtifactStatus;
  actionStatus: ActionStatus;
  walletsPath: string | null;
  receiptPath: string | null;
  receipt: IssuanceReceipt | null;
  error: string | null;
}

export interface VerifyState {
  status: ActionStatus;
  result: VerifyResult | null;
  error: string | null;
}

export interface AccessState {
  policyStatus: ArtifactStatus;
  policyPath: string | null;
  policy: AccessPolicy | null;
  grantStatus: ActionStatus;
  grant: AccessGrantReceipt | null;
  walletAddress: string;
  error: string | null;
}

export interface RecoveryState {
  status: ActionStatus;
  result: RecoverResult | null;
  bundlePath: string | null;
  // Replay results
  replayHolder: AccessGrantReceipt | null;
  replayNonHolder: AccessGrantReceipt | null;
  replayStatus: ActionStatus;
  error: string | null;
}

export interface GovernanceState {
  policyStatus: ArtifactStatus;
  policyPath: string | null;
  policy: GovernancePolicy | null;
  proposalStatus: ArtifactStatus;
  proposalPath: string | null;
  proposal: PayoutProposal | null;
  decisionStatus: ArtifactStatus;
  decisionPath: string | null;
  decision: PayoutDecisionReceipt | null;
  executionStatus: ArtifactStatus;
  executionPath: string | null;
  execution: PayoutExecutionReceipt | null;
  verifyStatus: ActionStatus;
  verifyResult: VerifyPayoutResult | null;
  error: string | null;
}

// ── Context shape ───────────────────────────────────────────────────

interface ReleaseContextValue {
  manifest: ManifestState;
  mint: MintState;
  verify: VerifyState;
  access: AccessState;
  recovery: RecoveryState;
  governance: GovernanceState;

  // Manifest actions
  loadManifest: () => Promise<void>;
  validateManifest: () => Promise<void>;
  resolveManifest: () => Promise<void>;

  // Mint actions
  loadWallets: () => Promise<void>;
  loadReceipt: () => Promise<void>;
  runMint: () => Promise<void>;

  // Verify actions
  runVerify: () => Promise<void>;

  // Access actions
  loadPolicy: () => Promise<void>;
  createPolicy: () => Promise<void>;
  setWalletAddress: (address: string) => void;
  runGrantAccess: () => Promise<void>;

  // Recovery actions
  runRecover: () => Promise<void>;
  runReplay: (holderAddress: string, nonHolderAddress: string) => Promise<void>;

  // Governance actions
  loadGovPolicy: () => Promise<void>;
  createGovPolicy: (opts: {
    treasuryAddress: string;
    signers: GovernanceSigner[];
    threshold: number;
    allowedAssets?: string[];
    createdBy: string;
  }) => Promise<void>;
  loadProposal: () => Promise<void>;
  createProposal: (opts: {
    proposalId: string;
    outputs: PayoutOutput[];
    createdBy: string;
    memo?: string;
  }) => Promise<void>;
  loadDecision: () => Promise<void>;
  createDecision: (opts: {
    approvals: GovernanceApproval[];
    decidedBy: string;
  }) => Promise<void>;
  loadExecution: () => Promise<void>;
  createExecution: (opts: {
    txHashes: string[];
    executedOutputs: ExecutedPayoutOutput[];
    executedBy: string;
  }) => Promise<void>;
  runVerifyPayout: () => Promise<void>;

  // Network
  network: string;
}

const ReleaseContext = createContext<ReleaseContextValue | null>(null);

// ── Initial states ──────────────────────────────────────────────────

const INIT_MANIFEST: ManifestState = {
  status: "empty",
  path: null,
  data: null,
  validation: null,
  resolution: null,
  stamp: null,
  error: null,
};

const INIT_MINT: MintState = {
  status: "empty",
  actionStatus: "idle",
  walletsPath: null,
  receiptPath: null,
  receipt: null,
  error: null,
};

const INIT_VERIFY: VerifyState = {
  status: "idle",
  result: null,
  error: null,
};

const INIT_ACCESS: AccessState = {
  policyStatus: "empty",
  policyPath: null,
  policy: null,
  grantStatus: "idle",
  grant: null,
  walletAddress: "",
  error: null,
};

const INIT_RECOVERY: RecoveryState = {
  status: "idle",
  result: null,
  bundlePath: null,
  replayHolder: null,
  replayNonHolder: null,
  replayStatus: "idle",
  error: null,
};

const INIT_GOVERNANCE: GovernanceState = {
  policyStatus: "empty",
  policyPath: null,
  policy: null,
  proposalStatus: "empty",
  proposalPath: null,
  proposal: null,
  decisionStatus: "empty",
  decisionPath: null,
  decision: null,
  executionStatus: "empty",
  executionPath: null,
  execution: null,
  verifyStatus: "idle",
  verifyResult: null,
  error: null,
};

// ── Provider ────────────────────────────────────────────────────────

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [manifestState, setManifest] = useState<ManifestState>(INIT_MANIFEST);
  const [mintState, setMint] = useState<MintState>(INIT_MINT);
  const [verifyState, setVerify] = useState<VerifyState>(INIT_VERIFY);
  const [accessState, setAccess] = useState<AccessState>(INIT_ACCESS);
  const [recoveryState, setRecovery] = useState<RecoveryState>(INIT_RECOVERY);
  const [governanceState, setGovernance] = useState<GovernanceState>(INIT_GOVERNANCE);
  const network = "testnet";

  // ── Manifest actions ────────────────────────────────────────────

  const loadManifest = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Release Manifest",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setManifest((s) => ({ ...s, status: "loading", error: null }));

      const content = await loadFile(filePath);
      const data = JSON.parse(content) as ReleaseManifest;

      setManifest({
        status: "loaded",
        path: filePath,
        data,
        validation: null,
        resolution: null,
        stamp: null,
        error: null,
      });

      // Reset downstream state when manifest changes
      setMint(INIT_MINT);
      setVerify(INIT_VERIFY);
      setAccess(INIT_ACCESS);
      setRecovery(INIT_RECOVERY);
      setGovernance(INIT_GOVERNANCE);
    } catch (err) {
      setManifest((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const validateManifestAction = useCallback(async () => {
    if (!manifestState.path) return;
    try {
      setManifest((s) => ({ ...s, error: null }));
      const validation = await engineValidate(manifestState.path);
      setManifest((s) => ({ ...s, validation }));
    } catch (err) {
      setManifest((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path]);

  const resolveManifestAction = useCallback(async () => {
    if (!manifestState.path) return;
    try {
      setManifest((s) => ({ ...s, error: null }));
      const resolution = await engineResolve(manifestState.path);
      const stamp = await engineStamp(manifestState.path);
      setManifest((s) => ({ ...s, resolution, stamp }));
    } catch (err) {
      setManifest((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path]);

  // ── Mint actions ────────────────────────────────────────────────

  const loadWallets = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Wallet Credentials",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setMint((s) => ({ ...s, walletsPath: filePath, error: null }));
    } catch (err) {
      setMint((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const loadReceipt = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Issuance Receipt",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      const content = await loadFile(filePath);
      const receipt = JSON.parse(content) as IssuanceReceipt;

      setMint((s) => ({
        ...s,
        status: "loaded",
        receiptPath: filePath,
        receipt,
        error: null,
      }));
    } catch (err) {
      setMint((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const runMint = useCallback(async () => {
    if (!manifestState.path || !mintState.walletsPath) return;

    try {
      const receiptPath = await save({
        title: "Save Issuance Receipt",
        defaultPath: "receipt.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!receiptPath) return;

      setMint((s) => ({ ...s, actionStatus: "running", error: null }));

      const receipt = await engineMint({
        manifestPath: manifestState.path,
        walletsPath: mintState.walletsPath,
        network,
        receiptPath,
      });

      setMint({
        status: "loaded",
        actionStatus: "done",
        walletsPath: mintState.walletsPath,
        receiptPath,
        receipt,
        error: null,
      });
    } catch (err) {
      setMint((s) => ({
        ...s,
        actionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.walletsPath, network]);

  // ── Verify actions ──────────────────────────────────────────────

  const runVerify = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath) return;

    try {
      setVerify({ status: "running", result: null, error: null });
      const result = await engineVerify(manifestState.path, mintState.receiptPath);
      setVerify({ status: "done", result, error: null });
    } catch (err) {
      setVerify({
        status: "error",
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [manifestState.path, mintState.receiptPath]);

  // ── Access actions ──────────────────────────────────────────────

  const loadPolicy = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Access Policy",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setAccess((s) => ({ ...s, policyStatus: "loading", error: null }));

      const content = await loadFile(filePath);
      const policy = JSON.parse(content) as AccessPolicy;

      setAccess((s) => ({
        ...s,
        policyStatus: "loaded",
        policyPath: filePath,
        policy,
        error: null,
      }));
    } catch (err) {
      setAccess((s) => ({
        ...s,
        policyStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const createPolicy = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath) return;

    try {
      const outputPath = await save({
        title: "Save Access Policy",
        defaultPath: "access-policy.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!outputPath) return;

      setAccess((s) => ({ ...s, policyStatus: "loading", error: null }));

      const label = `${manifestState.data?.benefit?.kind ?? "benefit"} for ${manifestState.data?.title ?? "release"} holders`;

      const policy = await engineCreatePolicy({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        label,
        ttlSeconds: 3600,
        outputPath,
      });

      setAccess((s) => ({
        ...s,
        policyStatus: "loaded",
        policyPath: outputPath,
        policy,
        error: null,
      }));
    } catch (err) {
      setAccess((s) => ({
        ...s,
        policyStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, manifestState.data, mintState.receiptPath]);

  const setWalletAddress = useCallback((address: string) => {
    setAccess((s) => ({ ...s, walletAddress: address, grant: null, grantStatus: "idle" }));
  }, []);

  const runGrantAccess = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath || !accessState.policyPath || !accessState.walletAddress) return;

    try {
      setAccess((s) => ({ ...s, grantStatus: "running", grant: null, error: null }));

      const grant = await engineGrant({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        policyPath: accessState.policyPath,
        walletAddress: accessState.walletAddress,
      });

      setAccess((s) => ({ ...s, grantStatus: "done", grant, error: null }));
    } catch (err) {
      setAccess((s) => ({
        ...s,
        grantStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.receiptPath, accessState.policyPath, accessState.walletAddress]);

  // ── Recovery actions ────────────────────────────────────────────

  const runRecover = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath) return;

    try {
      const outputPath = await save({
        title: "Save Recovery Bundle",
        defaultPath: "recovery-bundle.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      setRecovery((s) => ({ ...s, status: "running", error: null }));

      const result = await engineRecover({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        policyPath: accessState.policyPath ?? undefined,
        outputPath: outputPath ?? undefined,
      });

      setRecovery((s) => ({
        ...s,
        status: "done",
        result,
        bundlePath: outputPath,
        error: null,
      }));
    } catch (err) {
      setRecovery((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.receiptPath, accessState.policyPath]);

  const runReplay = useCallback(async (holderAddress: string, nonHolderAddress: string) => {
    if (!manifestState.path || !mintState.receiptPath || !accessState.policyPath) return;

    try {
      setRecovery((s) => ({ ...s, replayStatus: "running", replayHolder: null, replayNonHolder: null, error: null }));

      // Run holder test
      const holderGrant = await engineGrant({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        policyPath: accessState.policyPath,
        walletAddress: holderAddress,
      });

      // Run non-holder test
      const nonHolderGrant = await engineGrant({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        policyPath: accessState.policyPath,
        walletAddress: nonHolderAddress,
      });

      setRecovery((s) => ({
        ...s,
        replayStatus: "done",
        replayHolder: holderGrant,
        replayNonHolder: nonHolderGrant,
        error: null,
      }));
    } catch (err) {
      setRecovery((s) => ({
        ...s,
        replayStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.receiptPath, accessState.policyPath]);

  // ── Governance actions ──────────────────────────────────────────

  const loadGovPolicy = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Governance Policy",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setGovernance((s) => ({ ...s, policyStatus: "loading", error: null }));

      const content = await loadFile(filePath);
      const policy = JSON.parse(content) as GovernancePolicy;

      setGovernance((s) => ({
        ...s,
        policyStatus: "loaded",
        policyPath: filePath,
        policy,
        // Reset downstream
        proposalStatus: "empty", proposalPath: null, proposal: null,
        decisionStatus: "empty", decisionPath: null, decision: null,
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        policyStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const createGovPolicy = useCallback(async (opts: {
    treasuryAddress: string;
    signers: GovernanceSigner[];
    threshold: number;
    allowedAssets?: string[];
    createdBy: string;
  }) => {
    if (!manifestState.path) return;

    try {
      const outputPath = await save({
        title: "Save Governance Policy",
        defaultPath: "governance-policy.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!outputPath) return;

      setGovernance((s) => ({ ...s, policyStatus: "loading", error: null }));

      const policy = await engineCreateGovPolicy({
        manifestPath: manifestState.path,
        treasuryAddress: opts.treasuryAddress,
        network,
        signers: opts.signers,
        threshold: opts.threshold,
        allowedAssets: opts.allowedAssets,
        createdBy: opts.createdBy,
        outputPath,
      });

      setGovernance((s) => ({
        ...s,
        policyStatus: "loaded",
        policyPath: outputPath,
        policy,
        // Reset downstream
        proposalStatus: "empty", proposalPath: null, proposal: null,
        decisionStatus: "empty", decisionPath: null, decision: null,
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        policyStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, network]);

  const loadProposal = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Payout Proposal",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setGovernance((s) => ({ ...s, proposalStatus: "loading", error: null }));

      const content = await loadFile(filePath);
      const proposal = JSON.parse(content) as PayoutProposal;

      setGovernance((s) => ({
        ...s,
        proposalStatus: "loaded",
        proposalPath: filePath,
        proposal,
        // Reset downstream
        decisionStatus: "empty", decisionPath: null, decision: null,
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        proposalStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const createProposal = useCallback(async (opts: {
    proposalId: string;
    outputs: PayoutOutput[];
    createdBy: string;
    memo?: string;
  }) => {
    if (!governanceState.policyPath) return;

    try {
      const outputPath = await save({
        title: "Save Payout Proposal",
        defaultPath: "payout-proposal.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!outputPath) return;

      setGovernance((s) => ({ ...s, proposalStatus: "loading", error: null }));

      const proposal = await engineProposePayout({
        policyPath: governanceState.policyPath,
        proposalId: opts.proposalId,
        outputs: opts.outputs,
        createdBy: opts.createdBy,
        memo: opts.memo,
        outputPath,
      });

      setGovernance((s) => ({
        ...s,
        proposalStatus: "loaded",
        proposalPath: outputPath,
        proposal,
        // Reset downstream
        decisionStatus: "empty", decisionPath: null, decision: null,
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        proposalStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [governanceState.policyPath]);

  const loadDecision = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Payout Decision",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setGovernance((s) => ({ ...s, decisionStatus: "loading", error: null }));

      const content = await loadFile(filePath);
      const decision = JSON.parse(content) as PayoutDecisionReceipt;

      setGovernance((s) => ({
        ...s,
        decisionStatus: "loaded",
        decisionPath: filePath,
        decision,
        // Reset downstream
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        decisionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const createDecision = useCallback(async (opts: {
    approvals: GovernanceApproval[];
    decidedBy: string;
  }) => {
    if (!governanceState.policyPath || !governanceState.proposalPath) return;

    try {
      const outputPath = await save({
        title: "Save Payout Decision",
        defaultPath: "payout-decision.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!outputPath) return;

      setGovernance((s) => ({ ...s, decisionStatus: "loading", error: null }));

      const decision = await engineDecidePayout({
        policyPath: governanceState.policyPath,
        proposalPath: governanceState.proposalPath,
        approvals: opts.approvals,
        decidedBy: opts.decidedBy,
        outputPath,
      });

      setGovernance((s) => ({
        ...s,
        decisionStatus: "loaded",
        decisionPath: outputPath,
        decision,
        // Reset downstream
        executionStatus: "empty", executionPath: null, execution: null,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        decisionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [governanceState.policyPath, governanceState.proposalPath]);

  const loadExecution = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Payout Execution",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) return;

      const filePath = typeof result === "string"
        ? result
        : (result as { path: string }).path;

      setGovernance((s) => ({ ...s, executionStatus: "loading", error: null }));

      const content = await loadFile(filePath);
      const execution = JSON.parse(content) as PayoutExecutionReceipt;

      setGovernance((s) => ({
        ...s,
        executionStatus: "loaded",
        executionPath: filePath,
        execution,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        executionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const createExecution = useCallback(async (opts: {
    txHashes: string[];
    executedOutputs: ExecutedPayoutOutput[];
    executedBy: string;
  }) => {
    if (!governanceState.policyPath || !governanceState.proposalPath || !governanceState.decisionPath) return;

    try {
      const outputPath = await save({
        title: "Save Payout Execution",
        defaultPath: "payout-execution.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!outputPath) return;

      setGovernance((s) => ({ ...s, executionStatus: "loading", error: null }));

      const execution = await engineExecutePayout({
        policyPath: governanceState.policyPath,
        proposalPath: governanceState.proposalPath,
        decisionPath: governanceState.decisionPath,
        txHashes: opts.txHashes,
        executedOutputs: opts.executedOutputs,
        executedBy: opts.executedBy,
        outputPath,
      });

      setGovernance((s) => ({
        ...s,
        executionStatus: "loaded",
        executionPath: outputPath,
        execution,
        verifyStatus: "idle", verifyResult: null,
        error: null,
      }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        executionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [governanceState.policyPath, governanceState.proposalPath, governanceState.decisionPath]);

  const runVerifyPayout = useCallback(async () => {
    if (!governanceState.policyPath || !governanceState.proposalPath ||
        !governanceState.decisionPath || !governanceState.executionPath) return;

    try {
      setGovernance((s) => ({ ...s, verifyStatus: "running", verifyResult: null, error: null }));

      const result = await engineVerifyPayout({
        policyPath: governanceState.policyPath,
        proposalPath: governanceState.proposalPath,
        decisionPath: governanceState.decisionPath,
        executionPath: governanceState.executionPath,
      });

      setGovernance((s) => ({ ...s, verifyStatus: "done", verifyResult: result, error: null }));
    } catch (err) {
      setGovernance((s) => ({
        ...s,
        verifyStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [governanceState.policyPath, governanceState.proposalPath,
      governanceState.decisionPath, governanceState.executionPath]);

  // ── Context value ───────────────────────────────────────────────

  return (
    <ReleaseContext.Provider
      value={{
        manifest: manifestState,
        mint: mintState,
        verify: verifyState,
        access: accessState,
        recovery: recoveryState,
        governance: governanceState,
        loadManifest,
        validateManifest: validateManifestAction,
        resolveManifest: resolveManifestAction,
        loadWallets,
        loadReceipt,
        runMint,
        runVerify,
        loadPolicy,
        createPolicy,
        setWalletAddress,
        runGrantAccess,
        runRecover,
        runReplay,
        loadGovPolicy,
        createGovPolicy,
        loadProposal,
        createProposal,
        loadDecision,
        createDecision,
        loadExecution,
        createExecution,
        runVerifyPayout,
        network,
      }}
    >
      {children}
    </ReleaseContext.Provider>
  );
}

export function useRelease(): ReleaseContextValue {
  const ctx = useContext(ReleaseContext);
  if (!ctx) throw new Error("useRelease must be inside ReleaseProvider");
  return ctx;
}
