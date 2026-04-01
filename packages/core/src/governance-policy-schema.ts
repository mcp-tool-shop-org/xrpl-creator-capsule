import type { JSONSchemaType } from "ajv";
import type { GovernancePolicy } from "./governance-policy.js";

export const governancePolicySchema: JSONSchemaType<GovernancePolicy> = {
  type: "object",
  required: [
    "schemaVersion", "kind", "manifestId", "network",
    "treasuryAddress", "signerPolicy", "payoutPolicy",
    "createdAt", "createdBy",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "governance-policy" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    network: { type: "string", enum: ["testnet", "devnet", "mainnet"] },
    treasuryAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    signerPolicy: {
      type: "object",
      required: ["signers", "threshold"],
      properties: {
        signers: {
          type: "array",
          items: {
            type: "object",
            required: ["address", "role"],
            properties: {
              address: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
              role: { type: "string", enum: ["artist", "producer", "label", "manager", "collaborator", "other"] },
              label: { type: "string", nullable: true },
            },
            additionalProperties: false,
          },
          minItems: 1,
        },
        threshold: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    payoutPolicy: {
      type: "object",
      required: ["allowedAssets", "allowPartialPayouts"],
      properties: {
        allowedAssets: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
        allowPartialPayouts: { type: "boolean" },
        maxOutputsPerProposal: { type: "integer", minimum: 1, nullable: true },
        notes: { type: "string", nullable: true },
      },
      additionalProperties: false,
    },
    createdAt: { type: "string" },
    createdBy: { type: "string", minLength: 1 },
    policyHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
  },
  additionalProperties: false,
};
