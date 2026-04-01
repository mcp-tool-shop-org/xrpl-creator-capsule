import { readFile, writeFile } from "node:fs/promises";
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
  // Load and validate manifest
  const manifestRaw = await readFile(opts.manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  // Load wallets
  const walletRaw = await readFile(opts.walletsPath, "utf-8");
  const wallets = importWalletPair(JSON.parse(walletRaw));

  // Storage — Phase B uses mock, real storage comes later
  const storage = new MockContentStore();

  // Execute full issuance flow
  const receipt = await issueRelease({
    manifest,
    wallets,
    network: opts.network,
    allowMainnetWrite: opts.allowMainnetWrite ?? false,
    storage,
    storageProvider: "mock",
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
