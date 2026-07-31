import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

export const validHumanControlToken = (
  configuredToken: string,
  supplied: string | undefined,
): boolean =>
  supplied !== undefined &&
  timingSafeEqual(digest(supplied), digest(configuredToken));

export const authenticateHumanControl =
  (configuredToken: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const supplied = request.headers["x-human-control-token"];
    if (
      typeof supplied !== "string" ||
      !validHumanControlToken(configuredToken, supplied)
    ) {
      await reply.code(401).send({
        ok: false,
        error: {
          code: "HUMAN_CONTROL_REQUIRED",
          message: "A valid dedicated human-control credential is required.",
          retryable: false,
          details: {
            recovery: "PROVIDE_VALID_HUMAN_CONTROL_CREDENTIAL",
          },
        },
        meta: { requestId: request.id },
      });
    }
  };
