import { writeFile } from "node:fs/promises";
import {
  generateWalletPair,
  fundWalletPair,
  authorizeOperatorAsMinter,
  exportWalletPair,
  type NetworkId,
} from "@capsule/xrpl";

export interface InitWalletsOptions {
  network: NetworkId;
  /** Path to write the wallet credentials (contains secrets!) */
  outputPath: string;
  /** Whether to fund via faucet (testnet/devnet only) */
  fund: boolean;
  /** Whether to authorize operator as minter on the issuer account */
  authorize: boolean;
}

export interface InitWalletsResult {
  issuerAddress: string;
  operatorAddress: string;
  network: NetworkId;
  funded: boolean;
  authorized: boolean;
}

/**
 * Generate, optionally fund, and optionally authorize an issuer + operator wallet pair.
 */
export async function initWallets(
  opts: InitWalletsOptions
): Promise<InitWalletsResult> {
  const pair = generateWalletPair();
  let funded = false;
  let authorized = false;

  if (opts.fund) {
    await fundWalletPair(pair, opts.network);
    funded = true;
  }

  if (opts.authorize) {
    if (!funded && opts.network !== "mainnet") {
      throw new Error(
        "Cannot authorize minter without funding on testnet/devnet. Use --fund."
      );
    }
    await authorizeOperatorAsMinter(pair, opts.network);
    authorized = true;
  }

  // Write credentials to file. outputPath contains secrets (see doc comment
  // above) — mode 0o600 restricts it to owner read/write at creation time so
  // it never lands world-readable on a shared/multi-user POSIX host, even
  // for an instant before a caller could chmod it themselves. This is
  // honored on POSIX filesystems; Windows/NTFS does not expose POSIX mode
  // bits via Node's fs APIs, so this option is a no-op there (see
  // init-wallets.test.ts for the platform-honest verification of this).
  const exported = exportWalletPair(pair);
  await writeFile(
    opts.outputPath,
    JSON.stringify(
      { network: opts.network, ...exported },
      null,
      2
    ) + "\n",
    { mode: 0o600 }
  );

  return {
    issuerAddress: pair.issuer.address,
    operatorAddress: pair.operator.address,
    network: opts.network,
    funded,
    authorized,
  };
}
