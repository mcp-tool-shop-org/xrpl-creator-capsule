/**
 * F-c1d1c21a: every error path in the app funnels err.message straight
 * into ErrorBanner, which used to render it verbatim with no filtering —
 * developer-facing text like commands.rs's "Bridge returned invalid
 * JSON: ... stdout: '...', stderr: '...'" or a raw
 * "Failed to read <path>: <os error>" landed in front of a non-technical
 * creator unchanged.
 *
 * humanizeError() maps the KNOWN raw shapes this app actually produces
 * (bridge-worker process failures, bridge JSON/envelope failures,
 * sandboxed-path errors, fs read/write errors, XRPL/network failures,
 * schema-validation dumps, renderer-side JSON.parse failures) to a short
 * plain-language `message` plus a `next step`, while ALWAYS preserving
 * the original raw text verbatim as `detail` — support bundles and
 * power users still need the real text, so nothing is ever discarded,
 * only relabeled for the primary reading.
 *
 * Anything NOT recognized (including already-friendly, hand-authored
 * strings like the mint in-flight guard message or engineTimeoutMessage's
 * output) passes through unchanged — the fallback must never make an
 * already-clear message worse.
 */
import { describe, it, expect } from "vitest";
import { humanizeError, isNotFoundFsError } from "./humanize";

