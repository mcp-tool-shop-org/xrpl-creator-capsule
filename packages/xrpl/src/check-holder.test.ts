import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockDisconnect, mockRequest } = vi.hoisted(() => {
  return {
    mockConnect: vi.fn(),
    mockDisconnect: vi.fn(),
    mockRequest: vi.fn(),
  };
});

vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      request: mockRequest,
    })),
  };
});

import { checkHolder } from "./check-holder.js";

const WALLET = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const TOKEN_PAGE_1 =
  "000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D1";
const TOKEN_PAGE_2 =
  "000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D2";

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockRequest.mockReset();
});

describe("checkHolder", () => {
  // F-e14bc15e (HIGH): checkHolder only ever read the first account_nfts
  // page. Half 1 below is the actual defect — a qualifying token that only
  // shows up past page 1 (behind a `marker`) must still be found. Half 2
  // is the pre-existing, must-not-regress baseline: a single-page account
  // (no marker) must keep matching exactly as before.

  it("finds a qualifying token that only appears on a page past the first (pagination)", async () => {
    mockRequest
      .mockResolvedValueOnce({
        result: {
          account_nfts: [{ NFTokenID: TOKEN_PAGE_1 }],
          marker: "opaque-marker-to-page-2",
        },
      })
      .mockResolvedValueOnce({
        result: {
          account_nfts: [{ NFTokenID: TOKEN_PAGE_2 }],
          // no marker => last page
        },
      });

    const result = await checkHolder(WALLET, [TOKEN_PAGE_2], "testnet");

    expect(result.holds).toBe(true);
    expect(result.matchedTokenIds).toEqual([TOKEN_PAGE_2]);
    expect(result.totalNftsChecked).toBe(2);
    expect(result.error).toBeUndefined();

    // Confirm pagination actually happened rather than the assertion above
    // passing by accident: exactly 2 requests, second one carrying the marker.
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      command: "account_nfts",
      account: WALLET,
      marker: "opaque-marker-to-page-2",
    });
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("still matches a qualifying token on a single-page (no marker) account", async () => {
    mockRequest.mockResolvedValueOnce({
      result: {
        account_nfts: [{ NFTokenID: TOKEN_PAGE_1 }],
        // no marker
      },
    });

    const result = await checkHolder(WALLET, [TOKEN_PAGE_1], "testnet");

    expect(result.holds).toBe(true);
    expect(result.matchedTokenIds).toEqual([TOKEN_PAGE_1]);
    expect(result.totalNftsChecked).toBe(1);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("still reports non-holder when no page contains a qualifying token", async () => {
    mockRequest
      .mockResolvedValueOnce({
        result: {
          account_nfts: [{ NFTokenID: TOKEN_PAGE_1 }],
          marker: "opaque-marker-to-page-2",
        },
      })
      .mockResolvedValueOnce({
        result: { account_nfts: [{ NFTokenID: TOKEN_PAGE_2 }] },
      });

    const result = await checkHolder(WALLET, ["NOT_A_MATCH"], "testnet");

    expect(result.holds).toBe(false);
    expect(result.matchedTokenIds).toEqual([]);
    expect(result.totalNftsChecked).toBe(2);
  });

  it("still handles actNotFound as a graceful non-holder result", async () => {
    mockRequest.mockRejectedValueOnce(
      new Error("Account not found: actNotFound")
    );

    const result = await checkHolder(WALLET, [TOKEN_PAGE_1], "testnet");

    expect(result.holds).toBe(false);
    expect(result.error).toContain("Account not found");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  // The actNotFound branch above was the only failure path this suite
  // exercised. checkHolder's catch has a SECOND branch — any other ledger
  // failure — that was never pinned here, unlike its sibling modules
  // (read-nft.test.ts and verify-minter.test.ts both test this same
  // "distinguish actNotFound from a real transport failure" pair for their
  // own functions). Access gating is the money path: a wallet must never be
  // reported holds:false with a misleading/absent reason when the real
  // cause is a ledger outage rather than "no qualifying NFT."
  it("still reports a structured 'Ledger query failed' error (distinct from actNotFound) for a non-actNotFound failure", async () => {
    mockRequest.mockRejectedValueOnce(new Error("connection timed out"));

    const result = await checkHolder(WALLET, [TOKEN_PAGE_1], "testnet");

    expect(result.holds).toBe(false);
    expect(result.matchedTokenIds).toEqual([]);
    expect(result.error).toContain("Ledger query failed");
    expect(result.error).toContain("connection timed out");
    expect(result.error).not.toContain("Account not found");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
