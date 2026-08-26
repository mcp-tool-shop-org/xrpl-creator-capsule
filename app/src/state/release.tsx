import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  loadFile,
  saveFile,
  validateManifest as engineValidate,
  resolveManifest as engineResolve,
  stampManifest as engineStamp,
  mintRelease as engineMint,
  isMintReceiptUnsaved,
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

// "timed_out" added for F-dba2ccb6: createPolicy and the four
// governance create actions (createGovPolicy/createProposal/
// createDecision/createExecution) use their ArtifactStatus field to
// report timeout the same way mint's ActionStatus already could — see
// engineCallTimedOut() below. Existing `status === "loading"` checks in
// the panels are unaffected (a timed-out action is simply no longer
// "loading", which is correct: it re-enables the button).
export type ArtifactStatus = "empty" | "loading" | "loaded" | "error" | "timed_out";
export type ActionStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "canceled"
  | "timed_out"
  // The mint itself succeeded (a real, irreversible on-chain mint
  // happened) but the receipt could not be persisted to disk. This is
  // deliberately distinct from "error" — see F-cf8b67bb: reporting this
  // the same way a real mint failure is reported invites a user to
  // "retry" an already-successful mint and double-issue on the ledger.
  | "receipt_unsaved";

// ── Runtime instrumentation ─────────────────────────────────────────

export interface ActionEvent {
  action: string;
  status: ActionStatus;
  startedAt: string;
  endedAt?: string;
  cancelReason?: string;
  timeoutReason?: string;
  artifactPath?: string;
  releaseIdentity?: string;
  mode?: "studio" | "advanced";
  reconciliationResult?: string;
}

/** Lightweight action log — survives the session for debugging trust gaps. */
const actionLog: ActionEvent[] = [];

export function logAction(event: ActionEvent) {
  actionLog.push(event);
}

export function getActionLog(): readonly ActionEvent[] {
  return actionLog;
}

export function clearActionLog() {
  actionLog.length = 0;
}

// ── Shared timeout wrapper (F-dba2ccb6) ──────────────────────────────

/**
 * The mint path's own 90s timeout-race, factored out so every other
 * network-touching engine call can use the exact same mechanism instead
 * of each button spinning "running" forever on a hang. This is the
 * generic half of the pattern runMint has used since F-74549b0b:
 *
 *   1. The caller kicks off `promise` and attaches its OWN .then/.catch
 *      to it FIRST, to handle the real result whenever it lands.
 *   2. The caller then `await`s this function, passing that SAME
 *      promise plus a per-call `timeoutMs`.
 *   3. This resolves to `true` if `timeoutMs` elapses before `promise`
 *      settles (the caller should show a "timed out" state), or
 *      `false` if `promise` had already settled by then (the caller's
 *      own .then/.catch already ran — there is nothing left to do).
 *
 * Deliberately does NOT cancel or abandon `promise`: Tauri's invoke()
 * has no abort mechanism, and the underlying bridge-worker call keeps
 * running regardless — pretending otherwise would just hide that fact.
 * Because both the "did it settle" check and the timeout race below are
 * attached to the SAME promise the caller already attached its real
 * handler to, and promise reactions on one promise always fire in
 * attachment order, the caller's real handler is guaranteed to run
 * before this function's timeout branch could ever "steal" a result
 * that actually arrived in time — so a result that lands late (after
 * the timeout already fired) is never silently dropped, only reported
 * after the fact via whatever the caller's own .then/.catch already did
 * with it.
 */
async function engineCallTimedOut(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const settledMarker = promise.then(
    () => "settled" as const,
    () => "settled" as const
  );
  const timeoutMarker = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const winner = await Promise.race([settledMarker, timeoutMarker]);
  return winner === "timeout";
}

/** Shared timeout budget for every wrapped engine call, mint included —
 *  see F-dba2ccb6: "keep mint's existing 90s semantics unchanged" is
 *  satisfied by giving everything else that exact same constant rather
 *  than inventing a different number per call site. */
const ENGINE_CALL_TIMEOUT_MS = 90_000;

