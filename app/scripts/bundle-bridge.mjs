#!/usr/bin/env node
/**
 * Bundle bridge-worker.ts into a single .cjs file with all dependencies inlined.
 * Output: app/src-tauri/resources/bridge-worker.cjs
 *
 * This is used for production Tauri builds where the monorepo isn't available.
 * The bundled file runs with plain `node` — no tsx, no workspace resolution needed.
 */

import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "..");
const outFile = resolve(appDir, "src-tauri", "resources", "bridge-worker.cjs");

// Ensure output directory exists
mkdirSync(dirname(outFile), { recursive: true });

await build({
  entryPoints: [resolve(appDir, "bridge-worker.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: outFile,
  // Inline everything — the bundle must be self-contained
  external: [],
  // Source maps for debugging but not required
  sourcemap: false,
  // Minimize for smaller bundle
  minify: true,
  // Keep names readable in error stacks
  keepNames: true,
});

console.log(`✓ Bridge worker bundled → ${outFile}`);
