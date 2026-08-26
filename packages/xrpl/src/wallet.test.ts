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

  // F-80ca3721 (MEDIUM, fail-open — same defect family as the fixed
  // F-072a5390 in packages/xaman/src/verify.ts: a check that silently
  // no-ops instead of validating). The success check only ran INSIDE an
  // `if (typeof meta === "object" && meta !== null && "TransactionResult"
  // in meta)` guard — when meta is missing or unexpectedly shaped, that
  // whole block was skipped and execution fell through to `return
  // pair.issuer.address` as if the AccountSet had succeeded, with no check
  // having run at all. mint.ts guards this identical malformed-meta shape
  // by throwing; this must now do the same instead of silently reporting
  // success.
  it("throws instead of silently returning success when submitAndWait's meta is malformed (not an object)", async () => {
    const pair = generateWalletPair();
    mockSubmitAndWait.mockResolvedValueOnce({
      result: {
        hash: "SOME_HASH",
        // xrpl.js types `meta` as `string | TransactionMetadata |
        // undefined` — a raw/undecoded string response is a real shape
        // this can take, and is NOT `typeof meta === "object"`.
        meta: "not_an_object",
      },
    });

    await expect(authorizeOperatorAsMinter(pair, "testnet")).rejects.toThrow(
      /meta/i
    );
  });

  it("throws instead of silently returning success when submitAndWait's meta is completely missing", async () => {
    const pair = generateWalletPair();
    mockSubmitAndWait.mockResolvedValueOnce({
      result: {
        hash: "SOME_HASH",
        // meta entirely absent — undefined.
      },
    });

    await expect(authorizeOperatorAsMinter(pair, "testnet")).rejects.toThrow(
      /meta/i
    );
  });

  // Must-not-regress baseline: a real on-chain failure (well-formed meta,
  // non-success TransactionResult) must still throw exactly as before.
  it("still throws when meta is well-formed but TransactionResult is not tesSUCCESS", async () => {
    const pair = generateWalletPair();
    mockSubmitAndWait.mockResolvedValueOnce({
      result: {
        hash: "SOME_HASH",
        meta: { TransactionResult: "tecNO_PERMISSION" },
      },
    });

    await expect(authorizeOperatorAsMinter(pair, "testnet")).rejects.toThrow(
      /tecNO_PERMISSION/
    );
  });
});
