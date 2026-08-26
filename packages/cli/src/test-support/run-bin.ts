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
  //
  // The sentinel throw is ARMED only for the awaited run window below.
  // bin.ts's top-level `main().catch(fn)` can reach its re-entrant
  // `process.exit(1)` one-or-more event-loop turns AFTER this harness's
  // flush on slower/differently-scheduled hosts — observed on CI's ubuntu
  // runner (all 439 tests passed, then one late sentinel throw surfaced
  // as an unhandled rejection AFTER the finally block had restored
  // Vitest's rejection handlers, failing the whole run). Disarming turns
  // any post-window exit call into a no-op, so the late-rejection source
  // simply never exists; in-window behavior is unchanged.
  let sentinelArmed = true;
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    if (sentinelArmed) {
      throw new Error(`__PROCESS_EXIT_${code}__`);
    }
    return undefined as never;
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  const savedListeners = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", () => {});

  try {
    await import("../bin.js");
    // Flush so bin.ts's top-level main().catch(...) chain (including its
    // own re-entrant process.exit call) settles before we assert. Two
    // macrotask turns, not one: the catch chain can take an extra hop
    // when the failing command awaited something first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    // Order matters: disarm the sentinel BEFORE restoring Vitest's
    // unhandledRejection handlers, so an exit call that still lands after
    // this window cannot throw into a context nothing owns.
    sentinelArmed = false;
    process.removeAllListeners("unhandledRejection");
    for (const listener of savedListeners) {
      process.on("unhandledRejection", listener as NodeJS.UnhandledRejectionListener);
    }
  }

  return { exitSpy, errorSpy, logSpy };
}
