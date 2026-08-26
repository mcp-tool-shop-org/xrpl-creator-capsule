/**
 * CLI command: verify-payout
 *
 * Loads all 4 governance artifacts, recomputes every hash,
 * and runs every cross-contract check. Reports pass/fail.
 */

import { readFile } from "node:fs/promises";
import { Client } from "xrpl";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  assertPayoutDecision,
  assertPayoutExecution,
  computePolicyHash,
  computeProposalHash,
  computeDecisionHash,
  computeExecutionHash,
  checkProposalAgainstPolicy,
  checkDecisionAgainstProposal,
  checkExecutionAgainstDecision,
  type ExecutedPayoutOutput,
} from "@capsule/core";
import { getNetwork } from "@capsule/xrpl";

export interface VerifyPayoutOpts {
  policyPath: string;
  proposalPath: string;
  decisionPath: string;
  executionPath: string;
}

interface VerifyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyPayoutResult {
  passed: boolean;
  checks: VerifyCheck[];
}

/** What we need from a "tx" ledger lookup to verify a claimed payout. */
interface ChainTxLookup {
  validated: boolean;
  transactionResult?: string;
  transactionType?: string;
  destination?: string;
  /** Amount actually delivered — see paymentMatchesOutput doc comment for why this, not Amount. */
  deliveredAmount?: string | { currency: string; issuer?: string; value: string };
}

/**
 * Query the ledger for one transaction hash.
 *
 * Uses the "xrpl" npm client directly rather than a @capsule/xrpl helper —
 * see the Chain Verification comment in verifyPayout for why. Reads the
 * default (API version 2) response shape: the transaction fields live under
 * result.tx_json, with result.meta/result.validated alongside.
 */
async function lookupTransaction(client: Client, hash: string): Promise<ChainTxLookup> {
  const response = await client.request({ command: "tx", transaction: hash });
  const result = response.result as unknown as {
    validated?: boolean;
    meta?: string | {
      TransactionResult?: string;
      delivered_amount?: string | { currency: string; issuer?: string; value: string };
      DeliveredAmount?: string | { currency: string; issuer?: string; value: string };
    };
    tx_json?: {
      TransactionType?: string;
      Destination?: string;
    };
  };

  const meta = typeof result.meta === "object" && result.meta !== null ? result.meta : undefined;

  return {
    validated: result.validated === true,
    transactionResult: meta?.TransactionResult,
    transactionType: result.tx_json?.TransactionType,
    destination: result.tx_json?.Destination,
    deliveredAmount: meta?.delivered_amount ?? meta?.DeliveredAmount,
  };
}

/**
 * Does the on-chain payment actually match what the execution receipt
 * claims it paid?
 *
 * ExecutedPayoutOutput.amount is documented (see PayoutOutput in
 * @capsule/core) as "Amount in drops for XRP, or decimal string for
 * tokens" — i.e. already in the same units XRPL uses on the wire for XRP,
 * so no drops<->XRP conversion happens here. For an issued-currency
 * ("asset" other than "XRP") payout, delivered_amount is the
 * {currency, issuer, value} object and .value is compared the same way.
 */
function paymentMatchesOutput(tx: ChainTxLookup, output: ExecutedPayoutOutput): boolean {
  if (tx.transactionType !== "Payment") return false;
  if (tx.destination !== output.address) return false;

  const delivered = tx.deliveredAmount;
  if (delivered === undefined) return false;

  if (output.asset === "XRP") {
    return typeof delivered === "string" && delivered === output.amount;
  }

  return typeof delivered === "object" && delivered.value === output.amount;
}

