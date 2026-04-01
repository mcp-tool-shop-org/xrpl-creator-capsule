import { useState } from "react";
import {
  PanelShell,
  ArtifactCard,
  ArtifactField,
  ActionButton,
  ErrorBanner,
  CheckRow,
  type Status,
} from "./PanelShell";
import { useRelease } from "../../state/release";
import type {
  GovernanceSigner,
  SignerRole,
  PayoutOutput,
  GovernanceApproval,
  ExecutedPayoutOutput,
} from "../../bridge/engine";

function deriveStatus(
  manifest: ReturnType<typeof useRelease>["manifest"],
  gov: ReturnType<typeof useRelease>["governance"]
): Status {
  if (gov.error) return "error";
  if (gov.verifyResult?.passed) return "verified";
  if (gov.verifyResult && !gov.verifyResult.passed) return "mismatch";
  if (gov.verifyStatus === "running") return "verifying";
  if (gov.execution) return "loaded";
  if (gov.decision) return "loaded";
  if (gov.proposal) return "loaded";
  if (gov.policy) return "loaded";
  if (!manifest.data) return "empty";
  return "empty";
}

export function GovernancePanel() {
  const rel = useRelease();
  const { manifest, governance: gov } = rel;
  const status = deriveStatus(manifest, gov);

  if (!manifest.data) {
    return (
      <PanelShell title="Governance" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest first. The governance panel manages treasury policies,
            payout proposals, and the multi-signer approval chain.
          </p>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Governance" status={status}>
      {gov.error && <ErrorBanner message={gov.error} />}

      {/* ── Policy section ──────────────────────────────────────── */}
      {!gov.policy ? (
        <PolicyForm
          onLoad={rel.loadGovPolicy}
          onCreate={rel.createGovPolicy}
          loading={gov.policyStatus === "loading"}
        />
      ) : (
        <PolicyCard policy={gov.policy} policyPath={gov.policyPath} />
      )}

      {/* ── Proposal section ────────────────────────────────────── */}
      {gov.policy && !gov.proposal && (
        <ProposalForm
          onLoad={rel.loadProposal}
          onCreate={rel.createProposal}
          policy={gov.policy}
          loading={gov.proposalStatus === "loading"}
        />
      )}
      {gov.proposal && (
        <ProposalCard proposal={gov.proposal} proposalPath={gov.proposalPath} />
      )}

      {/* ── Decision section ────────────────────────────────────── */}
      {gov.policy && gov.proposal && !gov.decision && (
        <DecisionForm
          onLoad={rel.loadDecision}
          onCreate={rel.createDecision}
          policy={gov.policy}
          loading={gov.decisionStatus === "loading"}
        />
      )}
      {gov.decision && (
        <DecisionCard decision={gov.decision} decisionPath={gov.decisionPath} />
      )}

      {/* ── Execution section ───────────────────────────────────── */}
      {gov.policy && gov.proposal && gov.decision &&
       gov.decision.decision.outcome === "approved" && !gov.execution && (
        <ExecutionForm
          onLoad={rel.loadExecution}
          onCreate={rel.createExecution}
          proposal={gov.proposal}
          loading={gov.executionStatus === "loading"}
        />
      )}
      {gov.execution && (
        <ExecutionCard execution={gov.execution} executionPath={gov.executionPath} />
      )}

      {/* ── Verify section ──────────────────────────────────────── */}
      {gov.policy && gov.proposal && gov.decision && gov.execution && (
        <ArtifactCard>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
            Hash Chain Verification
          </div>
          <ActionButton
            label={gov.verifyStatus === "running" ? "Verifying\u2026" : "Verify Full Chain"}
            onClick={rel.runVerifyPayout}
            disabled={gov.verifyStatus === "running"}
          />
        </ArtifactCard>
      )}

      {gov.verifyResult && (
        <ArtifactCard>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 12,
              color: gov.verifyResult.passed ? "var(--success)" : "var(--error)",
            }}
          >
            {gov.verifyResult.passed
              ? "GOVERNANCE CHAIN VERIFIED"
              : "VERIFICATION FAILED"}
          </div>
          {gov.verifyResult.checks.map((c) => (
            <CheckRow key={c.name} name={c.name} passed={c.passed} detail={c.detail} />
          ))}
        </ArtifactCard>
      )}

      {/* ── Reset actions ───────────────────────────────────────── */}
      {gov.policy && (
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionButton label="Load Different Policy" onClick={rel.loadGovPolicy} variant="secondary" />
          {gov.proposal && (
            <ActionButton label="Load Different Proposal" onClick={rel.loadProposal} variant="secondary" />
          )}
        </div>
      )}
    </PanelShell>
  );
}

