import { describe, it, expect } from "vitest";
import { getNetwork, assertMainnetAllowed } from "./network.js";

describe("getNetwork", () => {
  it("returns testnet config", () => {
    const config = getNetwork("testnet");
    expect(config.id).toBe("testnet");
    expect(config.url).toContain("altnet");
    expect(config.faucetUrl).toBeDefined();
  });

  it("returns devnet config", () => {
    const config = getNetwork("devnet");
    expect(config.id).toBe("devnet");
    expect(config.faucetUrl).toBeDefined();
  });

  it("returns mainnet config without faucet", () => {
    const config = getNetwork("mainnet");
    expect(config.id).toBe("mainnet");
    expect(config.faucetUrl).toBeUndefined();
  });
});

describe("assertMainnetAllowed", () => {
  it("allows testnet without flag", () => {
    expect(() => assertMainnetAllowed("testnet", false)).not.toThrow();
  });

  it("allows devnet without flag", () => {
    expect(() => assertMainnetAllowed("devnet", false)).not.toThrow();
  });

  it("blocks mainnet without explicit flag", () => {
    expect(() => assertMainnetAllowed("mainnet", false)).toThrow(
      "Mainnet writes require"
    );
  });

  it("allows mainnet with explicit flag", () => {
    expect(() => assertMainnetAllowed("mainnet", true)).not.toThrow();
  });
});
