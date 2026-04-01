import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 15_000,
    setupFiles: ["./src/__test__/setup.ts"],
  },
});