/**
 * Mint's own honest wording, reused rather than re-invented per call
 * site: a timeout is NOT necessarily a failure — the underlying call
 * may still complete — so the message says so and points at retrying.
 * Mint additionally has its own "Check receipt file" reconciliation
 * affordance (it is the one call that is irreversible and cannot
 * safely be retried blind); every other wrapped call here is a read or
 * a local-artifact write with no ledger side effect, so simply retrying
 * once the operation is confirmed finished is always safe.
 */
function engineTimeoutMessage(action: string): string {
  return `${action} timed out. It may still be completing in the background — this is not necessarily a failure. Check back, or try again.`;
}

// ── Release identity ────────────────────────────────────────────────

export interface ReleaseIdentity {
  manifestId: string | null;
  title: string | null;
  artist: string | null;
  network: string;
}

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
  runMintFromStudio: (manifestPath: string, walletsPath: string, receiptPath: string) => Promise<{ receiptSaved: boolean }>;
  saveReceiptTo: (path: string) => Promise<void>;
  reconcileReceipt: () => Promise<void>;

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

  // Network & identity
  network: string;
  releaseIdentity: ReleaseIdentity;

  // Instrumentation
  actionLog: readonly ActionEvent[];

  // Session reset
  resetAll: () => void;
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

  // True from the moment a mint dispatch starts until the underlying
  // engineMint(...) call actually settles (success or real failure) — a
  // client-side timeout does NOT clear it. This is the guard against
  // F-74549b0b: runMint/runMintFromStudio previously abandoned the
  // in-flight mint promise on timeout with nothing tracking whether it
  // was still running, so a user-initiated retry could fire a second real
  // mint_release call while the first was still in flight on the XRPL
  // ledger. A plain ref (not React state) is used deliberately: it must
  // be read/written synchronously and must never go stale across renders
  // the way a value captured by a useCallback dependency array can.
  const mintInFlightRef = useRef(false);

  // ── Manifest actions ────────────────────────────────────────────

  const loadManifest = useCallback(async () => {
    try {
      const result = await open({
        title: "Load Release Manifest",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!result) {
        logAction({ action: "load_manifest", status: "canceled", startedAt: new Date().toISOString(), cancelReason: "file_picker_dismissed" });
        return;
      }

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

    if (mintInFlightRef.current) {
      // A prior mint (possibly timed out from the caller's point of view)
      // has not actually settled yet. Never let a second dispatch race it
      // — that is exactly how the same release gets minted twice on the
      // XRPL ledger. See F-74549b0b.
      setMint((s) => ({
        ...s,
        error: "A mint is already in progress for this release. Wait for it to finish, or use Check Status.",
      }));
      return;
    }

    try {
      const receiptPath = await save({
        title: "Save Issuance Receipt",
        defaultPath: "receipt.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!receiptPath) {
        logAction({ action: "mint", status: "canceled", startedAt: new Date().toISOString(), cancelReason: "receipt_save_dismissed" });
        return;
      }

      const startedAt = new Date().toISOString();
      const walletsPathAtStart = mintState.walletsPath;
      mintInFlightRef.current = true;
      setMint((s) => ({ ...s, actionStatus: "running", error: null }));

      const mintPromise = engineMint({
        manifestPath: manifestState.path,
        walletsPath: walletsPathAtStart,
        network,
        receiptPath,
      });

      // Attached BEFORE the timeout race below, and to the promise
      // itself (not to the race) — so this fires exactly once whenever
      // the REAL mint_release call actually finishes, regardless of
      // whether the client-side timeout below fires first. This is what
      // makes "the prior attempt is confirmed dead" a fact instead of a
      // guess: the mint's own eventual result is never dropped on the
      // floor, so its receipt is never lost and the in-flight lock is
      // only ever cleared once the operation genuinely ends.
      mintPromise.then(
        (result) => {
          mintInFlightRef.current = false;
          if (isMintReceiptUnsaved(result)) {
            // The mint succeeded on-chain — only the on-disk save failed.
            // This is NOT a mint failure (see F-cf8b67bb): the receipt
            // must stay visible and available so the user can save it
            // manually, and must never be reported through the same
            // "error" state a genuine mint failure uses.
            logAction({
              action: "mint",
              status: "receipt_unsaved",
              startedAt,
              endedAt: new Date().toISOString(),
              artifactPath: receiptPath,
            });
            setMint({
              status: "loaded",
              actionStatus: "receipt_unsaved",
              walletsPath: walletsPathAtStart,
              receiptPath: result.receiptPath,
              receipt: result.receipt,
              error: `Your release WAS minted successfully — the receipt could not be saved to ${result.receiptPath} (${result.receiptWriteError}). Save it now using the button below so you don't lose the token and transaction IDs.`,
            });
            return;
          }
          logAction({ action: "mint", status: "done", startedAt, endedAt: new Date().toISOString(), artifactPath: receiptPath });
          setMint({
            status: "loaded",
            actionStatus: "done",
            walletsPath: walletsPathAtStart,
            receiptPath,
            receipt: result,
            error: null,
          });
        },
        (err) => {
          mintInFlightRef.current = false;
          const msg = err instanceof Error ? err.message : String(err);
          logAction({ action: "mint", status: "error", startedAt, endedAt: new Date().toISOString() });
          setMint((s) => ({ ...s, actionStatus: "error", error: msg }));
        }
      );

      // F-dba2ccb6: this race is now the shared engineCallTimedOut()
      // helper (defined near the top of this file) — every other
      // network-touching engine call below uses the exact same
      // mechanism. Mint's specific business logic (the mintInFlightRef
      // guard, the receipt_unsaved distinction, this message) is
      // unchanged; only the generic "did it settle before the timeout"
      // race was factored out.
      const timedOut = await engineCallTimedOut(mintPromise, ENGINE_CALL_TIMEOUT_MS);

      if (timedOut) {
        // Only show the timeout UI if the real promise hasn't already
        // settled in the meantime (the .then above always runs first,
        // since reactions on the same promise fire in attachment order).
        setMint((s) =>
          s.actionStatus === "running"
            ? {
                ...s,
                actionStatus: "timed_out",
                error:
                  "Mint timed out. The transaction may still be processing. Check the receipt file or retry.",
              }
            : s
        );
        logAction({ action: "mint", status: "timed_out", startedAt, timeoutReason: "90s exceeded" });
      }
    } catch (err) {
      // Only reachable for failures before the mint itself was dispatched
      // (e.g. the save dialog throwing) — mintInFlightRef was never set.
      const msg = err instanceof Error ? err.message : String(err);
      setMint((s) => ({ ...s, actionStatus: "error", error: msg }));
    }
  }, [manifestState.path, mintState.walletsPath, network]);

  /**
   * Studio Mode mint: accepts paths directly instead of using dialog pickers.
   * Also populates ManifestState so Advanced mode can inspect the artifacts.
   */
  const runMintFromStudio = useCallback(async (
    manifestPath: string,
    walletsPath: string,
    receiptPath: string,
  ) => {
    if (mintInFlightRef.current) {
      // Same guard as runMint (they share mintInFlightRef): never let a
      // second real mint_release dispatch race an unresolved one. See
      // F-74549b0b — PublishPage's own 90s timeout wrapper must not be
      // able to fire a second mint while the first is still outstanding.
      const msg = "A mint is already in progress for this release. Wait for it to finish, or use Check Status.";
      setMint((s) => ({ ...s, error: msg }));
      throw new Error(msg); // Re-throw so PublishPage can catch it
    }

    mintInFlightRef.current = true;
    try {
      // Load manifest into state so Advanced mode can see it
      const manifestRaw = await loadFile(manifestPath);
      const manifestData = JSON.parse(manifestRaw) as ReleaseManifest;
      setManifest({
        status: "loaded",
        path: manifestPath,
        data: manifestData,
        validation: null,
        resolution: null,
        stamp: null,
        error: null,
      });

      setMint((s) => ({
        ...s,
        status: "loading",
        actionStatus: "running",
        walletsPath,
        error: null,
      }));

      // Deliberately not raced against a timeout here — this function has
      // no client-side deadline of its own. PublishPage layers its own
      // 90s timeout on top of the promise this returns, but this await
      // keeps running underneath regardless of what the caller does with
      // it, so the mint's real outcome (and its receipt) is never lost
      // and mintInFlightRef is only cleared once it genuinely settles.
      const result = await engineMint({
        manifestPath,
        walletsPath,
        network,
        receiptPath,
      });

      if (isMintReceiptUnsaved(result)) {
        // The mint succeeded on-chain — only the on-disk save failed.
        // This must NOT be thrown (that would re-report a success as a
        // failure to PublishPage's catch — see F-cf8b67bb). The raw
        // receipt stays in state so the caller can offer a manual save.
        setMint({
          status: "loaded",
          actionStatus: "receipt_unsaved",
          walletsPath,
          receiptPath: result.receiptPath,
          receipt: result.receipt,
          error: `Your release WAS minted successfully — the receipt could not be saved to ${result.receiptPath} (${result.receiptWriteError}). Save it now using the button below so you don't lose the token and transaction IDs.`,
        });
        return { receiptSaved: false };
      }

      setMint({
        status: "loaded",
        actionStatus: "done",
        walletsPath,
        receiptPath,
        receipt: result,
        error: null,
      });
      return { receiptSaved: true };
    } catch (err) {
      setMint((s) => ({
        ...s,
        actionStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err; // Re-throw so PublishPage can catch it
    } finally {
      mintInFlightRef.current = false;
    }
  }, [network]);

  /**
   * Manually save the in-memory receipt to a new path — the recovery
   * action for the "mint succeeded, receipt could not be saved"
   * (receipt_unsaved) state. See F-cf8b67bb: the receipt itself was
   * never discarded, so this can always be retried against a different
   * (working) location without touching the ledger again.
   */
  const saveReceiptTo = useCallback(async (path: string) => {
    if (!mintState.receipt) return;
    try {
      await saveFile(path, JSON.stringify(mintState.receipt, null, 2) + "\n");
      setMint((s) => ({
        ...s,
        status: "loaded",
        actionStatus: "done",
        receiptPath: path,
        error: null,
      }));
      logAction({
        action: "mint_receipt_save",
        status: "done",
        startedAt: new Date().toISOString(),
        artifactPath: path,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMint((s) => ({
        ...s,
        // Stay in receipt_unsaved — the mint still succeeded and the
        // receipt is still sitting safely in memory, only this specific
        // save attempt failed. Never fall back to "error" here: that
        // would misreport an already-successful mint yet again.
        actionStatus: "receipt_unsaved",
        error: `Still could not save the receipt to ${path} (${msg}). The mint itself succeeded — keep this window open, or copy the receipt data shown above.`,
      }));
    }
  }, [mintState.receipt]);

  /**
   * F-15fcdca0: PublishPage's handleReconcile() re-reads the exact
   * receiptPath for a timed-out mint with state-aware feedback; Advanced
   * mode's MintPanel had no equivalent — its "Check Status" was wired
   * straight to loadReceipt() (a generic native file-open dialog with no
   * default path) even though mint.receiptPath is already sitting in
   * state, right next to it. This promotes that same logic here so both
   * modes share it. Mirrors handleReconcile's reasoning exactly:
   * mint.actionStatus is the authoritative signal for whether the
   * original attempt has actually finished — a missing/unreadable
   * receipt file does NOT by itself mean the mint is dead (it may simply
   * not have written its receipt yet while still running server-side),
   * so retry is only ever declared "safe" once actionStatus confirms it.
   */
  const reconcileReceipt = useCallback(async () => {
    if (!mintState.receiptPath) return;

    if (mintState.actionStatus === "running") {
      setMint((s) => ({
        ...s,
        error: "The mint is still running. Retry is disabled until it finishes — check back in a moment.",
      }));
      return;
    }

    try {
      const content = await loadFile(mintState.receiptPath);
      const receipt = JSON.parse(content) as IssuanceReceipt;
      if (receipt?.xrpl?.nftTokenIds?.length > 0) {
        // The mint actually succeeded — the earlier uncertainty (a
        // timeout, or simply not having reconciled yet) is resolved.
        setMint((s) => ({
          ...s,
          status: "loaded",
          actionStatus: "done",
          receipt,
          error: null,
        }));
        logAction({
          action: "mint_reconcile",
          status: "done",
          startedAt: new Date().toISOString(),
          reconciliationResult: "receipt_found_valid",
          artifactPath: mintState.receiptPath,
        });
      } else if (mintState.actionStatus === "error") {
        setMint((s) => ({ ...s, error: "The mint failed and did not complete. You can retry safely." }));
      } else {
        setMint((s) => ({
          ...s,
          error: "Receipt file exists but contains no token IDs. The mint may not have completed. You can retry safely.",
        }));
      }
    } catch {
      if (mintState.actionStatus === "error") {
        setMint((s) => ({ ...s, error: "No receipt file found, and the mint has confirmed-failed. You can retry safely." }));
      } else {
        setMint((s) => ({
          ...s,
          error: "No receipt file found. The mint may still be running server-side — retry is disabled until it's confirmed finished.",
        }));
      }
    }
  }, [mintState.receiptPath, mintState.actionStatus]);

  // ── Verify actions ──────────────────────────────────────────────

  const runVerify = useCallback(async () => {
    if (!manifestState.path || !mintState.receiptPath) return;

    setVerify({ status: "running", result: null, error: null });

    // F-dba2ccb6: verify_release makes live XRPL checks inside the
    // bridge worker (token existence, authorized minter status) and
    // previously had no timeout at all. The real handler is attached
    // BEFORE the race below so a late result is never lost — same
    // pattern as mint, factored into engineCallTimedOut().
    const callPromise = engineVerify(manifestState.path, mintState.receiptPath);

    callPromise.then(
      (result) => { setVerify({ status: "done", result, error: null }); },
      (err) => {
        setVerify({
          status: "error",
          result: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
    if (timedOut) {
      setVerify((s) =>
        s.status === "running"
          ? { ...s, status: "timed_out", error: engineTimeoutMessage("Verify") }
          : s
      );
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
      if (!outputPath) {
        logAction({
          action: "create_access_policy",
          status: "canceled",
          startedAt: new Date().toISOString(),
          cancelReason: "save_dialog_dismissed",
        });
        return;
      }

      setAccess((s) => ({ ...s, policyStatus: "loading", error: null }));

      const label = `${manifestState.data?.benefit?.kind ?? "benefit"} for ${manifestState.data?.title ?? "release"} holders`;

      // F-dba2ccb6: create_access_policy had no timeout at all.
      const callPromise = engineCreatePolicy({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        label,
        ttlSeconds: 3600,
        outputPath,
      });

      callPromise.then(
        (policy) => {
          setAccess((s) => ({
            ...s,
            policyStatus: "loaded",
            policyPath: outputPath,
            policy,
            error: null,
          }));
        },
        (err) => {
          setAccess((s) => ({
            ...s,
            policyStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setAccess((s) =>
          s.policyStatus === "loading"
            ? { ...s, policyStatus: "timed_out", error: engineTimeoutMessage("Create Policy") }
            : s
        );
      }
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

    setAccess((s) => ({ ...s, grantStatus: "running", grant: null, error: null }));

    // F-dba2ccb6: grant_access calls checkHolderAccess against XRPL
    // inside the bridge worker and had no timeout — both AccessPanel's
    // and Studio's TestAccessPage's "Check Access"/"Test as Collector"
    // buttons share this one function, so this one wrapper covers both
    // call sites.
    const callPromise = engineGrant({
      manifestPath: manifestState.path,
      receiptPath: mintState.receiptPath,
      policyPath: accessState.policyPath,
      walletAddress: accessState.walletAddress,
    });

    callPromise.then(
      (grant) => { setAccess((s) => ({ ...s, grantStatus: "done", grant, error: null })); },
      (err) => {
        setAccess((s) => ({
          ...s,
          grantStatus: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    );

    const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
    if (timedOut) {
      setAccess((s) =>
        s.grantStatus === "running"
          ? { ...s, grantStatus: "timed_out", error: engineTimeoutMessage("Check Access") }
          : s
      );
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

      if (!outputPath) {
        setRecovery((s) => ({ ...s, status: "canceled", error: null }));
        logAction({
          action: "recover",
          status: "canceled",
          startedAt: new Date().toISOString(),
          cancelReason: "save_dialog_dismissed",
          mode: "studio",
        });
        return;
      }

      setRecovery((s) => ({ ...s, status: "running", error: null }));

      // F-dba2ccb6: recover_release chain-verifies against XRPL inside
      // the bridge worker (RecoveryPage's own copy sets the expectation
      // directly: "Usually takes a few seconds") and had no timeout.
      const callPromise = engineRecover({
        manifestPath: manifestState.path,
        receiptPath: mintState.receiptPath,
        policyPath: accessState.policyPath ?? undefined,
        outputPath,
      });

      callPromise.then(
        (result) => {
          setRecovery((s) => ({
            ...s,
            status: "done",
            result,
            bundlePath: outputPath,
            error: null,
          }));
          logAction({
            action: "recover",
            status: "done",
            startedAt: new Date().toISOString(),
            artifactPath: outputPath,
            mode: "studio",
          });
        },
        (err) => {
          setRecovery((s) => ({
            ...s,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setRecovery((s) =>
          s.status === "running"
            ? { ...s, status: "timed_out", error: engineTimeoutMessage("Recovery") }
            : s
        );
      }
    } catch (err) {
      setRecovery((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [manifestState.path, mintState.receiptPath, accessState.policyPath]);

  const runReplay = useCallback(async (holderAddress: string, nonHolderAddress: string) => {
    const manifestPath = manifestState.path;
    const receiptPath = mintState.receiptPath;
    const policyPath = accessState.policyPath;
    if (!manifestPath || !receiptPath || !policyPath) return;

    try {
      setRecovery((s) => ({ ...s, replayStatus: "running", replayHolder: null, replayNonHolder: null, error: null }));

      // F-dba2ccb6: runReplay makes two sequential grant_access checks
      // (holder then non-holder) with no timeout on either. Both share
      // ONE 90s budget here rather than 90s each — if the first (holder)
      // check alone hangs past it, the second is never reached and the
      // whole replay reports timed_out, rather than the button being
      // able to sit "running" for up to 180s before any feedback.
      const callPromise = (async () => {
        const holderGrant = await engineGrant({
          manifestPath, receiptPath, policyPath, walletAddress: holderAddress,
        });
        const nonHolderGrant = await engineGrant({
          manifestPath, receiptPath, policyPath, walletAddress: nonHolderAddress,
        });
        return { holderGrant, nonHolderGrant };
      })();

      callPromise.then(
        ({ holderGrant, nonHolderGrant }) => {
          setRecovery((s) => ({
            ...s,
            replayStatus: "done",
            replayHolder: holderGrant,
            replayNonHolder: nonHolderGrant,
            error: null,
          }));
        },
        (err) => {
          setRecovery((s) => ({
            ...s,
            replayStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setRecovery((s) =>
          s.replayStatus === "running"
            ? { ...s, replayStatus: "timed_out", error: engineTimeoutMessage("Replay") }
            : s
        );
      }
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

      // F-dba2ccb6: create_governance_policy had no timeout.
      const callPromise = engineCreateGovPolicy({
        manifestPath: manifestState.path,
        treasuryAddress: opts.treasuryAddress,
        network,
        signers: opts.signers,
        threshold: opts.threshold,
        allowedAssets: opts.allowedAssets,
        createdBy: opts.createdBy,
        outputPath,
      });

      callPromise.then(
        (policy) => {
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
        },
        (err) => {
          setGovernance((s) => ({
            ...s,
            policyStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setGovernance((s) =>
          s.policyStatus === "loading"
            ? { ...s, policyStatus: "timed_out", error: engineTimeoutMessage("Create Governance Policy") }
            : s
        );
      }
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

      // F-dba2ccb6: propose_payout had no timeout.
      const callPromise = engineProposePayout({
        policyPath: governanceState.policyPath,
        proposalId: opts.proposalId,
        outputs: opts.outputs,
        createdBy: opts.createdBy,
        memo: opts.memo,
        outputPath,
      });

      callPromise.then(
        (proposal) => {
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
        },
        (err) => {
          setGovernance((s) => ({
            ...s,
            proposalStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setGovernance((s) =>
          s.proposalStatus === "loading"
            ? { ...s, proposalStatus: "timed_out", error: engineTimeoutMessage("Create Proposal") }
            : s
        );
      }
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

      // F-dba2ccb6: decide_payout had no timeout.
      const callPromise = engineDecidePayout({
        policyPath: governanceState.policyPath,
        proposalPath: governanceState.proposalPath,
        approvals: opts.approvals,
        decidedBy: opts.decidedBy,
        outputPath,
      });

      callPromise.then(
        (decision) => {
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
        },
        (err) => {
          setGovernance((s) => ({
            ...s,
            decisionStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setGovernance((s) =>
          s.decisionStatus === "loading"
            ? { ...s, decisionStatus: "timed_out", error: engineTimeoutMessage("Record Decision") }
            : s
        );
      }
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

      // F-dba2ccb6: execute_payout had no timeout.
      const callPromise = engineExecutePayout({
        policyPath: governanceState.policyPath,
        proposalPath: governanceState.proposalPath,
        decisionPath: governanceState.decisionPath,
        txHashes: opts.txHashes,
        executedOutputs: opts.executedOutputs,
        executedBy: opts.executedBy,
        outputPath,
      });

      callPromise.then(
        (execution) => {
          setGovernance((s) => ({
            ...s,
            executionStatus: "loaded",
            executionPath: outputPath,
            execution,
            verifyStatus: "idle", verifyResult: null,
            error: null,
          }));
        },
        (err) => {
          setGovernance((s) => ({
            ...s,
            executionStatus: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      );

      const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
      if (timedOut) {
        setGovernance((s) =>
          s.executionStatus === "loading"
            ? { ...s, executionStatus: "timed_out", error: engineTimeoutMessage("Record Execution") }
            : s
        );
      }
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

    setGovernance((s) => ({ ...s, verifyStatus: "running", verifyResult: null, error: null }));

    // F-dba2ccb6: verify_payout had no timeout.
    const callPromise = engineVerifyPayout({
      policyPath: governanceState.policyPath,
      proposalPath: governanceState.proposalPath,
      decisionPath: governanceState.decisionPath,
      executionPath: governanceState.executionPath,
    });

    callPromise.then(
      (result) => { setGovernance((s) => ({ ...s, verifyStatus: "done", verifyResult: result, error: null })); },
      (err) => {
        setGovernance((s) => ({
          ...s,
          verifyStatus: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    );

    const timedOut = await engineCallTimedOut(callPromise, ENGINE_CALL_TIMEOUT_MS);
    if (timedOut) {
      setGovernance((s) =>
        s.verifyStatus === "running"
          ? { ...s, verifyStatus: "timed_out", error: engineTimeoutMessage("Verify Payout") }
          : s
      );
    }
  }, [governanceState.policyPath, governanceState.proposalPath,
      governanceState.decisionPath, governanceState.executionPath]);

  // ── Release identity ────────────────────────────────────────────

  const releaseIdentity: ReleaseIdentity = {
    manifestId: manifestState.data?.id ?? manifestState.stamp?.manifestId ?? null,
    title: manifestState.data?.title ?? null,
    artist: manifestState.data?.artist ?? null,
    network,
  };

  // ── Session reset ──────────────────────────────────────────────

  const resetAll = useCallback(() => {
    setManifest(INIT_MANIFEST);
    setMint(INIT_MINT);
    setVerify(INIT_VERIFY);
    setAccess(INIT_ACCESS);
    setRecovery(INIT_RECOVERY);
    setGovernance(INIT_GOVERNANCE);
    clearActionLog();
  }, []);

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
        runMintFromStudio,
        saveReceiptTo,
        reconcileReceipt,
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
        releaseIdentity,
        actionLog: getActionLog(),
        resetAll,
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
