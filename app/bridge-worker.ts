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

import { dispatch, type BridgeCommand, type BridgeResult, type BridgeErr } from "./bridge-worker-commands.js";

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
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }

  try {
    const data = await dispatch(cmd);
    const result: BridgeResult = { ok: true, data };
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const result: BridgeErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }
}

main();
