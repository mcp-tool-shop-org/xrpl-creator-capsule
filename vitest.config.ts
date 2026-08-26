import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    exclude: [
      // app/ has its own vitest config (jsdom env + setup files); it is run
      // separately by verify.sh rather than from here.
      "app/**",
      // Leading ** is load-bearing: a bare "node_modules/**" anchors at the
      // repo root and does NOT match nested copies, so tests were discovered
      // through workspace symlinks under other checkouts.
      "**/node_modules/**",
      // `tsc -b` emits compiled .test.js next to the sources (noEmitOnError is
      // not set, so it emits even on error). Without this, running a build
      // before the tests silently doubles the suite and runs stale copies.
      "**/dist/**",
      // Agent worktrees are full repo copies living inside the repo.
      ".swarm/**",
    ],
  },
});