describe("humanizeError", () => {
  // ── detail is always preserved verbatim ───────────────────────────

  it("never discards the original raw text — detail always equals the input", () => {
    const raw = "Bridge returned invalid JSON: Unexpected token u. stdout: '', stderr: ''";
    const result = humanizeError(raw);
    expect(result.detail).toBe(raw);
  });

  // ── bridge JSON / envelope failures (commands.rs engine_call) ─────

  describe("bridge JSON and envelope failures", () => {
    it("humanizes a truncated/invalid bridge JSON response", () => {
      const raw =
        "Bridge returned invalid JSON: Unexpected end of JSON input. stdout: '{\"ok\":tr', stderr: ''";
      const { message, detail } = humanizeError(raw);
      expect(message).not.toContain("stdout:");
      expect(message).not.toContain("Unexpected end of JSON input");
      expect(message.toLowerCase()).toMatch(/try again|restart/);
      expect(detail).toBe(raw);
    });

    it("humanizes an unexpected bridge response envelope", () => {
      const raw = "Unexpected bridge response: {\"weird\":true}";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("{\"weird\":true}");
      expect(message.toLowerCase()).toMatch(/try again|restart/);
    });

    it("humanizes a bridge worker spawn failure", () => {
      const raw = "Failed to spawn bridge worker (npx): program not found";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("npx");
      expect(message.toLowerCase()).toMatch(/background|engine|process/);
    });

    it("humanizes a bridge worker stdin write failure", () => {
      const raw = "Failed to write to bridge stdin: The pipe has been ended.";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("pipe");
      expect(message.toLowerCase()).toMatch(/background|engine|process/);
    });

    it("humanizes a generic bridge worker failure", () => {
      const raw = "Bridge worker failed: os error 32";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("os error 32");
    });

    it("humanizes a missing bundled bridge worker", () => {
      const raw = "Bundled bridge worker not found at C:\\Program Files\\Capsule\\bridge-worker.cjs";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("Program Files");
      expect(message.toLowerCase()).toMatch(/reinstall|installed correctly/);
    });
  });

  // ── sandboxed path errors (F-f5a82670) ────────────────────────────

  describe("path sandbox errors", () => {
    it("humanizes a path-outside-allowed-directories error", () => {
      const raw = "Path is outside the app's allowed directories: D:\\weird\\place.json";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("D:\\weird\\place.json");
      expect(message.toLowerCase()).toMatch(/home|documents|desktop|allowed/);
    });

    it("humanizes a path-must-be-absolute error", () => {
      const raw = "Path must be absolute: sample/demo-draft.json";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("sample/demo-draft.json");
    });
  });

  // ── fs read/write errors ──────────────────────────────────────────

  describe("filesystem read errors", () => {
    it("maps a Windows-shaped not-found read failure to a friendly not-found message", () => {
      const raw =
        "Failed to read C:\\Users\\me\\missing.json: The system cannot find the file specified. (os error 2)";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("os error 2");
      expect(message.toLowerCase()).toMatch(/could not be found|not be found/);
    });

    it("maps a Unix-shaped not-found read failure to a friendly not-found message", () => {
      const raw = "Failed to read /home/me/missing.json: No such file or directory (os error 2)";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/could not be found|not be found/);
    });

    it("maps a permission-denied read failure to a friendly permission message", () => {
      const raw = "Failed to read C:\\Windows\\System32\\config.json: Access is denied. (os error 5)";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/permission/);
    });

    it("maps an unrecognized read failure to a generic friendly message, not a blank one", () => {
      const raw = "Failed to read /mnt/x/file.json: Input/output error (os error 5)";
      const { message } = humanizeError(raw);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain("os error");
    });
  });

  describe("filesystem write errors", () => {
    it("maps a not-found write failure (missing folder) to a friendly message", () => {
      const raw =
        "Failed to write C:\\gone\\receipt.json: The system cannot find the path specified. (os error 3)";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("os error 3");
      expect(message.toLowerCase()).toMatch(/could not be found|location/);
    });

    it("maps a permission-denied write failure to a friendly permission message", () => {
      const raw = "Failed to write D:\\readonly\\receipt.json: Access is denied. (os error 5)";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/permission/);
    });

    it("humanizes a directory-creation failure", () => {
      const raw = "Failed to create directory: Access is denied. (os error 5)";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("os error 5");
    });
  });

  // ── network / XRPL failures ────────────────────────────────────────

  describe("network / XRPL failures", () => {
    it("humanizes a NotConnectedError from the xrpl client", () => {
      const raw = "NotConnectedError: Not connected to the XRPL network.";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/xrpl|network/);
      expect(message.toLowerCase()).toMatch(/internet|connection/);
    });

    it("humanizes a TimeoutError thrown by the xrpl client itself (not the app's own timeout wrapper)", () => {
      const raw = "TimeoutError: The request timed out.";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/xrpl|network/);
    });

    it("humanizes a raw ECONNREFUSED", () => {
      const raw = "connect ECONNREFUSED 127.0.0.1:6006";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("127.0.0.1:6006");
      expect(message.toLowerCase()).toMatch(/internet|connection|network/);
    });

    it("humanizes a DNS lookup failure", () => {
      const raw = "getaddrinfo ENOTFOUND s.altnet.rippletest.net";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("s.altnet.rippletest.net");
      expect(message.toLowerCase()).toMatch(/internet|connection|network/);
    });

    it("gives actNotFound its own tailored wording rather than a generic connectivity message", () => {
      const raw = "Account not found: actNotFound";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/wallet|account|address/);
    });
  });

  // ── schema-validation dumps (ajv-shaped, from packages/core) ──────

  describe("schema-validation dumps", () => {
    it("humanizes an 'Invalid X:' ajv-style multi-line dump", () => {
      const raw =
        "Invalid Issuance Receipt:\n  - /xrpl/nftTokenIds: must be array\n  - /issuerAddress: must match pattern";
      const { message, detail } = humanizeError(raw);
      expect(message).not.toContain("/xrpl/nftTokenIds");
      expect(message.toLowerCase()).toMatch(/format|corrupt|incompatible/);
      // The itemized detail is exactly where a support bundle / power
      // user needs the real ajv output — never dropped.
      expect(detail).toBe(raw);
    });

    it("humanizes an invariant-violation dump", () => {
      const raw =
        "Issuance Receipt invariant violation:\n  - nftTokenIds.length (2) must equal mintTxHashes.length (1)";
      const { message } = humanizeError(raw);
      expect(message).not.toContain("nftTokenIds.length");
    });
  });

  // ── renderer-side JSON.parse failures ─────────────────────────────

  describe("renderer-side JSON parse failures", () => {
    it("humanizes a SyntaxError-shaped JSON parse failure", () => {
      const raw = "Unexpected token u in JSON at position 0";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/valid json|corrupt/);
    });

    it("humanizes an unexpected-end-of-input JSON parse failure", () => {
      const raw = "Unexpected end of JSON input";
      const { message } = humanizeError(raw);
      expect(message.toLowerCase()).toMatch(/valid json|corrupt/);
    });
  });

  // ── fallback passthrough — must never mangle already-friendly text ─

  describe("fallback passthrough for unrecognized / already-friendly text", () => {
    it("passes through an already plain-language, hand-authored message unchanged", () => {
      const raw = "A mint is already in progress for this release. Wait for it to finish, or use Check Status.";
      const result = humanizeError(raw);
      expect(result.message).toBe(raw);
      expect(result.detail).toBe(raw);
    });

    it("passes through wave 6's engineTimeoutMessage() wording unchanged", () => {
      const raw =
        "Verify timed out. It may still be completing in the background — this is not necessarily a failure. Check back, or try again.";
      const result = humanizeError(raw);
      expect(result.message).toBe(raw);
    });

    it("passes through an unrecognized short string unchanged", () => {
      const raw = "Cannot execute a rejected proposal";
      const result = humanizeError(raw);
      expect(result.message).toBe(raw);
      expect(result.detail).toBe(raw);
    });
  });

  // ── input safety ───────────────────────────────────────────────────

  describe("input edge cases", () => {
    it("handles an empty string without throwing", () => {
      expect(() => humanizeError("")).not.toThrow();
      const result = humanizeError("");
      expect(typeof result.message).toBe("string");
      expect(typeof result.detail).toBe("string");
    });

    it("handles null/undefined without throwing, producing a generic message", () => {
      expect(() => humanizeError(null as unknown as string)).not.toThrow();
      expect(() => humanizeError(undefined as unknown as string)).not.toThrow();
      expect(humanizeError(null as unknown as string).message.length).toBeGreaterThan(0);
    });
  });
});

describe("isNotFoundFsError (shared with session.ts's exists-vs-corrupt distinction)", () => {
  it("recognizes the Windows os-error-2 not-found shape", () => {
    expect(isNotFoundFsError("Failed to read C:\\x\\y.json: The system cannot find the file specified. (os error 2)")).toBe(true);
  });

  it("recognizes the Unix ENOENT not-found shape", () => {
    expect(isNotFoundFsError("Failed to read /x/y.json: No such file or directory (os error 2)")).toBe(true);
  });

  it("does not classify a permission error as not-found", () => {
    expect(isNotFoundFsError("Failed to read /x/y.json: Access is denied. (os error 5)")).toBe(false);
  });

  it("does not classify an unrelated error as not-found", () => {
    expect(isNotFoundFsError("Bridge worker failed: os error 32")).toBe(false);
  });
});
