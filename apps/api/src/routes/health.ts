import type { Readiness } from "@idea/application";
import { LiveRouteSchema, ReadyRouteSchema } from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { errorEnvelope } from "../errors.js";

export const healthRoutes =
  (readiness: Readiness): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.get("/health/live", { schema: LiveRouteSchema }, async (request) => ({
      ok: true as const,
      data: { status: "live" as const },
      meta: { requestId: request.id },
    }));

    app.get(
      "/health/ready",
      { schema: ReadyRouteSchema },
      async (request, reply) => {
        const state = await readiness.probe();
        if (state.status === "READY") {
          return {
            ok: true as const,
            data: { status: "ready" as const },
            meta: { requestId: request.id },
          };
        }
        return reply.code(503).send(
          errorEnvelope(request.id, {
            code: "SERVICE_NOT_READY",
            message: "The service is not ready to serve business requests.",
            retryable: true,
            details: { reason: state.reason, recovery: "RETRY_LATER" },
          }),
        );
      },
    );
  };
