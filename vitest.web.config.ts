import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["apps/web/src/**/*.component.test.tsx"],
    setupFiles: ["./apps/web/src/test/setup.ts"],
    passWithNoTests: false,
  },
});
