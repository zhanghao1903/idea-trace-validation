import { requestDigest, type ProjectExecutionService } from "@idea/application";
import {
  ConfirmationCreateRouteSchema,
  ConfirmationDecisionRouteSchema,
  ConfirmationGetRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import {
  authenticateHumanControl,
  validHumanControlToken,
} from "../authenticate-human-control.js";
import {
  confirmationCookie,
  readConfirmationCapability,
} from "../confirmation-cookie.js";
import { errorEnvelope } from "../errors.js";

export const humanConfirmationRoutes =
  (
    service: ProjectExecutionService,
    humanControlToken: string,
  ): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      "/projects/:projectId/human-confirmations",
      {
        schema: ConfirmationCreateRouteSchema,
        preHandler: authenticateHumanControl(humanControlToken),
      },
      async (request, reply) => {
        const result = await service.createConfirmation(
          request.params.projectId,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/projects/:projectId/human-confirmations",
              request.params,
              request.body,
            ),
          },
        );
        if (result.ok) {
          reply.header(
            "set-cookie",
            confirmationCookie({
              confirmationId: result.data.confirmation.id,
              capability: result.capability,
              expiresAt: result.data.confirmation.expiresAt,
            }),
          );
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
      "/human-confirmations/:confirmationId/decisions",
      { schema: ConfirmationDecisionRouteSchema },
      async (request, reply) => {
        const capability = readConfirmationCapability(request.headers.cookie);
        const result = await service.decideConfirmation(
          request.params.confirmationId,
          capability,
          request.body,
          {
            idempotencyKey: request.headers["idempotency-key"],
            requestId: request.id,
            requestDigest: requestDigest(
              "POST",
              "/api/v1/human-confirmations/:confirmationId/decisions",
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

    app.get(
      "/human-confirmations/:confirmationId",
      { schema: ConfirmationGetRouteSchema },
      async (request, reply) => {
        const hasHumanControl =
          typeof request.headers["x-human-control-token"] === "string" &&
          validHumanControlToken(
            humanControlToken,
            request.headers["x-human-control-token"],
          );
        const capability = readConfirmationCapability(request.headers.cookie);
        const hasCapability = await service.validateConfirmationCapability(
          request.params.confirmationId,
          capability,
        );
        if (!hasHumanControl && !hasCapability) {
          return reply.code(401).send(
            errorEnvelope(request.id, {
              code: "HUMAN_CONTROL_REQUIRED",
              message:
                "A valid human-control credential or scoped confirmation capability is required.",
              retryable: false,
              details: {
                recovery: "PROVIDE_VALID_HUMAN_CONTROL_CREDENTIAL",
              },
            }),
          );
        }
        const confirmation = await service.getConfirmation(
          request.params.confirmationId,
        );
        if (confirmation === null) {
          return reply.code(404).send(
            errorEnvelope(request.id, {
              code: "CONFIRMATION_NOT_FOUND",
              message: "The requested human confirmation does not exist.",
              retryable: false,
              details: { recovery: "VERIFY_CONFIRMATION_ID" },
            }),
          );
        }
        return reply.send({
          ok: true,
          data: { confirmation },
          meta: { requestId: request.id },
        });
      },
    );
  };
