import { requestDigest, type IdeaService } from "@idea/application";
import {
  CreateIdeaRouteSchema,
  IdeaDetailRouteSchema,
  IdeaListRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope, notFoundError } from "../errors.js";

export const ideaRoutes =
  (service: IdeaService, aiApiToken: string): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/ideas",
      {
        schema: CreateIdeaRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const idempotencyKey = request.headers["idempotency-key"];
        const result = await service.createIdea(request.body, {
          idempotencyKey,
          requestId: request.id,
          requestDigest: requestDigest(
            "POST",
            "/api/v1/ideas",
            {},
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

    app.get("/ideas", { schema: IdeaListRouteSchema }, async (request) => {
      const view = request.query.view ?? "proposer";
      const limit = request.query.limit ?? 20;
      const result = await service.listIdeas(view, limit, request.query.cursor);
      return {
        ok: true as const,
        data: {
          items: result.items,
          page: { limit: result.limit, nextCursor: result.nextCursor },
          view,
        },
        meta: { requestId: request.id },
      };
    });

    app.get(
      "/ideas/:ideaId",
      { schema: IdeaDetailRouteSchema },
      async (request, reply) => {
        const view = request.query.view ?? "proposer";
        const idea = await service.getIdea(request.params.ideaId, view);
        if (idea === null) {
          return reply
            .code(404)
            .send(
              errorEnvelope(
                request.id,
                notFoundError("IDEA", request.params.ideaId),
              ),
            );
        }
        return {
          ok: true as const,
          data: { idea, view },
          meta: { requestId: request.id },
        };
      },
    );
  };
