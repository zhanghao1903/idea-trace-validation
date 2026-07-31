import { requestDigest, type ProjectExecutionService } from "@idea/application";
import {
  AttentionCollectionRouteSchema,
  AttentionCreateRouteSchema,
  AttentionEventRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

export const attentionItemRoutes =
  (
    service: ProjectExecutionService,
    aiApiToken: string,
  ): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/projects/:projectId/attention-items",
      {
        schema: AttentionCreateRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const result = await service.createAttentionItem(
          request.params.projectId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/projects/:projectId/attention-items",
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

    app.post(
      "/projects/:projectId/attention-items/:itemId/events",
      {
        schema: AttentionEventRouteSchema,
        preHandler: authenticateWrite(aiApiToken),
      },
      async (request, reply) => {
        const result = await service.appendAttentionEvent(
          request.params.projectId,
          request.params.itemId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/projects/:projectId/attention-items/:itemId/events",
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
      "/projects/:projectId/attention-items",
      { schema: AttentionCollectionRouteSchema },
      async (request) => {
        const page = await service.listAttentionItems(
          request.params.projectId,
          request.query.limit ?? 20,
          request.query.cursor,
          {
            ...(request.query.type === undefined
              ? {}
              : { type: request.query.type }),
            ...(request.query.status === undefined
              ? {}
              : { status: request.query.status }),
          },
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
