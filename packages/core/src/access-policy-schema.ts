import type { JSONSchemaType } from "ajv";
import type { AccessPolicy } from "./access-policy.js";

export const accessPolicySchema: JSONSchemaType<AccessPolicy> = {
  type: "object",
  required: [
    "schemaVersion",
    "kind",
    "manifestId",
    "label",
    "benefit",
    "rule",
    "delivery",
    "createdAt",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    kind: { type: "string", const: "access-policy" },
    manifestId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    label: { type: "string", minLength: 1 },
    benefit: {
      type: "object",
      required: ["kind", "contentPointer"],
      properties: {
        kind: { type: "string", minLength: 1 },
        contentPointer: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    rule: {
      type: "object",
      required: ["type", "issuerAddress", "qualifyingTokenIds"],
      properties: {
        type: { type: "string", const: "holds-nft" },
        issuerAddress: {
          type: "string",
          pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$",
        },
        qualifyingTokenIds: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
      },
      additionalProperties: false,
    },
    delivery: {
      type: "object",
      required: ["mode", "ttlSeconds"],
      properties: {
        mode: { type: "string", const: "download-token" },
        ttlSeconds: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    createdAt: { type: "string" },
  },
  additionalProperties: false,
};
