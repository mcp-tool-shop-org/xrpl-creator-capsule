import { Client, convertStringToHex } from "xrpl";
import type { ReleaseManifest } from "@capsule/core";
import type { WalletPair } from "./wallet.js";
import type { NetworkId } from "./network.js";
import { getNetwork, assertMainnetAllowed } from "./network.js";

export interface MintResult {
  /** NFTokenIDs of all minted editions */
  tokenIds: string[];
  /** Transaction hashes for each mint */
  txHashes: string[];
  /** Network the mint occurred on */
  network: NetworkId;
}

/**
 * Build the NFT URI from the manifest's metadata endpoint.
 * XRPL URI field is max 256 bytes, hex-encoded.
 */
function buildTokenUri(manifest: ReleaseManifest): string {
  const uri = manifest.metadataEndpoint;
  if (Buffer.byteLength(uri, "utf8") > 256) {
    throw new Error(
      `Metadata endpoint exceeds 256 bytes: ${Buffer.byteLength(uri, "utf8")} bytes`
    );
  }
  return convertStringToHex(uri);
}

/**
 * Convert a transfer fee percentage (0–50) to XRPL's TransferFee field.
 * XRPL uses units of 1/100,000 (so 1% = 1000, 50% = 50000).
 */
function percentToTransferFee(percent: number): number {
  if (percent < 0 || percent > 50) {
    throw new Error(`TransferFee must be 0–50%, got ${percent}%`);
  }
  return Math.round(percent * 1000);
}

/**
 * Mint all editions for a release.
 *
 * Uses the operator wallet (authorized minter) to mint on behalf of the issuer.
 * Each edition is a separate NFTokenMint transaction.
 */
export async function mintRelease(
  manifest: ReleaseManifest,
  pair: WalletPair,
  network: NetworkId,
  allowMainnetWrite: boolean = false
): Promise<MintResult> {
  assertMainnetAllowed(network, allowMainnetWrite);

  if (manifest.issuerAddress !== pair.issuer.address) {
    throw new Error(
      `Manifest issuerAddress (${manifest.issuerAddress}) does not match wallet issuer (${pair.issuer.address})`
    );
  }
  if (manifest.operatorAddress !== pair.operator.address) {
    throw new Error(
      `Manifest operatorAddress (${manifest.operatorAddress}) does not match wallet operator (${pair.operator.address})`
    );
  }

  const config = getNetwork(network);
  const client = new Client(config.url);
  const uri = buildTokenUri(manifest);
  const transferFee = percentToTransferFee(manifest.transferFeePercent);

  const tokenIds: string[] = [];
  const txHashes: string[] = [];

  try {
    await client.connect();

    for (let i = 0; i < manifest.editionSize; i++) {
      const tx = await client.submitAndWait(
        {
          TransactionType: "NFTokenMint",
          Account: pair.operator.address,
          Issuer: pair.issuer.address,
          URI: uri,
          // tfTransferable (0x00000008) — required for secondary sales
          Flags: 0x00000008,
          TransferFee: transferFee,
          NFTokenTaxon: 0,
        },
        { wallet: pair.operator }
      );

      const meta = tx.result.meta;
      if (typeof meta !== "object" || meta === null) {
        throw new Error(`Mint ${i + 1}/${manifest.editionSize}: no transaction metadata`);
      }

      const metaObj = meta as Record<string, unknown>;
      if (metaObj.TransactionResult !== "tesSUCCESS") {
        throw new Error(
          `Mint ${i + 1}/${manifest.editionSize} failed: ${metaObj.TransactionResult}`
        );
      }

      // Extract NFTokenID from affected nodes
      const nftId = extractNFTokenId(meta);
      if (!nftId) {
        throw new Error(`Mint ${i + 1}/${manifest.editionSize}: could not extract NFTokenID`);
      }

      tokenIds.push(nftId);
      txHashes.push(tx.result.hash);
    }

    return { tokenIds, txHashes, network };
  } finally {
    await client.disconnect();
  }
}

/**
 * Extract the newly minted NFTokenID from transaction metadata.
 */
function extractNFTokenId(meta: unknown): string | undefined {
  const metaObj = meta as {
    AffectedNodes?: Array<{
      ModifiedNode?: { FinalFields?: { NFTokens?: Array<{ NFToken: { NFTokenID: string } }> }; PreviousFields?: { NFTokens?: Array<{ NFToken: { NFTokenID: string } }> } };
      CreatedNode?: { NewFields?: { NFTokens?: Array<{ NFToken: { NFTokenID: string } }> } };
    }>;
  };

  if (!metaObj.AffectedNodes) return undefined;

  for (const node of metaObj.AffectedNodes) {
    // Check ModifiedNode — existing NFTokenPage was updated
    if (node.ModifiedNode?.FinalFields?.NFTokens) {
      const finalTokens = new Set(
        node.ModifiedNode.FinalFields.NFTokens.map(
          (t) => t.NFToken.NFTokenID
        )
      );
      const prevTokens = new Set(
        (node.ModifiedNode.PreviousFields?.NFTokens ?? []).map(
          (t) => t.NFToken.NFTokenID
        )
      );
      for (const id of finalTokens) {
        if (!prevTokens.has(id)) return id;
      }
    }

    // Check CreatedNode — new NFTokenPage was created
    if (node.CreatedNode?.NewFields?.NFTokens) {
      const tokens = node.CreatedNode.NewFields.NFTokens;
      if (tokens.length > 0) {
        return tokens[tokens.length - 1].NFToken.NFTokenID;
      }
    }
  }

  return undefined;
}
