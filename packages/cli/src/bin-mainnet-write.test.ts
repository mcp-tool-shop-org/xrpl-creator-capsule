import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBin } from "./test-support/run-bin.js";

// F-65e3918c: init-wallets --authorize performs the exact same on-chain
// AccountSet authorization that configure-minter and mint-release gate
// behind --allow-mainnet-write, but init-wallets never declared that
// option. On mainnet, authorizeOperatorAsMinter's own fail-closed error
// told the operator to pass --allow-mainnet-write, and parseArgs' strict
// mode then rejected it as unknown — a documented dead end.
//
// The mock below mirrors authorizeOperatorAsMinter's real contract
// (packages/xrpl/src/network.ts's assertMainnetAllowed: throw on
// network==="mainnet" && !allowMainnetWrite) without making any real
// network call, so these tests can prove BOTH that the flag now threads
// through AND that the existing fail-closed safety property survives the
// fix, using one small fake instead of two different mocking strategies.
const { mockAuthorize } = vi.hoisted(() => ({
  mockAuthorize: vi.fn(
    async (_pair: unknown, network: string, allowMainnetWrite = false) => {
      if (network === "mainnet" && !allowMainnetWrite) {
        throw new Error(
          "Mainnet writes require --network mainnet --allow-mainnet-write. " +
            "This is not a casual flag — real XRP will be spent."
        );
      }
      return { issuerAddress: "rFAKEISSUERXXXXXXXXXXXXXXXXXXXXXXX", txHash: "FAKETXHASH" };
    }
  ),
}));

vi.mock("@capsule/xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capsule/xrpl")>();
  return { ...actual, authorizeOperatorAsMinter: mockAuthorize };
});

const ORIGINAL_ARGV = process.argv;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "capsule-init-wallets-mainnet-test-"));
});

afterEach(async () => {
  process.argv = ORIGINAL_ARGV;
  mockAuthorize.mockClear();
  await rm(tempDir, { recursive: true, force: true });
});

describe("bin.ts init-wallets — --allow-mainnet-write (F-65e3918c)", () => {
  it("does not reject --allow-mainnet-write as an unknown option", async () => {
    const { errorSpy } = await runBin([
      "init-wallets",
      "--network",
      "mainnet",
      "--authorize",
      "--allow-mainnet-write",
      "--output",
      join(tempDir, "wallets.json"),
    ]);

    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).not.toMatch(/Unknown option/);
  });

  it("threads --allow-mainnet-write through to authorizeOperatorAsMinter", async () => {
    await runBin([
      "init-wallets",
      "--network",
      "mainnet",
      "--authorize",
      "--allow-mainnet-write",
      "--output",
      join(tempDir, "wallets.json"),
    ]);

    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockAuthorize.mock.calls[0][1]).toBe("mainnet");
    expect(mockAuthorize.mock.calls[0][2]).toBe(true);
  });

  it("still fails closed when --allow-mainnet-write is omitted on mainnet (safety preserved)", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "init-wallets",
      "--network",
      "mainnet",
      "--authorize",
      "--output",
      join(tempDir, "wallets.json"),
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Mainnet writes require --network mainnet --allow-mainnet-write");
  });
});
