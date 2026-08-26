/**
 * Error humanization (F-c1d1c21a).
 *
 * Before this module, every error path in the app funneled err.message
 * straight into PanelShell's ErrorBanner, which rendered it verbatim.
 * Those messages are frequently developer-facing:
 *   - commands.rs's engine_call formats raw stdout/stderr dumps into the
 *     error string when the bridge worker's JSON response is truncated
 *     or malformed ("Bridge returned invalid JSON: ... stdout: '...'").
 *   - Raw fs errors pass through unmodified ("Failed to write <path>:
 *     <os error>").
 *   - Bridge-side schema-validation failures surface ajv's itemized
 *     "/instancePath: message" dumps verbatim.
 *   - xrpl.js / rippled network failures (NotConnectedError, actNotFound,
 *     ECONNREFUSED, DNS failures) surface with their raw class/wire
 *     wording.
 *
 * humanizeError() is the single translation layer: it recognizes the
 * KNOWN raw shapes this app actually produces and maps each to a short,
 * plain-language `message` that says what happened and what to do next.
 * The original raw text is NEVER discarded — it always comes back as
 * `detail`, verbatim, for the "Technical details" disclosure in
 * ErrorBanner and for support bundles.
 *
 * Anything NOT recognized — including already-friendly, hand-authored
 * strings this app produces itself (the mint in-flight guard message,
 * wave 6's engineTimeoutMessage() output, "Wallet file must contain
 * issuer and operator...", etc.) — passes through UNCHANGED. This is
 * deliberate: the fallback's job is "do no harm," not "rewrite text that
 * was already written for a human."
 */

export interface HumanizedError {
  /** Plain-language explanation of what happened and what to do next. */
  message: string;
  /** The original, unmodified raw text — never discarded. */
  detail: string;
}

const GENERIC_FALLBACK_MESSAGE = "Something went wrong.";

// ── fs error cause classification (shared with session.ts) ───────────
//
// commands.rs's load_file/save_file/save_file_atomic all format fs
// failures as `Failed to <read|write> <path>: <os error display text>`.
// The os error text itself is platform-dependent (Rust's std::io::Error
// Display impl defers to the OS), so this matches on the handful of
// substrings actually seen on this app's supported platforms rather than
// parsing an errno.

// Numeric markers are anchored with the closing paren Rust's
// std::io::Error Display always emits right after the code ("...(os
// error 2)") so "os error 2" can never accidentally substring-match
// inside an unrelated code like "os error 32" — see the "os error 2" vs
// "os error 32" case in humanize.test.ts.
const NOT_FOUND_MARKERS = [
  "os error 2)", // ENOENT (Unix) / ERROR_FILE_NOT_FOUND (Windows)
  "os error 3)", // ERROR_PATH_NOT_FOUND (Windows) — missing parent directory
  "no such file or directory",
  "cannot find the file",
  "cannot find the path",
  "enoent",
  "file not found", // generic phrasing (not Rust's own wording, but a
  // plausible shape from other callers / test doubles)
];

const PERMISSION_MARKERS = [
  "os error 5)", // ERROR_ACCESS_DENIED (Windows) / EIO misuse on some Unixes
  "os error 13)", // EACCES (Unix)
  "access is denied",
  "permission denied",
  "eacces",
  "eperm",
];

function includesAny(haystackLower: string, markers: readonly string[]): boolean {
  return markers.some((m) => haystackLower.includes(m));
}

/**
 * True if `raw` is an fs-error string (as produced by commands.rs's
 * `Failed to read/write ...` formatting) whose underlying OS error means
 * "the path does not exist" — as opposed to a permission problem or some
 * other I/O failure. Exported so session.ts can reuse the exact same
 * classification to distinguish "no session file yet" (quiet,
 * first-launch-normal) from "a session file exists but couldn't be read"
 * (loud — see F-27abf0dc) without duplicating the marker list.
 */
export function isNotFoundFsError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return includesAny(lower, NOT_FOUND_MARKERS);
}

function isPermissionFsError(raw: string): boolean {
  return includesAny(raw.toLowerCase(), PERMISSION_MARKERS);
}

function humanizeFsRead(raw: string): string {
  if (isNotFoundFsError(raw)) {
    return "That file could not be found. It may have been moved, renamed, or deleted — choose it again.";
  }
  if (isPermissionFsError(raw)) {
    return "The app doesn't have permission to read that file. Check the file's permissions, or choose a different location.";
  }
  return "That file could not be read. Check that it exists and try again.";
}

function humanizeFsWrite(raw: string): string {
  if (isNotFoundFsError(raw)) {
    return "That location could not be found — the folder may not exist. Choose a different location and try again.";
  }
  if (isPermissionFsError(raw)) {
    return "The app doesn't have permission to save there. Choose a different location, or check the folder's permissions.";
  }
  return "That file could not be saved. Check the location and try again.";
}

// ── ordered rules ──────────────────────────────────────────────────────
//
// First match wins. Order matters: more specific patterns (e.g.
// actNotFound) are listed before the broader buckets they'd otherwise
// fall into (generic network/XRPL failures).

