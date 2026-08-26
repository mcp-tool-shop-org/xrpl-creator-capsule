import { describe, it, expect, afterEach } from "vitest";
import { runBin } from "./test-support/run-bin.js";

const ORIGINAL_ARGV = process.argv;

/**
 * F-d092bb7f: top-level --help printed only the 15 command names with a
 * one-line description each — no flags, no examples. None of the 15
 * per-command parseArgs calls handled --help/-h, and Node's parseArgs
 * defaults to strict mode, so any per-command help request was rejected
 * as an unrecognized option ("Error: Unknown option '--help'") instead of
 * answered.
 */
describe("bin.ts --help (F-d092bb7f)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  it("top-level --help includes flag/usage detail and an example, not just command names", async () => {
    const { logSpy, exitSpy } = await runBin(["--help"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const printed = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("mint-release");
    // Before this fix there was no flag detail anywhere in --help output.
    expect(printed).toMatch(/--manifest/);
    expect(printed.toLowerCase()).toContain("example");
  });

  it("bare `capsule` with no command also gets the richer help", async () => {
    const { logSpy, exitSpy } = await runBin([]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const printed = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toMatch(/--manifest/);
  });

  it("per-command --help no longer crashes with 'Unknown option'", async () => {
    const { errorSpy, exitSpy, logSpy } = await runBin(["mint-release", "--help"]);

    const printedErrors = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printedErrors).not.toMatch(/Unknown option/);
    expect(exitSpy).toHaveBeenCalledWith(0);
    const printed = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("mint-release");
    expect(printed).toMatch(/--manifest/);
  });

  it("per-command -h short flag also works", async () => {
    const { errorSpy, exitSpy } = await runBin(["verify-payout", "-h"]);

    const printedErrors = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printedErrors).not.toMatch(/Unknown option/);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("per-command --help works even when other required flags are also missing", async () => {
    // Before this fix, --help wasn't special-cased at all, so it either
    // crashed as an unknown option or (for commands that check required
    // flags before touching --help) got masked by the "X is required"
    // exit. It must win regardless of what else is/isn't on the line.
    const { errorSpy, exitSpy } = await runBin(["grant-access", "--help"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const printedErrors = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printedErrors).not.toMatch(/Unknown option/);
    expect(printedErrors).not.toContain("Usage: capsule grant-access");
  });

  it("does not intercept --help for an unknown command", async () => {
    const { errorSpy, exitSpy } = await runBin(["not-a-real-command", "--help"]);

    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Unknown command: not-a-real-command");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
