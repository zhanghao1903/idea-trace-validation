import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.acceptance.test.ts"],
    passWithNoTests: false,
    testTimeout: 60000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
