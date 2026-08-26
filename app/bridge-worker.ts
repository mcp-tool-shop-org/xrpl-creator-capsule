/**
 * Bridge Worker — Node.js process that exposes @capsule/core and @capsule/xrpl
 * to the Tauri desktop app via stdin/stdout JSON-RPC.
 *
 * Protocol:
 *   stdin  ← JSON { command: string, params: Record<string, unknown> }
 *   stdout → JSON { ok: true, data: unknown } | { ok: false, error: string }
 *
 * Tauri Rust commands spawn this script via `npx tsx app/bridge-worker.ts`,
 * pipe the command JSON on stdin, and read the result from stdout.
 *
 * This file (together with bridge-worker-commands.ts) is the ONLY place
 * the desktop app touches engine code. React never imports @capsule/*
 * directly.
 *
 * This file is intentionally a thin, always-executing entry point — all
 * the actual command logic lives in bridge-worker-commands.ts, which has
 * no side effects at import time and is what tests import directly. Do
 * NOT add an "am I the real entry point" guard here (e.g. via
 * import.meta.url) to make this file importable — that was tried and
 * reverted: esbuild bundles this file to CJS for the packaged production
 * app (see scripts/bundle-bridge.mjs), and import.meta is empty in CJS
 * output, so such a guard would silently always evaluate false in
 * production and main() would never run.
 */

import { writeSync } from "node:fs";
import { dispatch, type BridgeCommand, type BridgeResult, type BridgeErr } from "./bridge-worker-commands.js";

/**
 * F-c1d1c21a: Node documents writes to a pipe (stdout, exactly how
 * commands.rs's engine_call spawns this process — Stdio::piped()) as
 * ASYNCHRONOUS on Windows. process.stdout.write() queues the write and
 * returns immediately; calling process.exit() right after it — as every
 * exit path here used to — can terminate the process before that queued
 * write is flushed to the OS pipe, truncating the JSON the Rust side is
 * about to serde_json::from_str it. A truncated response surfaces as
 * exactly the raw "Bridge returned invalid JSON: ... stdout: '<partial>'
 * " blob this finding is about — an unfiltered, developer-facing string
 * landing in front of a non-technical creator (see PanelShell's
 * ErrorBanner / errors/humanize.ts for the other half of this fix).
 *
 * fs.writeSync(1, ...) writes directly and synchronously to fd 1
 * (stdout) — it does not return until the OS has accepted the write, so
 * there is nothing left pending for process.exit() to race.
 */
function writeStdoutSync(text: string): void {
  writeSync(1, text);
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  let cmd: BridgeCommand;
  try {
    cmd = JSON.parse(input);
  } catch {
    const result: BridgeErr = { ok: false, error: "Invalid JSON on stdin" };
    writeStdoutSync(JSON.stringify(result));
    process.exit(1);
  }

  try {
    const data = await dispatch(cmd);
    const result: BridgeResult = { ok: true, data };
    writeStdoutSync(JSON.stringify(result));
  } catch (err) {
    const result: BridgeErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    writeStdoutSync(JSON.stringify(result));
    process.exit(1);
  }
}

main();