// ── Policy Form ────────────────────────────────────────────────────

function PolicyForm({
  onLoad,
  onCreate,
  loading,
}: {
  onLoad: () => void;
  onCreate: (opts: {
    treasuryAddress: string;
    signers: GovernanceSigner[];
    threshold: number;
    allowedAssets?: string[];
    createdBy: string;
  }) => void;
  loading: boolean;
}) {
  const [treasury, setTreasury] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [signers, setSigners] = useState<GovernanceSigner[]>([
    { address: "", role: "artist", label: "" },
  ]);

  const addSigner = () => {
    setSigners([...signers, { address: "", role: "collaborator", label: "" }]);
  };

  const updateSigner = (i: number, field: keyof GovernanceSigner, value: string) => {
    const next = [...signers];
    next[i] = { ...next[i], [field]: value };
    setSigners(next);
  };

  const removeSigner = (i: number) => {
    setSigners(signers.filter((_, idx) => idx !== i));
  };

  const canCreate = treasury.trim() && createdBy.trim() &&
    signers.every((s) => s.address.trim()) && threshold > 0 && threshold <= signers.length;

  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
        Governance Policy
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
        A governance policy defines who controls the treasury, how many approvals
        are needed for payouts, and which assets can be distributed.
      </p>

      <FormField label="Treasury Address">
        <input value={treasury} onChange={(e) => setTreasury(e.target.value)}
          placeholder="rTreasuryAddress..." style={inputStyle} />
      </FormField>

      <FormField label="Created By">
        <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}
          placeholder="Creator name or address" style={inputStyle} />
      </FormField>

      <FormField label={`Approval Threshold (of ${signers.length} signer${signers.length !== 1 ? "s" : ""})`}>
        <input type="number" min={1} max={signers.length || 1} value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>Signers</div>
        {signers.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input value={s.address} placeholder="rSignerAddress..."
              onChange={(e) => updateSigner(i, "address", e.target.value)}
              style={{ ...inputStyle, flex: 2 }} />
            <select value={s.role}
              onChange={(e) => updateSigner(i, "role", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={s.label ?? ""} placeholder="Label"
              onChange={(e) => updateSigner(i, "label", e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
            {signers.length > 1 && (
              <button onClick={() => removeSigner(i)} style={removeStyle}>&times;</button>
            )}
          </div>
        ))}
        <button onClick={addSigner} style={addStyle}>+ Add Signer</button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <ActionButton
          label={loading ? "Creating\u2026" : "Create Policy"}
          onClick={() => onCreate({
            treasuryAddress: treasury,
            signers,
            threshold,
            createdBy,
          })}
          disabled={loading || !canCreate}
        />
        <ActionButton label="Load Policy" onClick={onLoad} variant="secondary" />
      </div>
    </ArtifactCard>
  );
}

// ── Policy Card ────────────────────────────────────────────────────

function PolicyCard({ policy, policyPath }: {
  policy: ReturnType<typeof useRelease>["governance"]["policy"];
  policyPath: string | null;
}) {
  if (!policy) return null;
  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
        Governance Policy
      </div>
      <ArtifactField label="Manifest ID" value={policy.manifestId} mono />
      <ArtifactField label="Network" value={policy.network} />
      <ArtifactField label="Treasury" value={policy.treasuryAddress} mono />
      <ArtifactField label="Threshold" value={`${policy.signerPolicy.threshold} of ${policy.signerPolicy.signers.length}`} />
      <ArtifactField label="Allowed Assets" value={policy.payoutPolicy.allowedAssets.join(", ")} />
      <ArtifactField label="Created By" value={policy.createdBy} />
      {policy.policyHash && <ArtifactField label="Policy Hash" value={policy.policyHash} mono />}
      {policyPath && <ArtifactField label="File" value={policyPath} mono />}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Signers</div>
        {policy.signerPolicy.signers.map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: "var(--text)", marginBottom: 4, display: "flex", gap: 8 }}>
            <span style={{ fontFamily: "monospace" }}>{s.address}</span>
            <span style={{ color: "var(--text-muted)" }}>({s.role}{s.label ? ` \u2014 ${s.label}` : ""})</span>
          </div>
        ))}
      </div>
    </ArtifactCard>
  );
}

