import { describe, it, expect } from "vitest";
import {
  generateWalletPair,
  exportWalletPair,
  importWalletPair,
} from "./wallet.js";

describe("generateWalletPair", () => {
  it("creates two distinct wallets", () => {
    const pair = generateWalletPair();
    expect(pair.issuer.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]+$/);
    expect(pair.operator.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]+$/);
    expect(pair.issuer.address).not.toBe(pair.operator.address);
  });

  it("generates different pairs each time", () => {
    const pair1 = generateWalletPair();
    const pair2 = generateWalletPair();
    expect(pair1.issuer.address).not.toBe(pair2.issuer.address);
  });
});

describe("exportWalletPair / importWalletPair", () => {
  it("round-trips wallet credentials", () => {
    const pair = generateWalletPair();
    const exported = exportWalletPair(pair);

    expect(exported.issuer.address).toBe(pair.issuer.address);
    expect(exported.operator.address).toBe(pair.operator.address);
    expect(exported.issuer.seed).toBeDefined();
    expect(exported.operator.seed).toBeDefined();

    const restored = importWalletPair(exported);
    expect(restored.issuer.address).toBe(pair.issuer.address);
    expect(restored.operator.address).toBe(pair.operator.address);
  });
});
