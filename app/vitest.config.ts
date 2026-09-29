import { defineConfig } from "vitest/config";

// ci.yml sets COVERAGE_LEG to 'true' on the one leg whose reports go to
// Codecov. CI runs this suite through verify.sh, where no flag on the workflow
// step reaches it, so that leg collects coverage and writes JUnit results here,
// apart from the engine suite's. Every other run is unchanged.
const coverageLeg = process.env.COVERAGE_LEG === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 15_000,
    ...(coverageLeg ? { reporters: ["default", "junit"], outputFile: { junit: "junit.xml" } } : {}),
    coverage: {
      enabled: coverageLeg,
      provider: "v8",
      reporter: ["text", "lcovonly"],
      include: ["src/**", "bridge-worker*.ts"],
    },
    setupFiles: ["./src/__test__/setup.ts"],
  },
});
