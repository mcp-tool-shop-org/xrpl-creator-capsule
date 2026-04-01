import { useState, useCallback } from "react";
import { useStudio } from "../../state/studio";
import { useRelease } from "../../state/release";
import { ArtifactCard, ActionButton, ErrorBanner, CheckRow } from "../panels/PanelShell";

export function TestAccessPage() {
  const { draft, setActiveStep } = useStudio();
  const release = useRelease();
  const { mint, access } = release;

  const [walletAddress, setWalletAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Need a minted release to test
  if (!mint.receipt) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Test Collector Experience</h2>
        <ArtifactCard>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Publish your release first. Once it's live, you can test what
            collectors see when they try to access your content.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionButton label="\u2190 Go to Publish" onClick={() => setActiveStep("publish")} variant="secondary" />
          </div>
        </ArtifactCard>
      </div>
    );
  }

  const handleTestAsCollector = useCallback(async () => {
    if (!walletAddress.trim() || !release.manifest.path || !mint.receiptPath) return;

    try {
      setTesting(true);
      setError(null);

      // Create access policy if needed
      if (!access.policyPath) {
        await release.createPolicy();
      }

      // Wait for policy to be set, then grant
      release.setWalletAddress(walletAddress);
      await release.runGrantAccess();
      setTesting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTesting(false);
    }
  }, [walletAddress, release, mint.receiptPath, access.policyPath]);

  const handleTestAsNonCollector = useCallback(async () => {
    if (!release.manifest.path || !mint.receiptPath) return;

    try {
      setTesting(true);
      setError(null);
      release.setWalletAddress("rNonCollectorTestAddress1234567890");
      await release.runGrantAccess();
      setTesting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTesting(false);
    }
  }, [release, mint.receiptPath]);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        Test Collector Experience
      </h2>

      {error && <ErrorBanner message={error} />}

      <ArtifactCard>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          What happens when someone tries to access your release?
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          Test with a real wallet address to see if they'd be granted access,
          or test with a non-collector address to see the denial flow.
        </p>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Wallet address to test
          </div>
          <input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="rWalletAddress..."
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: "monospace",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <ActionButton
            label={testing ? "Testing..." : "Test as Collector"}
            onClick={handleTestAsCollector}
            disabled={testing || !walletAddress.trim()}
          />
          <ActionButton
            label="Test as Non-Collector"
            onClick={handleTestAsNonCollector}
            variant="secondary"
            disabled={testing}
          />
        </div>
        {testing && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
            Checking token ownership on the XRPL network. This verifies whether the wallet
            holds any of the NFTs minted for this release.
          </div>
        )}
      </ArtifactCard>

      {/* Grant result */}
      {access.grant && (
        <ArtifactCard>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
              color: access.grant.decision === "allow" ? "var(--success)" : "var(--error)",
            }}
          >
            {access.grant.decision === "allow" ? "ACCESS GRANTED" : "ACCESS DENIED"}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>Wallet</div>
            <div style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text)" }}>
              {access.grant.subjectAddress}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>Reason</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {access.grant.reason}
            </div>
          </div>

          {access.grant.decision === "allow" && (
            <div style={{ padding: 12, background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                What this collector receives
              </div>
              <div style={{ fontSize: 13, color: "var(--text)" }}>
                {access.grant.benefit.kind}: {draft.benefitDescription || access.grant.benefit.contentPointer}
              </div>
              {access.grant.delivery && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
                  Download token expires: {new Date(access.grant.delivery.expiresAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {access.grant.decision === "deny" && (
            <div style={{ padding: 12, background: "var(--error)" + "10", borderRadius: 6, border: "1px solid var(--error)" + "40" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                This wallet does not hold any of the NFTs minted for this release.
                Only collectors who own one of the {mint.receipt.xrpl.nftTokenIds.length} minted
                editions can access the content.
              </div>
            </div>
          )}
        </ArtifactCard>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <ActionButton label="\u2190 Back to Publish" onClick={() => setActiveStep("publish")} variant="secondary" />
        <ActionButton
          label="Recovery & Safety \u2192"
          onClick={() => setActiveStep("recovery")}
          variant="secondary"
        />
      </div>
    </div>
  );
}
