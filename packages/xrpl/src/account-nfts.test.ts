import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequest } = vi.hoisted(() => {
  return { mockRequest: vi.fn() };
});

vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      request: mockRequest,
    })),
  };
});

import { Client } from "xrpl";
import { fetchAllAccountNfts } from "./account-nfts.js";

const ACCOUNT = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function nft(id: string) {
  return { NFTokenID: id };
}

beforeEach(() => {
  mockRequest.mockReset();
});

// F-b458d21c: fetchAllAccountNfts is the ONE place that walks XRPL's
// account_nfts `marker` pagination — checkHolder, readNftFromLedger, and
// every other caller trust it to return the account's FULL NFT set. It had
// no direct test file of its own; its pagination correctness was only ever
// exercised indirectly (and only for a 2-page case) through check-holder.ts
// and read-nft.ts's own test suites. These tests pin the loop's actual
// contract directly against this module: it takes an already-connected
// Client (so no connect/disconnect mocking is needed, unlike modules that
// construct their own Client), and must terminate correctly regardless of
// how many pages the ledger reports.
describe("fetchAllAccountNfts", () => {
  it("returns every entry from a single page when the ledger reports no marker", async () => {
    mockRequest.mockResolvedValueOnce({
      result: { account_nfts: [nft("A"), nft("B")] },
    });

    const client = new Client("wss://fake-for-test");
    const result = await fetchAllAccountNfts(client, ACCOUNT);

    expect(result).toEqual([nft("A"), nft("B")]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("omits the marker field entirely on the first request rather than sending marker: undefined", async () => {
    mockRequest.mockResolvedValueOnce({
      result: { account_nfts: [] },
    });

    const client = new Client("wss://fake-for-test");
    await fetchAllAccountNfts(client, ACCOUNT);

    const firstCallArg = mockRequest.mock.calls[0][0];
    expect(firstCallArg).toEqual({
      command: "account_nfts",
      account: ACCOUNT,
      ledger_index: "validated",
    });
    expect("marker" in firstCallArg).toBe(false);
  });

  it("walks all THREE pages, carrying each page's own marker into the next request, and concatenates entries in page order", async () => {
    mockRequest
      .mockResolvedValueOnce({
        result: { account_nfts: [nft("A")], marker: "marker-1" },
      })
      .mockResolvedValueOnce({
        result: { account_nfts: [nft("B")], marker: "marker-2" },
      })
      .mockResolvedValueOnce({
        result: { account_nfts: [nft("C")] }, // no marker => last page
      });

    const client = new Client("wss://fake-for-test");
    const result = await fetchAllAccountNfts(client, ACCOUNT);

    // Three pages actually walked (not hardcoded to a 2-call pagination
    // shortcut) and concatenated in the order the ledger returned them.
    expect(result).toEqual([nft("A"), nft("B"), nft("C")]);
    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(mockRequest.mock.calls[1][0]).toMatchObject({ marker: "marker-1" });
    expect(mockRequest.mock.calls[2][0]).toMatchObject({ marker: "marker-2" });
  });

  it("stops after exactly one request (no infinite loop) when the account has zero NFTs", async () => {
    mockRequest.mockResolvedValueOnce({
      result: { account_nfts: [] },
    });

    const client = new Client("wss://fake-for-test");
    const result = await fetchAllAccountNfts(client, ACCOUNT);

    expect(result).toEqual([]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
