import { Client } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork } from "./network.js";
import { fetchAllAccountNfts, type AccountNftEntry } from "./account-nfts.js";

export interface NftInfo {
  nftTokenId: string;
  issuer: string;
  uri: string;
  flags: number;
  transferFee: number;
  taxon: number;
}

/**
 * Thrown by readNftFromLedger when the ledger read fails for a reason
 * OTHER than the queried account simply not existing (actNotFound, which
 * resolves to `null` instead — see readNftFromLedger). Distinguishes a real
 * transport/ledger problem from an ordinary "no such NFT here" result, so
 * callers (verify-release.ts, recover-release.ts — which call this
 * per-edition in a loop) can tell a genuine outage apart from a normal
 * not-found instead of both looking like the same unidentified exception.
 */
export class LedgerReadError extends Error {
  readonly ownerOrIssuer: string;
  readonly nftTokenId: string;

  constructor(
    message: string,
    info: { ownerOrIssuer: string; nftTokenId: string },
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LedgerReadError";
    this.ownerOrIssuer = info.ownerOrIssuer;
    this.nftTokenId = info.nftTokenId;
  }
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

    // F-b8314c10: fetchAllAccountNfts previously had no catch at all — only
    // the outer try/finally that disconnects. Any ledger/network error
    // (including actNotFound for an account that doesn't exist yet) crashed
    // with a raw xrpl.js exception instead of resolving cleanly. Mirror
    // check-holder.ts's actNotFound handling: actNotFound resolves to null
    // (this function's existing, already-understood "not found" contract —
    // callers already treat null as "keep checking the next
    // candidate/edition"). Any other failure still throws (fail loud, not
    // open or silently-wrong) but as this clean, named LedgerReadError
    // instead of an unidentified raw exception, so the two cases stay
    // distinguishable.
    let nfts: AccountNftEntry[];
    try {
      nfts = await fetchAllAccountNfts(client, ownerOrIssuer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("actNotFound")) {
        return null;
      }
      throw new LedgerReadError(
        `Ledger query failed while reading NFT ${nftTokenId} for ${ownerOrIssuer}: ${message}`,
        { ownerOrIssuer, nftTokenId },
        { cause: err }
      );
    }

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
