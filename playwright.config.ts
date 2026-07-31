import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? "list" : [["github"], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev --workspace @idea/web -- --port 4173",
    url: "http://127.0.0.1:4173/proposer",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
