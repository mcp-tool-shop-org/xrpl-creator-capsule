/**
 * CLI command: propose-payout
 *
 * Creates a payout proposal against a governance policy,
 * stamps the proposal hash, and writes to disk.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertGovernancePolicy,
  assertPayoutProposal,
  stampProposalHash,
  checkProposalAgainstPolicy,
} from "@capsule/core";
import type { PayoutProposal, PayoutOutput } from "@capsule/core";

export interface ProposePayoutOpts {
  policyPath: string;
  proposalId: string;
  outputs: PayoutOutput[];
  createdBy: string;
  memo?: string;
  outputPath: string;
}

export async function proposePayout(
  opts: ProposePayoutOpts
): Promise<PayoutProposal> {
  const policy = assertGovernancePolicy(
    JSON.parse(await readFile(opts.policyPath, "utf-8"))
  );

  const raw: PayoutProposal = {
    schemaVersion: "1.0.0",
    kind: "payout-proposal",
    manifestId: policy.manifestId,
    policyHash: policy.policyHash!,
    proposalId: opts.proposalId,
    network: policy.network,
    treasuryAddress: policy.treasuryAddress,
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy,
    outputs: opts.outputs,
    ...(opts.memo && { memo: opts.memo }),
  };

  // Validate structural invariants (positive amounts)
  assertPayoutProposal(raw);

  // Validate against policy (assets, maxOutputs, identity chain)
  const check = checkProposalAgainstPolicy(raw, policy);
  if (!check.valid) {
    throw new Error(
      `Proposal violates policy:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  const stamped = stampProposalHash(raw);
  await writeFile(opts.outputPath, JSON.stringify(stamped, null, 2) + "\n");
  return stamped;
}
