import { Client, Wallet, AccountSetAsfFlags } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork, assertMainnetAllowed } from "./network.js";

export interface WalletPair {
  /** Cold issuer wallet — identity anchor, should be stored securely */
  issuer: Wallet;
  /** Operational wallet — authorized minter, used for day-to-day ops */
  operator: Wallet;
}

export interface FundedWalletPair extends WalletPair {
  /** Network the wallets were funded on */
  network: NetworkId;
}

export interface AuthorizeMinterResult {
  /** The issuer address the AccountSet transaction was submitted against */
  issuerAddress: string;
  /**
   * The AccountSet transaction's on-chain hash — real, verifiable proof
   * the authorization happened. This is the only place this hash is ever
   * available; verifyAuthorizedMinter is a read-only account_info call
   * with no tx hash of its own, so callers that need it in an
   * IssuanceReceipt (authorizedMinterTxHash) must capture it here.
   */
  txHash: string;
}

/**
 * Generate a fresh issuer + operator wallet pair.
 * Keys are generated locally — no network call.
 */
export function generateWalletPair(): WalletPair {
  return {
    issuer: Wallet.generate(),
    operator: Wallet.generate(),
  };
}

/**
 * Fund wallets via the testnet/devnet faucet.
 * NOT available on mainnet — will throw.
 */
export async function fundWalletPair(
  pair: WalletPair,
  network: NetworkId
): Promise<FundedWalletPair> {
  if (network === "mainnet") {
    throw new Error("Cannot fund wallets via faucet on mainnet");
  }

  const config = getNetwork(network);
  const client = new Client(config.url);

  try {
    await client.connect();
    await client.fundWallet(pair.issuer);
    await client.fundWallet(pair.operator);
    return { ...pair, network };
  } finally {
    await client.disconnect();
  }
}

/**
 * Configure the issuer account to authorize the operator as its minter.
 * This is the XRPL authorized minter pattern for issuer/operator separation.
 */
export async function authorizeOperatorAsMinter(
  pair: WalletPair,
  network: NetworkId,
  allowMainnetWrite: boolean = false
): Promise<AuthorizeMinterResult> {
  assertMainnetAllowed(network, allowMainnetWrite);

  const config = getNetwork(network);
  const client = new Client(config.url);

  try {
    await client.connect();

    const tx = await client.submitAndWait(
      {
        TransactionType: "AccountSet",
        Account: pair.issuer.address,
        NFTokenMinter: pair.operator.address,
        SetFlag: AccountSetAsfFlags.asfAuthorizedNFTokenMinter,
      },
      { wallet: pair.issuer }
    );

    // F-80ca3721 (fail-open — same defect family as the fixed F-072a5390 in
    // packages/xaman/src/verify.ts: a check that silently no-ops instead of
    // validating). The success check used to run ONLY inside an
    // `if (typeof meta === "object" && ... && "TransactionResult" in meta)`
    // guard — when meta was missing or unexpectedly shaped, that whole
    // block was skipped and execution fell through to return the issuer
    // address as if the AccountSet had succeeded, with no check having run
    // at all. Mirror mint.ts's guard here: validate the shape first and
    // throw naming what was malformed, so a malformed/missing meta can
    // never fall through to a fabricated "success".
    const meta = tx.result.meta;
    if (typeof meta !== "object" || meta === null) {
      throw new Error("AccountSet authorization: no transaction metadata");
    }

    const metaObj = meta as unknown as Record<string, unknown>;
    if (metaObj.TransactionResult !== "tesSUCCESS") {
      throw new Error(`AccountSet failed: ${metaObj.TransactionResult}`);
    }

    return { issuerAddress: pair.issuer.address, txHash: tx.result.hash };
  } finally {
    await client.disconnect();
  }
}

/**
 * Serialize wallet credentials for secure storage.
 * WARNING: Contains private keys — treat as secret.
 */
export function exportWalletPair(pair: WalletPair): {
  issuer: { address: string; publicKey: string; privateKey: string; seed: string };
  operator: { address: string; publicKey: string; privateKey: string; seed: string };
} {
  return {
    issuer: {
      address: pair.issuer.address,
      publicKey: pair.issuer.publicKey,
      privateKey: pair.issuer.privateKey,
      seed: pair.issuer.seed!,
    },
    operator: {
      address: pair.operator.address,
      publicKey: pair.operator.publicKey,
      privateKey: pair.operator.privateKey,
      seed: pair.operator.seed!,
    },
  };
}

/**
 * Reconstruct a wallet pair from stored credentials.
 */
export function importWalletPair(data: {
  issuer: { seed: string };
  operator: { seed: string };
}): WalletPair {
  return {
    issuer: Wallet.fromSeed(data.issuer.seed),
    operator: Wallet.fromSeed(data.operator.seed),
  };
}
