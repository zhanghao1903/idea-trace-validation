import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

export const authenticateWrite =
  (configuredToken: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorization = request.headers.authorization;
    const supplied =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    if (
      supplied === "" ||
      !timingSafeEqual(digest(supplied), digest(configuredToken))
    ) {
      await reply.code(401).send({
        ok: false,
        error: {
          code: "WRITE_CREDENTIAL_REQUIRED",
          message: "A valid AI write credential is required.",
          retryable: false,
          details: { recovery: "PROVIDE_VALID_WRITE_CREDENTIAL" },
        },
        meta: { requestId: request.id },
      });
    }
  };
