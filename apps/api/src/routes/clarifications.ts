import { requestDigest, type IdeaService } from "@idea/application";
import { AnswerClarificationRouteSchema } from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

export const clarificationRoutes =
  (service: IdeaService, aiApiToken: string): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/ideas/:ideaId/clarifications/:questionId/answers",
      {
        schema: AnswerClarificationRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const { ideaId, questionId } = request.params;
        const result = await service.answerClarification(
          ideaId,
          questionId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/ideas/:ideaId/clarifications/:questionId/answers",
              { ideaId, questionId },
              request.body,
            ),
          },
        );
        if (result.ok) {
          return reply.code(200).send({
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
