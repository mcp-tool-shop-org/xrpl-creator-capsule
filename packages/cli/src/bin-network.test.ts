import { describe, it, expect, afterEach } from "vitest";
import { runBin } from "./test-support/run-bin.js";

const ORIGINAL_ARGV = process.argv;

/**
 * F-6d35beac: parseNetwork() validated --network against the
 * testnet/devnet/mainnet enum but was never called anywhere — every case
 * block reimplemented --network parsing inline instead, and three of the
 * five call sites (configure-minter, mint-release, create-governance-policy)
 * skipped validation entirely. An invalid --network value fell through
 * uncaught into command internals instead of failing with a clear message
 * here.
 *
 * Each test below supplies an invalid --network value and otherwise only
 * enough flags to get past that case's *presence* checks (which don't
 * inspect the network value) — proving validation now happens before any
 * file access or command logic runs. Pre-fix, these same commands instead
 * fail later with an unrelated error (e.g. ENOENT on a placeholder path
 * that's never meant to be read), which is what makes this a genuine
 * red/green pair rather than just "some error was thrown".
 */
describe("bin.ts — --network validation wired at every read site (F-6d35beac)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  it("configure-minter rejects an invalid --network value up front", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "configure-minter",
      "--network",
      "bogus-network",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid network: bogus-network");
  });

  it("mint-release rejects an invalid --network value up front", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "mint-release",
      "--manifest",
      "unused-manifest.json",
      "--network",
      "bogus-network",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid network: bogus-network");
  });

  it("create-governance-policy rejects an invalid --network value up front", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "create-governance-policy",
      "--manifest",
      "unused-manifest.json",
      "--treasury",
      "rTreasuryAddressXXXXXXXXXXXXXXXXXX",
      "--signers",
      "[]",
      "--network",
      "bogus-network",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid network: bogus-network");
  });

  it("init-wallets keeps validating --network (already worked pre-fix; guards against regression)", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "init-wallets",
      "--network",
      "bogus-network",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid network: bogus-network");
  });
});