// ── Proposal Form ──────────────────────────────────────────────────

function ProposalForm({
  onLoad,
  onCreate,
  policy,
  loading,
}: {
  onLoad: () => void;
  onCreate: (opts: {
    proposalId: string;
    outputs: PayoutOutput[];
    createdBy: string;
    memo?: string;
  }) => void;
  policy: NonNullable<ReturnType<typeof useRelease>["governance"]["policy"]>;
  loading: boolean;
}) {
  const [proposalId, setProposalId] = useState(`payout-${Date.now()}`);
  const [createdBy, setCreatedBy] = useState("");
  const [memo, setMemo] = useState("");
  const [outputs, setOutputs] = useState<PayoutOutput[]>([
    { address: "", amount: "", asset: "XRP", role: "artist", reason: "" },
  ]);

  const addOutput = () => {
    setOutputs([...outputs, { address: "", amount: "", asset: "XRP", role: "collaborator", reason: "" }]);
  };

  const updateOutput = (i: number, field: keyof PayoutOutput, value: string) => {
    const next = [...outputs];
    next[i] = { ...next[i], [field]: value };
    setOutputs(next);
  };

  const removeOutput = (i: number) => {
    setOutputs(outputs.filter((_, idx) => idx !== i));
  };

  const canCreate = proposalId.trim() && createdBy.trim() &&
    outputs.every((o) => o.address.trim() && o.amount.trim() && o.reason.trim());

  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
        Payout Proposal
      </div>

      <FormField label="Proposal ID">
        <input value={proposalId} onChange={(e) => setProposalId(e.target.value)}
          style={inputStyle} />
      </FormField>

      <FormField label="Created By">
        <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}
          placeholder="Proposer name or address" style={inputStyle} />
      </FormField>

      <FormField label="Memo (optional)">
        <input value={memo} onChange={(e) => setMemo(e.target.value)}
          placeholder="Reason for this payout" style={inputStyle} />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>Payout Outputs</div>
        {outputs.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input value={o.address} placeholder="rAddress..."
              onChange={(e) => updateOutput(i, "address", e.target.value)}
              style={{ ...inputStyle, flex: 2, minWidth: 140 }} />
            <input value={o.amount} placeholder="Amount"
              onChange={(e) => updateOutput(i, "amount", e.target.value)}
              style={{ ...inputStyle, width: 80 }} />
            <select value={o.asset}
              onChange={(e) => updateOutput(i, "asset", e.target.value)}
              style={{ ...inputStyle, width: 80 }}>
              {policy.payoutPolicy.allowedAssets.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select value={o.role}
              onChange={(e) => updateOutput(i, "role", e.target.value)}
              style={{ ...inputStyle, width: 100 }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={o.reason} placeholder="Reason"
              onChange={(e) => updateOutput(i, "reason", e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
            {outputs.length > 1 && (
              <button onClick={() => removeOutput(i)} style={removeStyle}>&times;</button>
            )}
          </div>
        ))}
        <button onClick={addOutput} style={addStyle}>+ Add Output</button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <ActionButton
          label={loading ? "Creating\u2026" : "Create Proposal"}
          onClick={() => onCreate({
            proposalId,
            outputs,
            createdBy,
            memo: memo || undefined,
          })}
          disabled={loading || !canCreate}
        />
        <ActionButton label="Load Proposal" onClick={onLoad} variant="secondary" />
      </div>
    </ArtifactCard>
  );
}

// ── Proposal Card ──────────────────────────────────────────────────

function ProposalCard({ proposal, proposalPath }: {
  proposal: ReturnType<typeof useRelease>["governance"]["proposal"];
  proposalPath: string | null;
}) {
  if (!proposal) return null;
  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
        Payout Proposal
      </div>
      <ArtifactField label="Proposal ID" value={proposal.proposalId} />
      <ArtifactField label="Created By" value={proposal.createdBy} />
      {proposal.memo && <ArtifactField label="Memo" value={proposal.memo} />}
      <ArtifactField label="Policy Hash" value={proposal.policyHash} mono />
      {proposal.proposalHash && <ArtifactField label="Proposal Hash" value={proposal.proposalHash} mono />}
      {proposalPath && <ArtifactField label="File" value={proposalPath} mono />}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
          Outputs ({proposal.outputs.length})
        </div>
        {proposal.outputs.map((o, i) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 6, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "monospace", color: "var(--text)" }}>{o.address}</div>
            <div style={{ color: "var(--text-muted)" }}>
              {o.amount} {o.asset} &middot; {o.role} &middot; {o.reason}
            </div>
          </div>
        ))}
      </div>
    </ArtifactCard>
  );
}

