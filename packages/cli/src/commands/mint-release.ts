import { writeFile } from "node:fs/promises";
import {
  assertManifest,
  type IssuanceReceipt,
} from "@capsule/core";
import { MockContentStore } from "@capsule/storage";
import {
  importWalletPair,
  issueRelease,
  type NetworkId,
} from "@capsule/xrpl";
import { readJsonFile } from "../lib/json-input.js";

export interface MintReleaseOptions {
  manifestPath: string;
  walletsPath: string;
  network: NetworkId;
  receiptPath: string;
  allowMainnetWrite?: boolean;
}

/**
 * Full issuance: manifest → validate → mint → receipt.
 *
 * Receipt is written ONLY after successful mint.
 * If mint succeeds but receipt write fails, the error is surfaced explicitly.
 */
export async function mintReleaseCommand(
  opts: MintReleaseOptions
): Promise<IssuanceReceipt> {
  // Load and validate manifest — F-5a0ce89b: manifest and wallets are the
  // two separate possible parse-failure sources in this command, right
  // before an expensive/possibly-mainnet mint. readJsonFile names which
  // one is malformed instead of surfacing a bare JSON.parse SyntaxError.
  const manifest = assertManifest(await readJsonFile(opts.manifestPath, "manifest"));

  // Load wallets
  const wallets = importWalletPair(await readJsonFile(opts.walletsPath, "wallets"));

  // Storage — Phase B uses mock, real storage comes later
  const storage = new MockContentStore();

  // This store is constructed empty and nothing ever puts content into it, so
  // every pointer in the manifest is unresolved by construction. issueRelease
  // now refuses to mint against unresolved content by default, because the URI
  // it writes into each token is permanent. Opting out keeps this command
  // usable while the mock backend stands in for real storage, but it is said
  // out loud rather than passing silently: minting this way records a pointer
  // to content that is not actually stored anywhere.
  console.warn(
    "WARNING: minting with mock storage. Media and cover pointers are NOT " +
      "resolvable, and the URI written into each token is permanent. Do not " +
      "use this path for a release you intend to keep."
  );

  // Execute full issuance flow
  const receipt = await issueRelease({
    manifest,
    wallets,
    network: opts.network,
    allowMainnetWrite: opts.allowMainnetWrite ?? false,
    storage,
    storageProvider: "mock",
    allowUnresolvedStorage: true,
  });

  // Write receipt — this MUST succeed or we surface the error
  try {
    await writeFile(
      opts.receiptPath,
      JSON.stringify(receipt, null, 2) + "\n"
    );
  } catch (err) {
    throw new Error(
      `CRITICAL: Mint succeeded but receipt write failed. ` +
        `Token IDs: ${receipt.xrpl.nftTokenIds.join(", ")}. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return receipt;
}
