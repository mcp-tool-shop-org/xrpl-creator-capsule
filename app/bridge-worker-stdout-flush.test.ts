// @vitest-environment node
/**
 * F-c1d1c21a (bridge-worker.ts half): main()'s error paths used to call
 * `process.stdout.write(JSON.stringify(result))` immediately followed by
 * `process.exit(1)`, with nothing awaiting the write. Node documents
 * writes to a pipe (stdout, when the parent has piped it — exactly how
 * commands.rs's engine_call spawns this process) as ASYNCHRONOUS on
 * Windows. Exiting immediately after a longer write risks the process
 * terminating before the OS pipe finishes flushing, truncating the JSON
 * — which then makes commands.rs's serde_json::from_str fail and surface
 * a raw "Bridge returned invalid JSON" blob to a non-technical creator
 * (see humanize.test.ts for that half of the fix).
 *
 * This module (unlike bridge-worker-commands.ts's pure `dispatch()`)
 * cannot be unit-tested via a plain import — bridge-worker.ts is
 * deliberately a thin, always-executing entry point with no "am I the
 * real entry point" guard (see its own header comment: adding one broke
 * the production CJS bundle). A flush-before-exit bug is also
 * fundamentally about real OS pipe/timing behavior, not something a
 * mocked `process.stdout.write` could meaningfully prove either way.
 *
 * So this test spawns the REAL worker in its PRODUCTION form — the
 * esbuild bundle scripts/bundle-bridge.mjs produces, run with plain
 * `node` — and sends it a command deliberately engineered to produce a
 * MULTI-MEGABYTE error message — dispatch()'s `default` case echoes an
 * unrecognized command name verbatim into its thrown Error
 * ("Unknown command: <cmd>"), so a huge command string produces a huge,
 * fully-deterministic response payload — then reads stdout to
 * completion (not just "first chunk") and asserts the FULL response
 * arrived intact and is valid, parseable JSON with the exact expected
 * content. A truncated write would surface here as either a JSON.parse
 * failure or a shorter-than-expected `error` string.
 *
 * Why the bundle and not `npx tsx bridge-worker.ts`: tsx is not a
 * declared dependency anywhere in this repo (commands.rs's dev mode
 * borrows a globally-installed tsx). An earlier version of this test
 * spawned tsx and went green only on machines with a global tsx — on
 * CI's runner the child died at spawn, stdout came back empty, and the
 * test failed with the very "Unexpected end of JSON input" it guards
 * against, plus an EPIPE from writing 3MB of stdin to a dead child.
 * Bundling with esbuild (a declared devDependency, the same invocation
 * production uses) into a temp dir and running plain `node` is
 * hermetic, and it exercises the exact artifact commands.rs spawns in
 * production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));

let bundleDir: string;
let bundledWorkerPath: string;

beforeAll(async () => {
  bundleDir = await mkdtemp(join(tmpdir(), "capsule-bridge-flush-"));
  bundledWorkerPath = join(bundleDir, "bridge-worker.cjs");
  // Mirror scripts/bundle-bridge.mjs — the production bundle invocation.
  await build({
    entryPoints: [join(__dirname, "bridge-worker.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: bundledWorkerPath,
    external: [],
    sourcemap: false,
    minify: true,
    keepNames: true,
  });
}, 60_000);

afterAll(async () => {
  await rm(bundleDir, { recursive: true, force: true });
});
// Comfortably larger than any typical OS pipe kernel buffer (Windows
// named pipes commonly default around 64KB) so a naive unflushed write
// has real pressure to be caught mid-flight rather than completing in
// one syscall by coincidence.
const HUGE_COMMAND_LENGTH = 3_000_000;

function runBridgeWorker(stdin: string): Promise<{ stdout: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundledWorkerPath], {
      cwd: join(__dirname, ".."), // monorepo root — same cwd resolve_bridge() uses
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    // A dead child makes the 3MB stdin write below fail with EPIPE; surface
    // that as a rejection instead of an unhandled stream error.
    child.stdin.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout: Buffer.concat(stdoutChunks).toString("utf-8"), exitCode });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

describe("bridge-worker.ts: stdout flush before process.exit()", () => {
  it(
    "delivers the FULL error response for a multi-megabyte payload, not a truncated one",
    async () => {
      const hugeCommand = "x".repeat(HUGE_COMMAND_LENGTH);
      const input = JSON.stringify({ command: hugeCommand, params: {} });

      const { stdout, exitCode } = await runBridgeWorker(input);

      expect(exitCode).toBe(1);

      // A truncated write fails right here — either JSON.parse throws
      // (the exact symptom named in the finding, reproduced against
      // commands.rs's identical serde_json::from_str parse), or it
      // silently produces a partial object without throwing.
      let parsed: { ok: boolean; error: string };
      expect(() => {
        parsed = JSON.parse(stdout);
      }).not.toThrow();
      parsed = JSON.parse(stdout);

      expect(parsed.ok).toBe(false);
      const expectedError = `Unknown command: ${hugeCommand}`;
      // Exact length first — the clearest signal of truncation specifically.
      expect(parsed.error.length).toBe(expectedError.length);
      expect(parsed.error).toBe(expectedError);
    },
    20_000
  );
});
