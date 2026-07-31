import { requestDigest, type ProjectExecutionService } from "@idea/application";
import {
  ConclusionCollectionRouteSchema,
  ConclusionCreateRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

export const conclusionRoutes =
  (
    service: ProjectExecutionService,
    aiApiToken: string,
  ): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/projects/:projectId/conclusions",
      {
        schema: ConclusionCreateRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const result = await service.createConclusion(
          request.params.projectId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/projects/:projectId/conclusions",
              request.params,
              request.body,
            ),
          },
        );
        if (result.ok) {
          return reply.code(201).send({
            ok: true,
            data: result.data,
            meta: {
              requestId: result.requestId,
              idempotentReplay: result.idempotentReplay,
            },
          });
        }
        return reply
          .code(result.status as 400)
          .send(errorEnvelope(result.requestId, result.error));
      },
    );

    app.get(
      "/projects/:projectId/conclusions",
      { schema: ConclusionCollectionRouteSchema },
      async (request) => {
        const page = await service.listConclusions(
          request.params.projectId,
          request.query.limit ?? 20,
          request.query.cursor,
        );
        return {
          ok: true as const,
          data: {
            items: page.items,
            page: { limit: page.limit, nextCursor: page.nextCursor },
          },
          meta: { requestId: request.id },
        };
      },
    );
  };
