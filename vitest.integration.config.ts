import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    passWithNoTests: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
