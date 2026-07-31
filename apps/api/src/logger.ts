import type { LoggerOptions } from "pino";

import type { AppConfig } from "./config.js";

export const loggerOptions = (
  config: Pick<AppConfig, "logLevel">,
): LoggerOptions => ({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-human-control-token",
      "res.headers.set-cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "request.headers.x-human-control-token",
      "body",
      "databaseUrl",
      "DATABASE_URL",
      "AI_API_TOKEN",
      "HUMAN_CONTROL_TOKEN",
      "*.payloadDigest",
      "*.capabilityHash",
      "*.requestDigest",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req: (request: { id?: string; method?: string; url?: string }) => ({
      requestId: request.id,
      method: request.method,
      route: request.url?.split("?")[0],
    }),
  },
});