// ── Decision Form ──────────────────────────────────────────────────

function DecisionForm({
  onLoad,
  onCreate,
  policy,
  loading,
}: {
  onLoad: () => void;
  onCreate: (opts: {
    approvals: GovernanceApproval[];
    decidedBy: string;
  }) => void;
  policy: NonNullable<ReturnType<typeof useRelease>["governance"]["policy"]>;
  loading: boolean;
}) {
  const [decidedBy, setDecidedBy] = useState("");
  const [approvals, setApprovals] = useState<GovernanceApproval[]>(
    policy.signerPolicy.signers.map((s) => ({
      signerAddress: s.address,
      approved: true,
      decidedAt: new Date().toISOString(),
    }))
  );

  const toggleApproval = (i: number) => {
    const next = [...approvals];
    next[i] = { ...next[i], approved: !next[i].approved, decidedAt: new Date().toISOString() };
    setApprovals(next);
  };

  const setNote = (i: number, note: string) => {
    const next = [...approvals];
    next[i] = { ...next[i], note: note || undefined };
    setApprovals(next);
  };

  const approvedCount = approvals.filter((a) => a.approved).length;

  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
        Payout Decision
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
        Each signer votes to approve or reject. Threshold: {policy.signerPolicy.threshold} of {policy.signerPolicy.signers.length}.
        Current: {approvedCount} approved.
      </p>

      <FormField label="Decided By">
        <input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)}
          placeholder="Decision recorder" style={inputStyle} />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        {approvals.map((a, i) => {
          const signer = policy.signerPolicy.signers[i];
          return (
            <div key={i} style={{ marginBottom: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <button
                  onClick={() => toggleApproval(i)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 16, color: a.approved ? "var(--success)" : "var(--error)",
                  }}
                >
                  {a.approved ? "\u2713" : "\u2717"}
                </button>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>
                  {a.signerAddress}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  ({signer?.role}{signer?.label ? ` \u2014 ${signer.label}` : ""})
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: a.approved ? "var(--success)" : "var(--error)", marginLeft: "auto" }}>
                  {a.approved ? "APPROVE" : "REJECT"}
                </span>
              </div>
              <input
                value={a.note ?? ""}
                onChange={(e) => setNote(i, e.target.value)}
                placeholder="Note (optional)"
                style={{ ...inputStyle, fontSize: 11 }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <ActionButton
          label={loading ? "Deciding\u2026" : "Record Decision"}
          onClick={() => onCreate({ approvals, decidedBy })}
          disabled={loading || !decidedBy.trim()}
        />
        <ActionButton label="Load Decision" onClick={onLoad} variant="secondary" />
      </div>
    </ArtifactCard>
  );
}

// ── Decision Card ──────────────────────────────────────────────────

function DecisionCard({ decision, decisionPath }: {
  decision: ReturnType<typeof useRelease>["governance"]["decision"];
  decisionPath: string | null;
}) {
  if (!decision) return null;
  const approved = decision.decision.outcome === "approved";
  return (
    <ArtifactCard>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: approved ? "var(--success)" : "var(--error)",
        }}
      >
        {approved ? "PAYOUT APPROVED" : "PAYOUT REJECTED"}
      </div>
      <ArtifactField label="Outcome" value={decision.decision.outcome.toUpperCase()} />
      <ArtifactField label="Threshold Met" value={decision.decision.thresholdMet ? "Yes" : "No"} />
      <ArtifactField label="Approved" value={String(decision.decision.approvedCount)} />
      <ArtifactField label="Rejected" value={String(decision.decision.rejectedCount)} />
      <ArtifactField label="Decided By" value={decision.decidedBy} />
      {decision.decisionHash && <ArtifactField label="Decision Hash" value={decision.decisionHash} mono />}
      {decisionPath && <ArtifactField label="File" value={decisionPath} mono />}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Votes</div>
        {decision.approvals.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: a.approved ? "var(--success)" : "var(--error)" }}>
              {a.approved ? "\u2713" : "\u2717"}
            </span>
            <span style={{ fontFamily: "monospace", color: "var(--text)" }}>{a.signerAddress}</span>
            {a.note && <span style={{ color: "var(--text-muted)" }}>&mdash; {a.note}</span>}
          </div>
        ))}
      </div>
    </ArtifactCard>
  );
}

