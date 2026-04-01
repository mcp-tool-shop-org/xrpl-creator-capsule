/**
 * Payload builders — create Xaman sign requests from Capsule's
 * manifest-derived transaction templates.
 *
 * These produce incomplete XRPL tx JSON that Xaman fills
 * (Account, Fee, Sequence) for the signing user.
 */

import { type ReleaseManifest } from "@capsule/core";
import type { XamanPayloadRequest, XamanNetwork } from "./types.js";

/**
 * Build a configure-minter payload.
 *
 * The issuer signs this in Xaman to authorize the operator
 * as their NFT minter.
 */
export function buildConfigureMinterPayload(
  operatorAddress: string,
  network: XamanNetwork,
  returnUrl?: string
): XamanPayloadRequest {
  return {
    kind: "configure-minter",
    txjson: {
      TransactionType: "AccountSet",
      NFTokenMinter: operatorAddress,
    },
    network,
    returnUrl,
    metadata: {
      capsuleAction: "configure-minter",
      operatorAddress,
    },
  };
}

/**
 * Build a mint-release payload for a single edition.
 *
 * The operator signs this in Xaman. The Issuer field references
 * the cold issuer account.
 *
 * For multi-edition mints, call this once per edition and present
 * each payload sequentially.
 */
export function buildMintPayload(
  manifest: ReleaseManifest,
  network: XamanNetwork,
  returnUrl?: string
): XamanPayloadRequest {
  const uri = Buffer.from(manifest.metadataEndpoint, "utf-8").toString("hex").toUpperCase();

  if (Buffer.byteLength(manifest.metadataEndpoint, "utf8") > 256) {
    throw new Error(
      `Metadata endpoint exceeds 256 bytes: ${Buffer.byteLength(manifest.metadataEndpoint, "utf8")} bytes`
    );
  }

  const transferFee = Math.round(manifest.transferFeePercent * 1000);

  return {
    kind: "mint-release",
    txjson: {
      TransactionType: "NFTokenMint",
      Issuer: manifest.issuerAddress,
      URI: uri,
      Flags: 0x00000008, // tfTransferable
      TransferFee: transferFee,
      NFTokenTaxon: 0,
    },
    network,
    returnUrl,
    metadata: {
      capsuleAction: "mint-release",
      releaseTitle: manifest.title,
      releaseArtist: manifest.artist,
      manifestIssuer: manifest.issuerAddress,
    },
  };
}

/**
 * Build a buy-release payload.
 *
 * The buyer signs this in Xaman to accept an NFT sell offer.
 */
export function buildBuyPayload(
  sellOfferId: string,
  network: XamanNetwork,
  returnUrl?: string
): XamanPayloadRequest {
  return {
    kind: "buy-release",
    txjson: {
      TransactionType: "NFTokenAcceptOffer",
      NFTokenSellOffer: sellOfferId,
    },
    network,
    returnUrl,
    metadata: {
      capsuleAction: "buy-release",
      sellOfferId,
    },
  };
}
