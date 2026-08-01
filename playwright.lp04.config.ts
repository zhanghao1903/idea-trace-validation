import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  testMatch: "lp04-demo.spec.ts",
  globalSetup: "./apps/web/e2e/lp04-demo.setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? "list" : [["github"], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node --import tsx scripts/lp04/browser-server.ts",
    url: "http://127.0.0.1:4174/health/ready",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      LP04_BROWSER_PORT: "4174",
    },
  },
});
