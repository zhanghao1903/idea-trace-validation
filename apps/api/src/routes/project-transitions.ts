import { requestDigest, type ProjectExecutionService } from "@idea/application";
import { ProjectTransitionRouteSchema } from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

export const projectTransitionRoutes =
  (
    service: ProjectExecutionService,
    aiApiToken: string,
  ): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/projects/:projectId/transitions",
      {
        schema: ProjectTransitionRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const result = await service.transitionProject(
          request.params.projectId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/projects/:projectId/transitions",
              request.params,
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
