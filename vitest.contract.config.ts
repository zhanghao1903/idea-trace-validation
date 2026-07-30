import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.contract.test.ts"],
    passWithNoTests: false,
  },
});
