import { defineConfig } from "vitest/config";

// ci.yml sets COVERAGE_LEG to 'true' on the one leg whose reports go to
// Codecov. CI runs this suite through verify.sh, where no flag on the workflow
// step reaches it, so that leg collects coverage and writes JUnit results here.
// The desktop app has its own config and its own reports. Every other run is
// unchanged.
const coverageLeg = process.env.COVERAGE_LEG === "true";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    ...(coverageLeg ? { reporters: ["default", "junit"], outputFile: { junit: "junit.xml" } } : {}),
    coverage: {
      enabled: coverageLeg,
      provider: "v8",
      reporter: ["text", "lcovonly"],
      include: ["packages/*/src/**"],
    },
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