export async function verifyPayout(
  opts: VerifyPayoutOpts
): Promise<VerifyPayoutResult> {
  const checks: VerifyCheck[] = [];

  // Load + schema-validate all 4 artifacts
  const policy = assertGovernancePolicy(
    JSON.parse(await readFile(opts.policyPath, "utf-8"))
  );
  checks.push({ name: "Policy schema", passed: true, detail: "Valid GovernancePolicy" });

  const proposal = assertPayoutProposal(
    JSON.parse(await readFile(opts.proposalPath, "utf-8"))
  );
  checks.push({ name: "Proposal schema", passed: true, detail: "Valid PayoutProposal" });

  const decision = assertPayoutDecision(
    JSON.parse(await readFile(opts.decisionPath, "utf-8"))
  );
  checks.push({ name: "Decision schema", passed: true, detail: "Valid PayoutDecisionReceipt" });

  const execution = assertPayoutExecution(
    JSON.parse(await readFile(opts.executionPath, "utf-8"))
  );
  checks.push({ name: "Execution schema", passed: true, detail: "Valid PayoutExecutionReceipt" });

  // Hash integrity
  const policyHashOk = policy.policyHash === computePolicyHash(policy);
  checks.push({
    name: "Policy hash",
    passed: policyHashOk,
    detail: policyHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const proposalHashOk = proposal.proposalHash === computeProposalHash(proposal);
  checks.push({
    name: "Proposal hash",
    passed: proposalHashOk,
    detail: proposalHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const decisionHashOk = decision.decisionHash === computeDecisionHash(decision);
  checks.push({
    name: "Decision hash",
    passed: decisionHashOk,
    detail: decisionHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  const executionHashOk = execution.executionHash === computeExecutionHash(execution);
  checks.push({
    name: "Execution hash",
    passed: executionHashOk,
    detail: executionHashOk ? "Matches recomputed hash" : "TAMPERED — hash mismatch",
  });

  // Cross-contract checks
  const proposalVsPolicy = checkProposalAgainstPolicy(proposal, policy);
  checks.push({
    name: "Proposal ↔ Policy",
    passed: proposalVsPolicy.valid,
    detail: proposalVsPolicy.valid
      ? "Consistent"
      : proposalVsPolicy.errors.join("; "),
  });

  const decisionVsProposal = checkDecisionAgainstProposal(decision, proposal, policy);
  checks.push({
    name: "Decision ↔ Proposal",
    passed: decisionVsProposal.valid,
    detail: decisionVsProposal.valid
      ? "Consistent"
      : decisionVsProposal.errors.join("; "),
  });

  const executionVsDecision = checkExecutionAgainstDecision(
    execution, decision, proposal, policy
  );
  checks.push({
    name: "Execution ↔ Decision",
    passed: executionVsDecision.valid,
    detail: executionVsDecision.valid
      ? "Consistent"
      : executionVsDecision.errors.join("; "),
  });

  // Outcome check
  const outcomeOk = decision.decision.outcome === "approved";
  checks.push({
    name: "Decision outcome",
    passed: outcomeOk,
    detail: outcomeOk ? "Approved" : `Outcome: ${decision.decision.outcome}`,
  });

  // ── Chain Verification ────────────────────────────────────────────
  //
  // F-7ebc796c: every check above compares the 4 local governance-chain
  // JSON files against each other's own self-reported hashes. None of them
  // ever asks the XRPL ledger whether the claimed payout actually happened,
  // so a PayoutExecutionReceipt with fabricated (or failed, or
  // wrongly-addressed) txHashes verified identically to a receipt backed by
  // a real payment. This section closes that gap by querying each claimed
  // transaction hash on-ledger — mirroring the "Chain Verification" section
  // in verify-release.ts — and confirming it is validated, succeeded
  // (tesSUCCESS), and actually paid the claimed recipient the claimed
  // amount. It uses the raw "xrpl" client directly (already a direct
  // dependency of this package, exactly like verify-release.ts's own
  // `convertStringToHex` import from "xrpl") rather than adding a new
  // exported helper to @capsule/xrpl, since that package is outside this
  // agent's owned domain (packages/cli/**).
  //
  // meta.delivered_amount (falling back to meta.DeliveredAmount) is used
  // instead of the transaction's requested Amount field: a tfPartialPayment
  // transaction can report tesSUCCESS while delivering less than Amount
  // states, so trusting Amount alone would let an under-paid transaction
  // verify as a full payout.
  try {
    const config = getNetwork(execution.network);
    const client = new Client(config.url);

    try {
      await client.connect();

      const txHashes = execution.xrpl.txHashes;
      const outputs = execution.executedOutputs;
      const pairCount = Math.min(txHashes.length, outputs.length);

      if (txHashes.length !== outputs.length) {
        checks.push({
          name: "chain-tx-output-count",
          passed: false,
          detail:
            `${txHashes.length} tx hash(es) but ${outputs.length} executed output(s) — ` +
            `cannot pair every on-chain payment to its claimed recipient`,
        });
      }

      let validatedCount = 0;
      let successCount = 0;
      let paymentMismatches = 0;
      const unconfirmedHashes: string[] = [];

      for (let i = 0; i < pairCount; i++) {
        const hash = txHashes[i];
        const output = outputs[i];

        let txResult: ChainTxLookup | undefined;
        try {
          txResult = await lookupTransaction(client, hash);
        } catch {
          unconfirmedHashes.push(hash);
          continue;
        }

        if (!txResult.validated) {
          unconfirmedHashes.push(hash);
          continue;
        }
        validatedCount++;

        if (txResult.transactionResult !== "tesSUCCESS") {
          unconfirmedHashes.push(hash);
          continue;
        }
        successCount++;

        if (!paymentMatchesOutput(txResult, output)) {
          paymentMismatches++;
        }
      }

      checks.push({
        name: "chain-tx-validated",
        passed: pairCount > 0 && unconfirmedHashes.length === 0 && validatedCount === pairCount,
        detail:
          pairCount > 0 && validatedCount === pairCount
            ? `${validatedCount}/${pairCount} transaction(s) confirmed validated on ledger`
            : `${pairCount - validatedCount} of ${pairCount} transaction(s) could not be confirmed validated ` +
              `on ledger: ${unconfirmedHashes.join(", ") || "none checked"}`,
      });

      checks.push({
        name: "chain-tx-success",
        passed: pairCount > 0 && successCount === pairCount,
        detail:
          pairCount > 0 && successCount === pairCount
            ? `${successCount}/${pairCount} transaction(s) succeeded on-ledger (tesSUCCESS)`
            : `${pairCount - successCount} of ${pairCount} transaction(s) did not confirm as tesSUCCESS`,
      });

      checks.push({
        name: "chain-tx-payment-match",
        passed: pairCount > 0 && successCount === pairCount && paymentMismatches === 0,
        detail:
          pairCount > 0 && successCount === pairCount && paymentMismatches === 0
            ? `On-chain destination and delivered amount match all ${pairCount} claimed output(s)`
            : `${paymentMismatches} mismatch(es) between on-chain payment and claimed executedOutputs ` +
              `(or a prerequisite check above failed)`,
      });
    } finally {
      await client.disconnect();
    }
  } catch (err) {
    checks.push({
      name: "chain-connectivity",
      passed: false,
      detail: `Could not connect to ${execution.network}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}
