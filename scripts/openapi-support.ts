import type { IdeaService, Readiness } from "@idea/application";

import { buildApp } from "../apps/api/src/app.js";

const unavailableService = new Proxy({} as IdeaService, {
  get() {
    return async () => {
      throw new Error("OPENAPI_SERVICE_MUST_NOT_BE_CALLED");
    };
  },
});

const ready: Readiness = {
  async probe() {
    return { status: "READY", checkedAt: Date.now() };
  },
  async current() {
    return { status: "READY", checkedAt: Date.now() };
  },
};

export const generateOpenApi = async (): Promise<
  Readonly<Record<string, unknown>>
> => {
  const app = await buildApp({
    config: {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3000,
      databaseUrl: "postgres://example.invalid/idea_validation",
      aiApiToken: "openapi-generation-token-at-least-32-characters",
      logLevel: "silent",
      dbPoolMax: 1,
      dbConnectTimeoutMs: 100,
      shutdownGraceMs: 1_000,
    },
    service: unavailableService,
    readiness: ready,
  });
  try {
    await app.ready();
    return app.swagger() as Readonly<Record<string, unknown>>;
  } finally {
    await app.close();
  }
};
