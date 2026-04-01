import { readFile } from "node:fs/promises";
import {
  importWalletPair,
  authorizeOperatorAsMinter,
  verifyAuthorizedMinter,
  type NetworkId,
  type MinterVerification,
} from "@capsule/xrpl";

export interface ConfigureMinterOptions {
  walletsPath: string;
  network: NetworkId;
  allowMainnetWrite?: boolean;
}

export interface ConfigureMinterResult {
  issuerAddress: string;
  operatorAddress: string;
  authorized: boolean;
  verification: MinterVerification;
}

/**
 * Configure the issuer's authorized minter and verify it on-ledger.
 */
export async function configureMinter(
  opts: ConfigureMinterOptions
): Promise<ConfigureMinterResult> {
  const raw = await readFile(opts.walletsPath, "utf-8");
  const walletData = JSON.parse(raw);
  const pair = importWalletPair(walletData);

  // Set authorized minter
  await authorizeOperatorAsMinter(
    pair,
    opts.network,
    opts.allowMainnetWrite ?? false
  );

  // Verify on-ledger
  const verification = await verifyAuthorizedMinter(
    pair.issuer.address,
    pair.operator.address,
    opts.network
  );

  return {
    issuerAddress: pair.issuer.address,
    operatorAddress: pair.operator.address,
    authorized: verification.verified,
    verification,
  };
}
