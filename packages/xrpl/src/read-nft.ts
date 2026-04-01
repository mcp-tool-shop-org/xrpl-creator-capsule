import { Client } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork } from "./network.js";

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

    const response = await client.request({
      command: "account_nfts",
      account: ownerOrIssuer,
      ledger_index: "validated",
    });

    const nfts = response.result.account_nfts as Array<{
      NFTokenID: string;
      Issuer: string;
      URI: string;
      Flags: number;
      TransferFee: number;
      NFTokenTaxon: number;
    }>;

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
