/**
 * Holder Check — verify that a wallet owns a qualifying NFT
 * from a specific release.
 *
 * This is the ownership truth for access gating.
 */

import { Client } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork } from "./network.js";

export interface HolderCheckResult {
  /** Whether the wallet holds at least one qualifying NFT */
  holds: boolean;
  /** Qualifying token IDs found on the wallet */
  matchedTokenIds: string[];
  /** Total NFTs checked on the account */
  totalNftsChecked: number;
  /** Wallet address checked */
  walletAddress: string;
  /** Error if the check could not be performed */
  error?: string;
}

/**
 * Check whether a wallet holds any of the qualifying NFTs.
 *
 * Queries the XRPL ledger for all NFTs on the wallet, then
 * intersects with the qualifying set.
 */
export async function checkHolder(
  walletAddress: string,
  qualifyingTokenIds: string[],
  network: NetworkId
): Promise<HolderCheckResult> {
  const config = getNetwork(network);
  const client = new Client(config.url);

  try {
    await client.connect();

    const response = await client.request({
      command: "account_nfts",
      account: walletAddress,
      ledger_index: "validated",
    });

    const nfts = response.result.account_nfts as Array<{
      NFTokenID: string;
    }>;

    const qualifyingSet = new Set(qualifyingTokenIds);
    const matchedTokenIds = nfts
      .filter((n) => qualifyingSet.has(n.NFTokenID))
      .map((n) => n.NFTokenID);

    return {
      holds: matchedTokenIds.length > 0,
      matchedTokenIds,
      totalNftsChecked: nfts.length,
      walletAddress,
    };
  } catch (err) {
    // Distinguish account-not-found from real errors
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("actNotFound")) {
      return {
        holds: false,
        matchedTokenIds: [],
        totalNftsChecked: 0,
        walletAddress,
        error: "Account not found on ledger",
      };
    }
    return {
      holds: false,
      matchedTokenIds: [],
      totalNftsChecked: 0,
      walletAddress,
      error: `Ledger query failed: ${message}`,
    };
  } finally {
    await client.disconnect();
  }
}
