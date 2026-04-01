import type { JSONSchemaType } from "ajv";
import type { ReleaseManifest } from "./manifest.js";

/**
 * JSON Schema for the Release Manifest.
 * This is the canonical validation contract — all tooling validates against it.
 */
export const releaseManifestSchema: JSONSchemaType<ReleaseManifest> = {
  type: "object",
  required: [
    "schemaVersion",
    "title",
    "artist",
    "editionSize",
    "coverCid",
    "mediaCid",
    "metadataEndpoint",
    "license",
    "benefit",
    "priceDrops",
    "transferFeePercent",
    "payoutPolicy",
    "issuerAddress",
    "operatorAddress",
    "createdAt",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1.0.0" },
    id: { type: "string", nullable: true },
    title: { type: "string", minLength: 1 },
    artist: { type: "string", minLength: 1 },
    editionSize: { type: "integer", minimum: 1, maximum: 10000 },
    coverCid: { type: "string", minLength: 1 },
    mediaCid: { type: "string", minLength: 1 },
    metadataEndpoint: { type: "string", format: "uri" },
    license: {
      type: "object",
      required: ["type", "summary", "uri"],
      properties: {
        type: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        uri: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    benefit: {
      type: "object",
      required: ["kind", "description", "contentPointer"],
      properties: {
        kind: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        contentPointer: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    priceDrops: { type: "string", pattern: "^[0-9]+$" },
    transferFeePercent: { type: "number", minimum: 0, maximum: 50 },
    payoutPolicy: {
      type: "object",
      required: ["treasuryAddress", "multiSig", "terms"],
      properties: {
        treasuryAddress: { type: "string", minLength: 1 },
        multiSig: { type: "boolean" },
        signers: {
          type: "array",
          items: { type: "string" },
          nullable: true,
        },
        quorum: { type: "integer", minimum: 1, nullable: true },
        terms: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    issuerAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    operatorAddress: { type: "string", pattern: "^r[1-9A-HJ-NP-Za-km-z]{24,34}$" },
    createdAt: { type: "string" },
  },
  additionalProperties: false,
};
