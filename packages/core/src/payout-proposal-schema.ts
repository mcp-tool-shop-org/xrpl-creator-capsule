import type { JSONSchemaType } from "ajv";
import type { PayoutProposal } from "./payout-proposal.js";

export const payoutProposalSchema: JSONSchemaType<PayoutProposal> = {
  type: "object",
  required: [
    "schemaVersion", "kind", "manifestId", "policyHash", "proposalId",
    "network", "treasuryAddress", "createdAt", "createdBy", "outputs",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "payout-proposal" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    policyHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    proposalId: { type: "string", minLength: 1 },
    network: { type: "string", enum: ["testnet", "devnet", "mainnet"] },
    treasuryAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    createdAt: { type: "string" },
    createdBy: { type: "string", minLength: 1 },
    memo: { type: "string", nullable: true },
    outputs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["address", "amount", "asset", "role", "reason"],
        properties: {
          address: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
          amount: { type: "string", pattern: "^[0-9]+(\\.[0-9]+)?$" },
          asset: { type: "string", minLength: 1 },
          role: { type: "string", enum: ["artist", "producer", "label", "manager", "collaborator", "other"] },
          reason: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
    proposalHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
  },
  additionalProperties: false,
};
