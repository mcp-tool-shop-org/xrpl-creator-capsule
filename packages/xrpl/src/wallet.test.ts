import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockDisconnect, mockSubmitAndWait } = vi.hoisted(() => {
  return {
    mockConnect: vi.fn(),
    mockDisconnect: vi.fn(),
    mockSubmitAndWait: vi.fn(),
  };
});

vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      submitAndWait: mockSubmitAndWait,
    })),
  };
});

import {
  generateWalletPair,
  exportWalletPair,
  importWalletPair,
  authorizeOperatorAsMinter,
} from "./wallet.js";

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockSubmitAndWait.mockReset();
});

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

describe("authorizeOperatorAsMinter", () => {
  // F-abd9c7e0 (MEDIUM): the AccountSet transaction's real on-chain proof
  // (tx.result.hash) was computed, checked for tesSUCCESS, and then
  // discarded — the function returned only pair.issuer.address, which the
  // caller already had before calling it. That hash is the ONLY place
  // IssuanceReceipt.authorizedMinterTxHash can ever come from (see paired
  // finding F-e20f853d in issue-release.ts — verifyAuthorizedMinter is a
  // read-only account_info call with no tx hash of its own).
  it("returns the on-chain tx hash of the AccountSet authorization, not just the issuer address", async () => {
    const pair = generateWalletPair();
    mockSubmitAndWait.mockResolvedValueOnce({
      result: {
        hash: "ACCOUNTSET_TX_HASH",
        meta: { TransactionResult: "tesSUCCESS" },
      },
    });

    const result = await authorizeOperatorAsMinter(pair, "testnet");

    expect(result.issuerAddress).toBe(pair.issuer.address);
    expect(result.txHash).toBe("ACCOUNTSET_TX_HASH");
  });
});