interface ErrorRule {
  test: (raw: string, lower: string) => boolean;
  humanize: (raw: string) => string;
}

const RULES: ErrorRule[] = [
  // ── bridge JSON / envelope failures (commands.rs engine_call) ──────
  {
    test: (_raw, lower) => lower.startsWith("bridge returned invalid json:"),
    humanize: () =>
      "The background engine process returned a response that couldn't be read. This can happen if it was interrupted. Try the action again — if it keeps happening, restart the app.",
  },
  {
    test: (_raw, lower) => lower.startsWith("unexpected bridge response:"),
    humanize: () =>
      "The background engine process returned a response the app didn't expect. Try the action again — if it keeps happening, restart the app.",
  },
  {
    test: (_raw, lower) =>
      lower.startsWith("failed to spawn bridge worker") ||
      lower.startsWith("failed to write to bridge stdin") ||
      lower.startsWith("bridge worker failed:") ||
      lower.startsWith("bundled bridge worker not found") ||
      lower.startsWith("bridge worker not found") ||
      lower.startsWith("failed to resolve resource dir"),
    humanize: () =>
      "Could not start or communicate with the background engine process. Make sure the app was installed correctly, then try again. If this keeps happening, reinstall the app.",
  },

  // ── sandboxed path errors (F-f5a82670) ─────────────────────────────
  {
    test: (_raw, lower) => lower.startsWith("path is outside the app's allowed directories:"),
    humanize: () =>
      "That location is outside the folders this app is allowed to access (home, documents, desktop, or app data). Choose a location inside one of those folders.",
  },
  {
    test: (_raw, lower) => lower.startsWith("path must be absolute:"),
    humanize: () => "That file location couldn't be used. Please choose the file again using the file picker.",
  },

  // ── fs read/write/directory errors ─────────────────────────────────
  {
    test: (_raw, lower) => lower.startsWith("failed to read "),
    humanize: (raw) => humanizeFsRead(raw),
  },
  {
    test: (_raw, lower) => lower.startsWith("failed to write "),
    humanize: (raw) => humanizeFsWrite(raw),
  },
  {
    test: (_raw, lower) => lower.startsWith("failed to create directory:"),
    humanize: (raw) =>
      isPermissionFsError(raw)
        ? "The app doesn't have permission to create that folder. Choose a different location, or check its permissions."
        : "That folder could not be created. Check the location and try again.",
  },

  // ── network / XRPL failures ─────────────────────────────────────────
  {
    // Checked before the generic connectivity bucket below: a missing
    // account is a valid, informative ledger response, not a dropped
    // connection, and deserves its own wording.
    test: (_raw, lower) => lower.includes("actnotfound"),
    humanize: () =>
      "That wallet address could not be found on the XRPL network — it may not exist yet, or may not have received any transactions.",
  },
  {
    test: (_raw, lower) =>
      lower.includes("notconnectederror") ||
      lower.includes("disconnectederror") ||
      lower.includes("timeouterror") ||
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("etimedout") ||
      lower.includes("getaddrinfo") ||
      lower.includes("websocket"),
    humanize: () => "Could not reach the XRPL network. Check your internet connection and try again in a moment.",
  },

  // ── schema-validation dumps (ajv-shaped, packages/core) ────────────
  {
    test: (_raw, lower) => /^invalid [a-z ]+:\n/i.test(lower) || lower.includes("invariant violation:\n"),
    humanize: () =>
      "This file's contents don't match the format the app expects — it may be corrupted or from an incompatible version. See the technical details below.",
  },

  // ── renderer-side JSON.parse failures ──────────────────────────────
  {
    test: (_raw, lower) =>
      lower.includes("unexpected token") ||
      lower.includes("unexpected end of json input") ||
      lower.includes("unexpected non-whitespace character"),
    humanize: () => "That file isn't valid JSON — it may be corrupted, empty, or not the right kind of file.",
  },
];

/**
 * Translate a raw error string into a plain-language message plus the
 * preserved original detail. Safe to call with any input this codebase's
 * `err instanceof Error ? err.message : String(err)` pattern can produce,
 * including null/undefined/empty from a defensively-typed caller.
 */
export function humanizeError(raw: string | null | undefined): HumanizedError {
  const safeRaw = typeof raw === "string" ? raw : raw == null ? "" : String(raw);

  if (safeRaw.length === 0) {
    return { message: GENERIC_FALLBACK_MESSAGE, detail: safeRaw };
  }

  const lower = safeRaw.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(safeRaw, lower)) {
      return { message: rule.humanize(safeRaw), detail: safeRaw };
    }
  }

  // Fallback: pass through unchanged. Covers hand-authored, already
  // plain-language app messages (mint in-flight guard, receipt_unsaved
  // copy, engineTimeoutMessage() output, "Wallet file must contain...",
  // etc.) as well as any genuinely-unrecognized raw text — better to
  // show the original than to guess and mislead.
  return { message: safeRaw, detail: safeRaw };
}