// ── Execution Form ─────────────────────────────────────────────────

function ExecutionForm({
  onLoad,
  onCreate,
  proposal,
  loading,
}: {
  onLoad: () => void;
  onCreate: (opts: {
    txHashes: string[];
    executedOutputs: ExecutedPayoutOutput[];
    executedBy: string;
  }) => void;
  proposal: NonNullable<ReturnType<typeof useRelease>["governance"]["proposal"]>;
  loading: boolean;
}) {
  const [executedBy, setExecutedBy] = useState("");
  const [txHashes, setTxHashes] = useState<string[]>([""]);
  const [executedOutputs] = useState<ExecutedPayoutOutput[]>(
    proposal.outputs.map((o) => ({
      address: o.address,
      amount: o.amount,
      asset: o.asset,
      role: o.role,
      reason: o.reason,
    }))
  );

  const addTxHash = () => setTxHashes([...txHashes, ""]);
  const updateTxHash = (i: number, value: string) => {
    const next = [...txHashes];
    next[i] = value;
    setTxHashes(next);
  };

  const canCreate = executedBy.trim() && txHashes.every((h) => h.trim());

  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
        Payout Execution
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
        Record the XRPL transaction hashes from the actual payout execution.
        Outputs are pre-filled from the approved proposal.
      </p>

      <FormField label="Executed By">
        <input value={executedBy} onChange={(e) => setExecutedBy(e.target.value)}
          placeholder="Executor name or address" style={inputStyle} />
      </FormField>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>Transaction Hashes</div>
        {txHashes.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={h} placeholder="TX hash..."
              onChange={(e) => updateTxHash(i, e.target.value)}
              style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
            {txHashes.length > 1 && (
              <button onClick={() => setTxHashes(txHashes.filter((_, idx) => idx !== i))} style={removeStyle}>&times;</button>
            )}
          </div>
        ))}
        <button onClick={addTxHash} style={addStyle}>+ Add TX Hash</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
          Executed Outputs (from proposal)
        </div>
        {executedOutputs.map((o, i) => (
          <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "3px 0" }}>
            {o.amount} {o.asset} &rarr; {o.address.slice(0, 12)}... ({o.role})
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <ActionButton
          label={loading ? "Recording\u2026" : "Record Execution"}
          onClick={() => onCreate({ txHashes, executedOutputs, executedBy })}
          disabled={loading || !canCreate}
        />
        <ActionButton label="Load Execution" onClick={onLoad} variant="secondary" />
      </div>
    </ArtifactCard>
  );
}

// ── Execution Card ─────────────────────────────────────────────────

function ExecutionCard({ execution, executionPath }: {
  execution: ReturnType<typeof useRelease>["governance"]["execution"];
  executionPath: string | null;
}) {
  if (!execution) return null;
  return (
    <ArtifactCard>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
        Payout Execution
      </div>
      <ArtifactField label="Executed By" value={execution.executedBy} />
      <ArtifactField label="Executed At" value={execution.executedAt} />
      <ArtifactField label="Chain Verified" value={execution.verification.matchesApprovedProposal ? "Yes" : "No"} />
      {execution.verification.errors.length > 0 && (
        <ArtifactField label="Errors" value={execution.verification.errors.join("; ")} />
      )}
      {execution.executionHash && <ArtifactField label="Execution Hash" value={execution.executionHash} mono />}
      {executionPath && <ArtifactField label="File" value={executionPath} mono />}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
          TX Hashes ({execution.xrpl.txHashes.length})
        </div>
        {execution.xrpl.txHashes.map((h, i) => (
          <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all", marginBottom: 2 }}>
            {h}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
          Executed Outputs ({execution.executedOutputs.length})
        </div>
        {execution.executedOutputs.map((o, i) => (
          <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "3px 0" }}>
            {o.amount} {o.asset} &rarr; {o.address} ({o.role})
          </div>
        ))}
      </div>
    </ArtifactCard>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────

const ROLES: SignerRole[] = ["artist", "producer", "label", "manager", "collaborator", "other"];

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "monospace",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
};

const removeStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "4px 8px",
  fontSize: 14,
};

const addStyle: React.CSSProperties = {
  background: "none",
  border: "1px dashed var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "4px 12px",
  fontSize: 12,
  width: "100%",
};
