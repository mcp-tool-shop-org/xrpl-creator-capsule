import { describe, it, expect, vi, afterEach } from "vitest";
import { runBin } from "./test-support/run-bin.js";

/**
 * bin.ts is a self-executing CLI entrypoint: importing it runs `main()`
 * immediately against `process.argv`, and every error path terminates via
 * `process.exit()`. To probe it as a black box we set argv before a fresh
 * dynamic import (via `vi.resetModules()`) and make `process.exit` throw —
 * mirroring its real "never returns" contract, which matters here because
 * bin.ts relies on that to stop control flow from falling through to the
 * next check after logging an error.
 *
 * The harness that makes this work (`runBin`) lives in
 * ./test-support/run-bin.ts — see that file's doc comment for the full
 * explanation of the process.exit/unhandledRejection dance. It's shared
 * with the other bin.ts-level test files added in wave 7 Stage C
 * (bin-help, bin-network, bin-json-args, bin-mainnet-write).
 */

const ORIGINAL_ARGV = process.argv;

describe("bin.ts — mint-release --via xaman operator gate (F-fb319d5e)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    vi.restoreAllMocks();
  });

  it("rejects mint-release --via xaman when --operator is missing", async () => {
    const { exitSpy, errorSpy } = await runBin([
      "mint-release",
      "--manifest",
      "unused-manifest.json",
      "--via",
      "xaman",
      "--network",
      "testnet",
    ]);

    // Without --operator, mintReleaseViaXaman would fall back to
    // verifyPayloadResult (confirms *a* signature resolved, not *who*
    // signed) instead of verifySignerAddress (confirms the operator wallet
    // signed). bin.ts must refuse to run at all in that case, exactly as
    // it already does for `configure-minter --via xaman`.
    expect(errorSpy).toHaveBeenCalledWith("--operator is required with --via xaman");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not block on the operator gate once --operator is supplied", async () => {
    const { errorSpy } = await runBin([
      "mint-release",
      "--manifest",
      "unused-manifest.json",
      "--via",
      "xaman",
      "--network",
      "devnet",
      "--operator",
      "rOperatorAddressXXXXXXXXXXXXXXXXXXX",
    ]);

    // Must NOT reject for a missing operator...
    expect(errorSpy).not.toHaveBeenCalledWith("--operator is required with --via xaman");
    // ...and must actually advance past the new guard — proving the fix
    // doesn't accidentally block the legitimate case — by reaching the
    // pre-existing "Xaman does not support devnet" gate next.
    expect(errorSpy).toHaveBeenCalledWith("Xaman does not support devnet");
  });
});
