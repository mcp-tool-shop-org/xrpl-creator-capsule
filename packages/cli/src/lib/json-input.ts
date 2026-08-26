import { readFile } from "node:fs/promises";

/**
 * Shared JSON-parsing helpers for CLI input.
 *
 * Every place the CLI accepts JSON — a `--flag '<json>'` command-line
 * argument, or an artifact file read from disk — used to call JSON.parse
 * directly with no surrounding try/catch. A malformed value in either case
 * surfaced as a bare "SyntaxError: Unexpected token ... in JSON at
 * position N" through the top-level main().catch() handler, with no
 * indication of which flag or file was actually at fault
 * (F-557e9844, F-5a0ce89b, F-e676ca8f).
 *
 * create-release.ts and validate.ts already wrapped their own file-content
 * JSON.parse in try/catch producing "Failed to parse <path> as JSON" — this
 * module generalizes that house pattern (and extends it with the parse
 * failure's own reason) into two reusable helpers instead of 19+
 * near-duplicate inline try/catch blocks.
 *
 * `T` defaults to `any`, matching JSON.parse's own return type. Every
 * call site already re-validates the parsed shape immediately afterward
 * via the relevant `assert*` schema check (or an equivalent runtime
 * contract, e.g. `importWalletPair`) — these helpers are only responsible
 * for turning a *parse* failure into a message that names the offending
 * flag or file, not for shape validation.
 */

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parse a JSON string taken directly from a CLI flag's value, e.g.
 * `--signers '<json>'`. `whatItIs` should name the flag as typed on the
 * command line (e.g. "--signers") so a malformed value is reported against
 * the flag the operator actually typed, not as a bare parser position.
 */
export function parseJsonArgument<T = any>(raw: string, whatItIs: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Invalid JSON for ${whatItIs}: ${reasonOf(err)}`);
  }
}

/**
 * Read a file and parse its contents as JSON in one step, producing an
 * error that names the file (and optionally what it's supposed to be)
 * instead of a bare JSON.parse SyntaxError with no file context.
 *
 * `whatItIs` is an optional label (e.g. "manifest", "wallets") — useful
 * when a single command reads more than one JSON file and the path alone
 * doesn't make it obvious which artifact failed.
 */
export async function readJsonFile<T = any>(
  path: string,
  whatItIs?: string
): Promise<T> {
  const raw = await readFile(path, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const label = whatItIs ? `${whatItIs} (${path})` : path;
    throw new Error(`Failed to parse ${label} as JSON: ${reasonOf(err)}`);
  }
}
