import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * bin.ts is a self-executing CLI entrypoint: importing it runs `main()`
 * immediately against `process.argv`, and every error path terminates via
 * `process.exit()`. To probe it as a black box we set argv before a fresh
 * dynamic import (via `vi.resetModules()`) and make `process.exit` throw —
 * mirroring its real "never returns" contract, which matters here because
 * bin.ts relies on that to stop control flow from falling through to the
 * next check after logging an error.
 *
 * bin.ts's own top-level `main().catch(fn)` never attaches a further
 * `.catch`, so once `process.exit` throws instead of truly terminating,
 * `fn`'s own re-entrant `process.exit()` call becomes an intentionally
 * unhandled rejection — a side effect of exercising a self-executing CLI
 * entrypoint in-process, not a real bug. We temporarily swap out Node's
 * `unhandledRejection` listeners for the run so that expected rejection
 * isn't reported as a test failure, then restore exactly what was there
 * (Vitest's own handler included).
 */

const ORIGINAL_ARGV = process.argv;

async function runBin(argv: string[]) {
  vi.resetModules();
  process.argv = ["node", "bin.js", ...argv];

  // Matches Node's real process.exit signature (string | number | null |
  // undefined); narrowing this to number alone type-errors under tsc -b.
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`__PROCESS_EXIT_${code}__`);
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  const savedListeners = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", () => {});

  try {
    await import("./bin.js");
    // Flush the microtask queue so bin.ts's top-level main().catch(...)
    // chain (including its own re-entrant process.exit call) fully
    // settles before we assert.
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.removeAllListeners("unhandledRejection");
    for (const listener of savedListeners) {
      process.on("unhandledRejection", listener as NodeJS.UnhandledRejectionListener);
    }
  }

  return { exitSpy, errorSpy, logSpy };
}

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
