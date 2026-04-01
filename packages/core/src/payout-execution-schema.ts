import type { JSONSchemaType } from "ajv";
import type { PayoutExecutionReceipt } from "./payout-execution.js";

export const payoutExecutionReceiptSchema: JSONSchemaType<PayoutExecutionReceipt> = {
  type: "object",
  required: [
    "schemaVersion", "kind", "manifestId", "policyHash", "proposalId",
    "proposalHash", "decisionHash", "network", "treasuryAddress",
    "executedAt", "executedBy", "xrpl", "executedOutputs", "verification",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "payout-execution-receipt" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    policyHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    proposalId: { type: "string", minLength: 1 },
    proposalHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    decisionHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    network: { type: "string", enum: ["testnet", "devnet", "mainnet"] },
    treasuryAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    executedAt: { type: "string" },
    executedBy: { type: "string", minLength: 1 },
    xrpl: {
      type: "object",
      required: ["txHashes"],
      properties: {
        txHashes: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
        ledgerIndexes: { type: "array", items: { type: "integer" }, nullable: true },
      },
      additionalProperties: false,
    },
    executedOutputs: {
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
    verification: {
      type: "object",
      required: ["matchesApprovedProposal", "errors", "warnings"],
      properties: {
        matchesApprovedProposal: { type: "boolean" },
        errors: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    executionHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
  },
  additionalProperties: false,
};
