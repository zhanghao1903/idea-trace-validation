import type {
  IdeaService,
  ProjectExecutionService,
  Readiness,
  ReportService,
} from "@idea/application";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

const unavailableService = new Proxy({} as IdeaService, {
  get() {
    return async () => {
      throw new Error("SERVICE_MUST_NOT_BE_CALLED_WHILE_NOT_READY");
    };
  },
});
const unavailableExecutionService =
  unavailableService as unknown as ProjectExecutionService;
const unavailableReportService = unavailableService as unknown as ReportService;

const config = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "postgres://example.invalid/idea_validation",
  aiApiToken: "test-token-that-is-at-least-thirty-two-characters",
  aiWriteDisplayName: "LP-03 report writer",
  aiWriteClient: null,
  humanControlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  logLevel: "silent" as const,
  dbPoolMax: 1,
  dbConnectTimeoutMs: 100,
  shutdownGraceMs: 1_000,
};

describe("listener and readiness contract", () => {
  it("keeps live/OpenAPI observable and gates every business route", async () => {
    const notReady: Readiness = {
      async probe() {
        return {
          status: "NOT_READY",
          reason: "DATABASE_UNREACHABLE",
          checkedAt: Date.now(),
        };
      },
      async current() {
        return {
          status: "NOT_READY",
          reason: "DATABASE_UNREACHABLE",
          checkedAt: Date.now(),
        };
      },
    };
    const app = await buildApp({
      config,
      service: unavailableService,
      executionService: unavailableExecutionService,
      reportService: unavailableReportService,
      readiness: notReady,
    });
    try {
      expect((await app.inject("/health/live")).statusCode).toBe(200);
      expect((await app.inject("/health/ready")).statusCode).toBe(503);
      expect((await app.inject("/openapi.json")).statusCode).toBe(200);
      const business = await app.inject("/api/v1/ideas");
      expect(business.statusCode).toBe(503);
      expect(business.json().error.code).toBe("SERVICE_NOT_READY");
    } finally {
      await app.close();
    }
  });
});
