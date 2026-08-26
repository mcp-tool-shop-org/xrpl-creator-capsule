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

import { verifyAuthorizedMinter } from "./verify-minter.js";

const ISSUER = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const OPERATOR = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockRequest.mockReset();
});

describe("verifyAuthorizedMinter", () => {
  it("still verifies successfully when NFTokenMinter matches on the validated ledger", async () => {
    mockRequest.mockResolvedValueOnce({
      result: { account_data: { NFTokenMinter: OPERATOR } },
    });

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(true);
    expect(result.actualMinter).toBe(OPERATOR);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("still falls back to the current ledger when NFTokenMinter is not yet visible on the validated ledger", async () => {
    mockRequest
      .mockResolvedValueOnce({ result: { account_data: {} } })
      .mockResolvedValueOnce({
        result: { account_data: { NFTokenMinter: OPERATOR } },
      });

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      ledger_index: "current",
    });
  });

  it("still reports not-verified with a clean message when no NFTokenMinter is set on either ledger", async () => {
    mockRequest
      .mockResolvedValueOnce({ result: { account_data: {} } })
      .mockResolvedValueOnce({ result: { account_data: {} } });

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(false);
    expect(result.actualMinter).toBeUndefined();
    expect(result.error).toBe("No NFTokenMinter set on issuer account");
  });

  it("still reports not-verified when NFTokenMinter is set to a different address", async () => {
    mockRequest.mockResolvedValueOnce({
      result: { account_data: { NFTokenMinter: "rSomeoneElse" } },
    });

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(false);
    expect(result.actualMinter).toBe("rSomeoneElse");
    expect(result.error).toContain("expected");
  });

  // F-958911fa (MEDIUM): account_info had no catch anywhere — only the
  // outer try/finally that disconnects the client. An issuer account that
  // doesn't exist yet on ledger (actNotFound) crashed with a raw xrpl.js
  // exception instead of the function's own structured
  // {verified:false, error:...} shape that every other negative outcome
  // here already produces. issueRelease calls this unguarded, so an
  // account-not-found issuer surfaced as an unhandled low-level exception.
  // Mirrors check-holder.ts's actNotFound handling.
  it("returns a structured not-verified result instead of throwing when the issuer account does not exist (actNotFound)", async () => {
    mockRequest.mockRejectedValueOnce(
      new Error("Account not found: actNotFound")
    );

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(false);
    expect(result.issuerAddress).toBe(ISSUER);
    expect(result.expectedOperator).toBe(OPERATOR);
    expect(result.actualMinter).toBeUndefined();
    expect(result.error).toContain("Account not found");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  // A transport failure that is NOT actNotFound must stay distinguishable
  // from the clean not-found case in the returned `.error` text — never
  // silently flattened into the same message, which could mask a real
  // outage as an ordinary "not authorized" result.
  it("distinguishes a non-actNotFound transport failure from the actNotFound case", async () => {
    mockRequest.mockRejectedValueOnce(new Error("connection timed out"));

    const result = await verifyAuthorizedMinter(ISSUER, OPERATOR, "testnet");

    expect(result.verified).toBe(false);
    expect(result.error).not.toContain("Account not found");
    expect(result.error).toContain("connection timed out");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
