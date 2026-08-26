import { describe, it, expect, afterEach } from "vitest";
import { runBin } from "./test-support/run-bin.js";

const ORIGINAL_ARGV = process.argv;

/**
 * F-557e9844: five CLI flags (--signers, --outputs, --approvals,
 * --tx-hashes, --executed-outputs) require hand-typed JSON and were parsed
 * with a bare JSON.parse — a malformed value surfaced as a raw
 * "SyntaxError: ... in JSON at position N" via the top-level
 * main().catch() handler, with no indication of which flag was at fault.
 *
 * Each case's own required-flags check runs before the JSON.parse in
 * question, so every test below supplies plausible (but never-read, since
 * the parse failure throws first) values for the other required flags —
 * no file needs to actually exist and no network call happens.
 */
describe("bin.ts — friendly errors for malformed CLI JSON arguments (F-557e9844)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  it("names --signers when create-governance-policy gets malformed JSON", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "create-governance-policy",
      "--manifest",
      "unused-manifest.json",
      "--treasury",
      "rTreasuryAddressXXXXXXXXXXXXXXXXXX",
      "--signers",
      "not-valid-json",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid JSON for --signers");
    // The friendly message deliberately still includes the underlying
    // parse reason (for detail) — what must be gone is a *bare*,
    // context-free SyntaxError with no flag name at all.
    expect(printed).not.toMatch(/^Error: Unexpected token/);
  });

  it("names --outputs when propose-payout gets malformed JSON", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "propose-payout",
      "--policy",
      "unused-policy.json",
      "--id",
      "payout-001",
      "--outputs",
      "{not valid",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid JSON for --outputs");
  });

  it("names --approvals when decide-payout gets malformed JSON", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "decide-payout",
      "--policy",
      "unused-policy.json",
      "--proposal",
      "unused-proposal.json",
      "--approvals",
      "[1,2,",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid JSON for --approvals");
  });

  it("names --tx-hashes when execute-payout gets malformed JSON (checked before --executed-outputs)", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "execute-payout",
      "--policy",
      "unused-policy.json",
      "--proposal",
      "unused-proposal.json",
      "--decision",
      "unused-decision.json",
      "--tx-hashes",
      "{not valid",
      "--executed-outputs",
      "[]",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid JSON for --tx-hashes");
  });

  it("names --executed-outputs when execute-payout gets malformed JSON there instead", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "execute-payout",
      "--policy",
      "unused-policy.json",
      "--proposal",
      "unused-proposal.json",
      "--decision",
      "unused-decision.json",
      "--tx-hashes",
      "[]",
      "--executed-outputs",
      "{not valid",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Invalid JSON for --executed-outputs");
  });
});
