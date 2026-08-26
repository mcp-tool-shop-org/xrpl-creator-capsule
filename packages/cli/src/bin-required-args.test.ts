import { describe, it, expect, afterEach } from "vitest";
import { runBin } from "./test-support/run-bin.js";

const ORIGINAL_ARGV = process.argv;

/**
 * F-c939eb27: bin.ts dispatches 15 commands, each gating on its own set of
 * required flags (or, for validate/resolve, a required positional arg)
 * before doing any real work. Every one of those presence checks calls
 * `process.exit(1)` after a `console.error(...)` — but before this file,
 * none of the 13 non-xaman presence-check branches below had a test at the
 * bin.ts dispatch level (mint-release's own --via xaman --operator gate was
 * covered in bin.test.ts, and --network validation in bin-network.test.ts,
 * but not the ordinary "you forgot a required flag" path most commands hit
 * every day). This file closes that gap: one test per command proving the
 * missing-arg message names the right flag and the process exits 1, plus
 * the equal-and-opposite half of the same contract — that supplying every
 * required flag advances PAST that command's presence check.
 *
 * Every command below either has no @capsule/xrpl-touching path at all
 * (validate, resolve, create-release, verify-release, create-access-policy,
 * recover-release, create-governance-policy, propose-payout, decide-payout,
 * execute-payout, verify-payout — pure file + hash-chain logic) or is
 * stopped by its presence check before ever reaching a real command
 * function (configure-minter, mint-release, grant-access): no network
 * mocking is needed anywhere in this file, and no real network call is ever
 * made.
 */
describe("bin.ts — missing required arguments (F-c939eb27)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  it("validate: rejects a missing positional manifest path", async () => {
    const { errorSpy, exitSpy } = await runBin(["validate"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Usage: capsule validate <manifest.json>");
  });

  it("resolve: rejects a missing positional manifest path", async () => {
    const { errorSpy, exitSpy } = await runBin(["resolve"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Usage: capsule resolve <manifest.json>");
  });

  it("create-release: rejects a missing --input", async () => {
    const { errorSpy, exitSpy } = await runBin(["create-release"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("--input (-i) is required");
  });

  it("mint-release: rejects a missing --manifest before any network/wallet path runs", async () => {
    const { errorSpy, exitSpy } = await runBin(["mint-release"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("--manifest (-m) is required");
  });

  it("configure-minter --via xaman: rejects a missing --operator (symmetric with mint-release's F-fb319d5e gate)", async () => {
    const { errorSpy, exitSpy } = await runBin(["configure-minter", "--via", "xaman"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith("--operator is required with --via xaman");
  });

  it("verify-release: rejects when both --manifest and --receipt are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["verify-release"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Usage: capsule verify-release --manifest <file> --receipt <file>");
  });

  it("verify-release: rejects when only --receipt is supplied", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "verify-release",
      "--receipt",
      "unused-receipt.json",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Usage: capsule verify-release --manifest <file> --receipt <file>");
  });

  it("create-access-policy: rejects when --manifest and --receipt are missing (inline command, no dedicated module)", async () => {
    const { errorSpy, exitSpy } = await runBin(["create-access-policy"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule create-access-policy --manifest <file> --receipt <file>"
    );
  });

  it("grant-access: rejects when required flags are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["grant-access", "--manifest", "unused.json"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule grant-access --manifest <file> --receipt <file> --policy <file> --wallet <address>"
    );
  });

  it("recover-release: rejects when --manifest and --receipt are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["recover-release"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule recover-release --manifest <file> --receipt <file> [--policy <file>]"
    );
  });

  it("create-governance-policy: rejects when --manifest, --treasury, and --signers are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["create-governance-policy"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule create-governance-policy --manifest <file> --treasury <address> --signers '<json>' [--threshold N]"
    );
  });

  it("propose-payout: rejects when --policy, --id, and --outputs are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["propose-payout"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule propose-payout --policy <file> --id <proposal-id> --outputs '<json>'"
    );
  });

  it("decide-payout: rejects when --policy, --proposal, and --approvals are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["decide-payout"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule decide-payout --policy <file> --proposal <file> --approvals '<json>'"
    );
  });

  it("execute-payout: rejects when required flags are missing", async () => {
    const { errorSpy, exitSpy } = await runBin([
      "execute-payout",
      "--policy",
      "unused-policy.json",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("Usage: capsule execute-payout");
    expect(printed).toContain("--tx-hashes");
    expect(printed).toContain("--executed-outputs");
  });

  it("verify-payout: rejects when required flags are missing", async () => {
    const { errorSpy, exitSpy } = await runBin(["verify-payout", "--policy", "unused.json"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain(
      "Usage: capsule verify-payout --policy <file> --proposal <file> --decision <file> --execution <file>"
    );
  });
});

describe("bin.ts — supplying every required flag advances past the presence check (F-c939eb27)", () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  // The equal-and-opposite half of the contract above: proves the presence
  // check reads the RIGHT flag names (not, say, a typo'd option string that
  // would silently keep rejecting every real invocation too). Each case
  // supplies just enough to clear the presence check, then lets the next
  // real step fail on a placeholder path that's never meant to resolve —
  // that failure (never the presence-check's own usage line) is what proves
  // the gate under test was actually passed.

  it("verify-release: does not reject for missing flags once both are supplied", async () => {
    const { errorSpy } = await runBin([
      "verify-release",
      "--manifest",
      "unused-manifest.json",
      "--receipt",
      "unused-receipt.json",
    ]);

    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).not.toContain("Usage: capsule verify-release");
  });

  it("propose-payout: does not reject for missing flags once --policy/--id/--outputs are all supplied", async () => {
    const { errorSpy } = await runBin([
      "propose-payout",
      "--policy",
      "unused-policy.json",
      "--id",
      "payout-001",
      "--outputs",
      "[]",
    ]);

    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).not.toContain("Usage: capsule propose-payout");
  });

  it("verify-payout: does not reject for missing flags once all four artifacts are supplied", async () => {
    const { errorSpy } = await runBin([
      "verify-payout",
      "--policy",
      "unused-policy.json",
      "--proposal",
      "unused-proposal.json",
      "--decision",
      "unused-decision.json",
      "--execution",
      "unused-execution.json",
    ]);

    const printed = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).not.toContain("Usage: capsule verify-payout");
  });
});
