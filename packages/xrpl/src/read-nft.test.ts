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

import { readNftFromLedger } from "./read-nft.js";

const ACCOUNT = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const ISSUER = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const TOKEN_PAGE_1 =
  "000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D1";
const TOKEN_PAGE_2 =
  "000813881524A73075237DE0F84728ECEF5D41B72CC5934332CC1D3100F69D2";

function nftRecord(nftTokenId: string) {
  return {
    NFTokenID: nftTokenId,
    Issuer: ISSUER,
    URI: "68747470733A2F2F6578616D706C652E636F6D",
    Flags: 8,
    TransferFee: 5000,
    NFTokenTaxon: 0,
  };
}

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockRequest.mockReset();
});

describe("readNftFromLedger", () => {
  // F-14ea4066 (HIGH): same defect shape as checkHolder — only the first
  // account_nfts page was ever read. Half 1 is the actual defect: a real,
  // on-ledger token that only shows up past page 1 must still be found
  // (previously misreported as null == "not found here"). Half 2 is the
  // must-not-regress baseline: a single-page account keeps working exactly
  // as before.

  it("finds a token that only appears on a page past the first (pagination)", async () => {
    mockRequest
      .mockResolvedValueOnce({
        result: {
          account_nfts: [nftRecord(TOKEN_PAGE_1)],
          marker: "opaque-marker-to-page-2",
        },
      })
      .mockResolvedValueOnce({
        result: {
          account_nfts: [nftRecord(TOKEN_PAGE_2)],
        },
      });

    const info = await readNftFromLedger(ACCOUNT, TOKEN_PAGE_2, "testnet");

    expect(info).not.toBeNull();
    expect(info?.nftTokenId).toBe(TOKEN_PAGE_2);
    expect(info?.issuer).toBe(ISSUER);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      marker: "opaque-marker-to-page-2",
    });
  });

  it("still finds a token on a single-page (no marker) response", async () => {
    mockRequest.mockResolvedValueOnce({
      result: {
        account_nfts: [nftRecord(TOKEN_PAGE_1)],
      },
    });

    const info = await readNftFromLedger(ACCOUNT, TOKEN_PAGE_1, "testnet");

    expect(info).not.toBeNull();
    expect(info?.nftTokenId).toBe(TOKEN_PAGE_1);
    expect(info?.flags).toBe(8);
    expect(info?.transferFee).toBe(5000);
    expect(info?.taxon).toBe(0);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("still returns null when the token is not found on any page", async () => {
    mockRequest
      .mockResolvedValueOnce({
        result: {
          account_nfts: [nftRecord(TOKEN_PAGE_1)],
          marker: "opaque-marker-to-page-2",
        },
      })
      .mockResolvedValueOnce({
        result: { account_nfts: [] },
      });

    const info = await readNftFromLedger(ACCOUNT, "NONEXISTENT", "testnet");

    expect(info).toBeNull();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
