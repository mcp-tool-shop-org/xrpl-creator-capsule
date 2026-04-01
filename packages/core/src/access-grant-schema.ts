import type { JSONSchemaType } from "ajv";
import type { AccessGrantReceipt } from "./access-grant.js";

export const accessGrantReceiptSchema: JSONSchemaType<AccessGrantReceipt> = {
  type: "object",
  required: [
    "schemaVersion",
    "kind",
    "manifestId",
    "policyLabel",
    "subjectAddress",
    "network",
    "decision",
    "reason",
    "benefit",
    "ownership",
    "decidedAt",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "access-grant-receipt" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    policyLabel: { type: "string", minLength: 1 },
    subjectAddress: {
      type: "string",
      pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$",
    },
    network: { type: "string", enum: ["testnet", "devnet", "mainnet"] },
    decision: { type: "string", enum: ["allow", "deny"] },
    reason: { type: "string", minLength: 1 },
    benefit: {
      type: "object",
      required: ["kind", "contentPointer"],
      properties: {
        kind: { type: "string", minLength: 1 },
        contentPointer: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    ownership: {
      type: "object",
      required: ["matchedTokenIds", "totalNftsChecked"],
      properties: {
        matchedTokenIds: {
          type: "array",
          items: { type: "string" },
        },
        totalNftsChecked: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    delivery: {
      type: "object",
      nullable: true,
      required: ["mode", "token", "expiresAt"],
      properties: {
        mode: { type: "string", minLength: 1 },
        token: { type: "string", minLength: 1 },
        expiresAt: { type: "string" },
      },
      additionalProperties: false,
    },
    decidedAt: { type: "string" },
    grantHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
  },
  additionalProperties: false,
};
