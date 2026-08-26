import { Client } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork } from "./network.js";
import { fetchAllAccountNfts } from "./account-nfts.js";

export interface NftInfo {
  nftTokenId: string;
  issuer: string;
  uri: string;
  flags: number;
  transferFee: number;
  taxon: number;
}

/**
 * Read NFT details from the ledger for a given account and token ID.
 */
export async function readNftFromLedger(
  ownerOrIssuer: string,
  nftTokenId: string,
  network: NetworkId
): Promise<NftInfo | null> {
  const config = getNetwork(network);
  const client = new Client(config.url);

  try {
    await client.connect();

    const nfts = await fetchAllAccountNfts(client, ownerOrIssuer);

    const match = nfts.find((n) => n.NFTokenID === nftTokenId);
    if (!match) return null;

    return {
      nftTokenId: match.NFTokenID,
      issuer: match.Issuer,
      uri: match.URI,
      flags: match.Flags,
      transferFee: match.TransferFee,
      taxon: match.NFTokenTaxon,
    };
  } finally {
    await client.disconnect();
  }
}
