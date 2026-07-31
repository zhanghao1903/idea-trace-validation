import type {
  IdeaService,
  ProjectExecutionService,
  Readiness,
} from "@idea/application";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loggerOptions } from "../src/logger.js";

const config = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "postgres://example.invalid/idea_validation",
  aiApiToken: "test-token-that-is-at-least-thirty-two-characters",
  humanControlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  logLevel: "silent" as const,
  dbPoolMax: 1,
  dbConnectTimeoutMs: 100,
  shutdownGraceMs: 1_000,
};

const ready: Readiness = {
  async probe() {
    return { status: "READY", checkedAt: Date.now() };
  },
  async current() {
    return { status: "READY", checkedAt: Date.now() };
  },
};

const listService = new Proxy({} as IdeaService, {
  get(_target, property) {
    if (property === "listIdeas") {
      return async () => ({ items: [], limit: 20, nextCursor: null });
    }
    return async () => {
      throw new Error(`UNEXPECTED_SERVICE_CALL:${String(property)}`);
    };
  },
});
const unavailableExecutionService =
  listService as unknown as ProjectExecutionService;

describe("request identity contract", () => {
  it("uses one Fastify request ID for access logging and an initial read response", async () => {
    const app = await buildApp({
      config,
      service: listService,
      executionService: unavailableExecutionService,
      readiness: ready,
    });
    let incomingRequestId: string | undefined;
    app.addHook("onRequest", async (request) => {
      incomingRequestId = request.id;
    });

    try {
      const response = await app.inject("/api/v1/ideas");
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().meta.requestId).toBe(incomingRequestId);

      const serializer = loggerOptions(config).serializers?.req;
      expect(serializer).toBeTypeOf("function");
      expect(
        serializer?.({
          id: incomingRequestId,
          method: "GET",
          url: "/api/v1/ideas",
        }),
      ).toMatchObject({ requestId: incomingRequestId });
    } finally {
      await app.close();
    }
  });

  it("maps read-side project domain failures to the typed 404 envelope", async () => {
    const missingExecutionService = new Proxy({} as ProjectExecutionService, {
      get(_target, property) {
        if (property === "listProjectHistory") {
          return async () => {
            throw Object.assign(new Error("PROJECT was not found."), {
              code: "PROJECT_NOT_FOUND",
              details: {
                resourceType: "PROJECT",
                resourceId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                recovery: "VERIFY_ID_AND_REFETCH",
              },
            });
          };
        }
        return async () => {
          throw new Error(`UNEXPECTED_SERVICE_CALL:${String(property)}`);
        };
      },
    });
    const app = await buildApp({
      config,
      service: listService,
      executionService: missingExecutionService,
      readiness: ready,
    });

    try {
      const response = await app.inject(
        "/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/history",
      );
      expect(response.statusCode, response.body).toBe(404);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          retryable: false,
          details: {
            resourceType: "PROJECT",
            resourceId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            recovery: "VERIFY_ID_AND_REFETCH",
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
