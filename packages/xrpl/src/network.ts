/**
 * XRPL network configuration.
 *
 * Default: Testnet. Mainnet requires explicit opt-in.
 * Devnet: feature lab only (may be reset without warning).
 */

export type NetworkId = "testnet" | "devnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  url: string;
  faucetUrl?: string;
  explorerUrl: string;
}

const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    url: "wss://s.altnet.rippletest.net:51233",
    faucetUrl: "https://faucet.altnet.rippletest.net/accounts",
    explorerUrl: "https://testnet.xrpl.org",
  },
  devnet: {
    id: "devnet",
    url: "wss://s.devnet.rippletest.net:51233",
    faucetUrl: "https://faucet.devnet.rippletest.net/accounts",
    explorerUrl: "https://devnet.xrpl.org",
  },
  mainnet: {
    id: "mainnet",
    url: "wss://xrplcluster.com",
    explorerUrl: "https://xrpl.org",
  },
};

export function getNetwork(id: NetworkId): NetworkConfig {
  return NETWORKS[id];
}

/**
 * Guard: Mainnet writes require explicit confirmation.
 * Call this before any transaction submission on mainnet.
 */
export function assertMainnetAllowed(
  network: NetworkId,
  allowMainnetWrite: boolean
): void {
  if (network === "mainnet" && !allowMainnetWrite) {
    throw new Error(
      "Mainnet writes require --network mainnet --allow-mainnet-write. " +
        "This is not a casual flag — real XRP will be spent."
    );
  }
}
