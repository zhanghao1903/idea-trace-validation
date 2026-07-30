import { requestDigest, type IdeaService } from "@idea/application";
import { PromoteIdeaRouteSchema } from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

export const promotionRoutes =
  (service: IdeaService, aiApiToken: string): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/ideas/:ideaId/promotions",
      {
        schema: PromoteIdeaRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const { ideaId } = request.params;
        const result = await service.promoteIdea(ideaId, request.body, {
          idempotencyKey: request.headers["idempotency-key"],
          requestId: request.id,
          requestDigest: requestDigest(
            "POST",
            "/api/v1/ideas/:ideaId/promotions",
            { ideaId },
            request.body,
          ),
        });
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
  };
