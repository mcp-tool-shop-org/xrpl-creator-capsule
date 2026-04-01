/**
 * CLI command: create-governance-policy
 *
 * Builds a governance policy from a manifest + signer list,
 * stamps the policy hash, and writes to disk.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertManifest,
  computeManifestId,
  assertGovernancePolicy,
  stampPolicyHash,
} from "@capsule/core";
import type { GovernancePolicy, GovernanceSigner } from "@capsule/core";

export interface CreateGovernancePolicyOpts {
  manifestPath: string;
  treasuryAddress: string;
  network: "testnet" | "devnet" | "mainnet";
  signers: GovernanceSigner[];
  threshold: number;
  allowedAssets: string[];
  allowPartialPayouts?: boolean;
  maxOutputsPerProposal?: number;
  createdBy: string;
  outputPath: string;
}

export async function createGovernancePolicy(
  opts: CreateGovernancePolicyOpts
): Promise<GovernancePolicy> {
  const manifest = assertManifest(
    JSON.parse(await readFile(opts.manifestPath, "utf-8"))
  );
  const manifestId = computeManifestId(manifest);

  const raw: GovernancePolicy = {
    schemaVersion: "1.0.0",
    kind: "governance-policy",
    manifestId,
    network: opts.network,
    treasuryAddress: opts.treasuryAddress,
    signerPolicy: {
      signers: opts.signers,
      threshold: opts.threshold,
    },
    payoutPolicy: {
      allowedAssets: opts.allowedAssets,
      allowPartialPayouts: opts.allowPartialPayouts ?? false,
      ...(opts.maxOutputsPerProposal != null && {
        maxOutputsPerProposal: opts.maxOutputsPerProposal,
      }),
    },
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy,
  };

  // Validate structural invariants (threshold, uniqueness)
  assertGovernancePolicy(raw);

  const stamped = stampPolicyHash(raw);
  await writeFile(opts.outputPath, JSON.stringify(stamped, null, 2) + "\n");
  return stamped;
}
