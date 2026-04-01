import { PanelShell, ArtifactCard, ArtifactField, ActionButton } from "./PanelShell";
import { useRelease } from "../../state/release";

export function GovernancePanel() {
  const { manifest, governancePolicy, payoutProposal, payoutDecision, payoutExecution } = useRelease();

  if (!manifest) {
    return (
      <PanelShell title="Governance" status="empty">
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Load a manifest first. The governance panel manages treasury policies,
            payout proposals, and the approval chain.
          </p>
        </ArtifactCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Governance" status={governancePolicy ? "loaded" : "empty"}>
      {!governancePolicy ? (
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
            No governance policy found. Create one to define treasury rules and signers.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton label="Create Policy" onClick={() => {}} />
            <ActionButton label="Load Policy" onClick={() => {}} variant="secondary" />
          </div>
        </ArtifactCard>
      ) : (
        <>
          <ArtifactCard>
            <ArtifactField label="Treasury" value={governancePolicy.treasuryAddress ?? ""} mono />
            <ArtifactField label="Network" value={governancePolicy.network ?? ""} />
            <ArtifactField label="Threshold" value={
              `${governancePolicy.signerPolicy?.threshold ?? "—"} of ${governancePolicy.signerPolicy?.signers?.length ?? "—"}`
            } />
            <ArtifactField label="Allowed Assets" value={governancePolicy.payoutPolicy?.allowedAssets?.join(", ") ?? ""} />
            <ArtifactField label="Policy Hash" value={governancePolicy.policyHash ?? ""} mono />
          </ArtifactCard>

          {governancePolicy.signerPolicy?.signers?.map((signer: { address: string; role: string; label?: string }, i: number) => (
            <ArtifactCard key={signer.address}>
              <ArtifactField label={`Signer ${i + 1}`} value={signer.label ?? signer.role} />
              <ArtifactField label="Address" value={signer.address} mono />
              <ArtifactField label="Role" value={signer.role} />
            </ArtifactCard>
          ))}
        </>
      )}

      {payoutProposal && (
        <ArtifactCard>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 10 }}>
            Proposal: {payoutProposal.proposalId}
          </div>
          <ArtifactField label="Outputs" value={String(payoutProposal.outputs?.length ?? 0)} />
          <ArtifactField label="Memo" value={payoutProposal.memo ?? "—"} />
          <ArtifactField label="Proposal Hash" value={payoutProposal.proposalHash ?? ""} mono />
        </ArtifactCard>
      )}

      {payoutDecision && (
        <ArtifactCard>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: payoutDecision.decision?.outcome === "approved" ? "var(--success)" : "var(--error)",
              marginBottom: 10,
            }}
          >
            Decision: {payoutDecision.decision?.outcome?.toUpperCase()}
          </div>
          <ArtifactField label="Threshold Met" value={String(payoutDecision.decision?.thresholdMet)} />
          <ArtifactField
            label="Votes"
            value={`${payoutDecision.decision?.approvedCount} approved, ${payoutDecision.decision?.rejectedCount} rejected`}
          />
          <ArtifactField label="Decision Hash" value={payoutDecision.decisionHash ?? ""} mono />
        </ArtifactCard>
      )}

      {payoutExecution && (
        <ArtifactCard>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--success)", marginBottom: 10 }}>
            Execution Complete
          </div>
          <ArtifactField label="TX Hashes" value={String(payoutExecution.xrpl?.txHashes?.length ?? 0)} />
          <ArtifactField label="Outputs Executed" value={String(payoutExecution.executedOutputs?.length ?? 0)} />
          <ArtifactField label="Matches Proposal" value={String(payoutExecution.verification?.matchesApprovedProposal)} />
          <ArtifactField label="Execution Hash" value={payoutExecution.executionHash ?? ""} mono />
        </ArtifactCard>
      )}
    </PanelShell>
  );
}
