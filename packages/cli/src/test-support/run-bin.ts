import { vi } from "vitest";

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
 *
 * Extracted from bin.test.ts (wave 7, Stage C) so other bin.ts-level test
 * files (help output, --network validation, JSON-argument errors, the
 * init-wallets --allow-mainnet-write flag) can share one harness instead
 * of each redefining it.
 */
export async function runBin(argv: string[]) {
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
    await import("../bin.js");
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
