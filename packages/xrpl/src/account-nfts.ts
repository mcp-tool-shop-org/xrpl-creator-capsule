import type { Client } from "xrpl";

/**
 * Shape of one entry in `account_nfts`'s `account_nfts` array, as actually
 * consumed by this package's ledger-reading call sites.
 *
 * `URI`/`TransferFee` are typed as always-present here (rather than the
 * looser shape the XRPL wire format technically allows) to match how
 * callers have always read this data — this module owns the one cast from
 * the raw RPC response, so that assumption lives in exactly one place.
 */
export interface AccountNftEntry {
  NFTokenID: string;
  Issuer: string;
  URI: string;
  Flags: number;
  TransferFee: number;
  NFTokenTaxon: number;
}

/**
 * Fetch every NFT on an account, following XRPL's `account_nfts` pagination
 * `marker` until the ledger reports no further pages.
 *
 * `account_nfts` returns only one page per call. Any account holding enough
 * NFTs to span multiple pages will have entries past the first page
 * silently missed by a caller that reads `result.account_nfts` once and
 * stops — this is the one place that walks the marker so every caller sees
 * the account's FULL NFT set.
 */
export async function fetchAllAccountNfts(
  client: Client,
  account: string
): Promise<AccountNftEntry[]> {
  const all: AccountNftEntry[] = [];
  let marker: unknown;

  for (;;) {
    const response =
      marker === undefined
        ? await client.request({
            command: "account_nfts",
            account,
            ledger_index: "validated",
          })
        : await client.request({
            command: "account_nfts",
            account,
            ledger_index: "validated",
            marker,
          });

    const page = response.result.account_nfts as unknown as AccountNftEntry[];
    all.push(...page);

    marker = response.result.marker;
    if (marker === undefined) break;
  }

  return all;
}
