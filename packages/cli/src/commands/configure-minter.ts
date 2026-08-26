import {
  importWalletPair,
  authorizeOperatorAsMinter,
  verifyAuthorizedMinter,
  type NetworkId,
  type MinterVerification,
} from "@capsule/xrpl";
import { readJsonFile } from "../lib/json-input.js";

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
  // F-5a0ce89b: unguarded JSON.parse used to surface a bare SyntaxError
  // with no indication the wallets file was the problem.
  const walletData = await readJsonFile(opts.walletsPath, "wallets");
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
