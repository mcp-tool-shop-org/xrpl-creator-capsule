import type { JSONSchemaType } from "ajv";
import type { PayoutDecisionReceipt } from "./payout-decision.js";

export const payoutDecisionReceiptSchema: JSONSchemaType<PayoutDecisionReceipt> = {
  type: "object",
  required: [
    "schemaVersion", "kind", "manifestId", "policyHash", "proposalId",
    "proposalHash", "network", "treasuryAddress", "approvals", "decision",
    "decidedAt", "decidedBy",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "payout-decision-receipt" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    policyHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    proposalId: { type: "string", minLength: 1 },
    proposalHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    network: { type: "string", enum: ["testnet", "devnet", "mainnet"] },
    treasuryAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    approvals: {
      type: "array",
      items: {
        type: "object",
        required: ["signerAddress", "approved", "decidedAt"],
        properties: {
          signerAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
          approved: { type: "boolean" },
          decidedAt: { type: "string" },
          note: { type: "string", nullable: true },
        },
        additionalProperties: false,
      },
    },
    decision: {
      type: "object",
      required: ["outcome", "thresholdMet", "approvedCount", "rejectedCount"],
      properties: {
        outcome: { type: "string", enum: ["approved", "rejected"] },
        thresholdMet: { type: "boolean" },
        approvedCount: { type: "integer", minimum: 0 },
        rejectedCount: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    decidedAt: { type: "string" },
    decidedBy: { type: "string", minLength: 1 },
    decisionHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
  },
  additionalProperties: false,
};
