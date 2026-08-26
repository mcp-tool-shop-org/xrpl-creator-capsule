import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// F-c939eb27: configure-minter.ts — the authorization flow that sets the
// operator wallet as the issuer's authorized NFT minter — had no test file
// at all. This mirrors the vi.mock('@capsule/xrpl', ...) pattern already
// established in grant-access.test.ts and recover-release.test.ts, per the
// finding's own fix guidance, so no real network call is ever made.
vi.mock("@capsule/xrpl", () => ({
  importWalletPair: vi.fn(),
  authorizeOperatorAsMinter: vi.fn(),
  verifyAuthorizedMinter: vi.fn(),
}));

import {
  importWalletPair,
  authorizeOperatorAsMinter,
  verifyAuthorizedMinter,
} from "@capsule/xrpl";
import { configureMinter } from "./configure-minter.js";

const mockImportWalletPair = vi.mocked(importWalletPair);
const mockAuthorize = vi.mocked(authorizeOperatorAsMinter);
const mockVerify = vi.mocked(verifyAuthorizedMinter);

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OPERATOR = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

// A fake WalletPair shape — only .address is read by configureMinter, so
// this stands in for the real xrpl.js Wallet object without constructing one.
const FAKE_PAIR = {
  issuer: { address: ISSUER } as any,
  operator: { address: OPERATOR } as any,
};

let tempDir: string;
let walletsPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-configure-minter-test-"));
  walletsPath = join(tempDir, "wallets.json");
  // Contents are opaque to configureMinter — importWalletPair is mocked, so
  // any JSON-parseable object exercises the real readJsonFile -> importWalletPair
  // wiring without needing real seeds.
  await writeFile(walletsPath, JSON.stringify({ issuer: { seed: "sFAKE1" }, operator: { seed: "sFAKE2" } }));

  mockImportWalletPair.mockReset().mockReturnValue(FAKE_PAIR);
  mockAuthorize.mockReset().mockResolvedValue({ issuerAddress: ISSUER, txHash: "FAKETXHASH" });
  mockVerify.mockReset().mockResolvedValue({
    verified: true,
    issuerAddress: ISSUER,
    expectedOperator: OPERATOR,
    actualMinter: OPERATOR,
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("configureMinter — authorization succeeds", () => {
  it("returns authorized:true when on-ledger verification confirms the minter", async () => {
    const result = await configureMinter({ walletsPath, network: "testnet" });

    expect(result.issuerAddress).toBe(ISSUER);
    expect(result.operatorAddress).toBe(OPERATOR);
    expect(result.authorized).toBe(true);
    expect(result.verification.verified).toBe(true);

    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith(ISSUER, OPERATOR, "testnet");
  });
});

describe("configureMinter — authorization does not verify on-ledger", () => {
  it("returns authorized:false and forwards the verification error, without throwing", async () => {
    // The AccountSet submission itself can succeed while the follow-up
    // read-back still disagrees (e.g. a node that hasn't closed the ledger
    // the tx landed in yet) — configureMinter must surface that as
    // authorized:false rather than treating "the submit didn't throw" as
    // success.
    mockVerify.mockResolvedValue({
      verified: false,
      issuerAddress: ISSUER,
      expectedOperator: OPERATOR,
      actualMinter: undefined,
      error: "No NFTokenMinter set on issuer account",
    });

    const result = await configureMinter({ walletsPath, network: "testnet" });

    expect(result.authorized).toBe(false);
    expect(result.verification.error).toBe("No NFTokenMinter set on issuer account");
  });
});

describe("configureMinter — --allow-mainnet-write threading", () => {
  it("passes allowMainnetWrite=true through to authorizeOperatorAsMinter when set", async () => {
    await configureMinter({ walletsPath, network: "mainnet", allowMainnetWrite: true });

    expect(mockAuthorize).toHaveBeenCalledWith(FAKE_PAIR, "mainnet", true);
  });

  it("defaults to false (fail-closed) when allowMainnetWrite is omitted", async () => {
    await configureMinter({ walletsPath, network: "mainnet" });

    expect(mockAuthorize).toHaveBeenCalledWith(FAKE_PAIR, "mainnet", false);
  });
});

describe("configureMinter — malformed wallets file (F-5a0ce89b)", () => {
  it("names the wallets file instead of surfacing a bare SyntaxError", async () => {
    await writeFile(walletsPath, "{ not valid json");

    let caught: unknown;
    try {
      await configureMinter({ walletsPath, network: "testnet" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Failed to parse");
    expect(message).toContain("wallets");
    expect(message).toContain(walletsPath);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });
});
