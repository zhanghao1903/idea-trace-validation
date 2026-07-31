import { describe, expect, it } from "vitest";

import { loggerOptions } from "../src/logger.js";

describe("logging privacy boundary", () => {
  it("redacts credentials, cookies, bodies, database URLs and request digests", () => {
    const options = loggerOptions({ logLevel: "info" });
    expect(options.redact).toMatchObject({
      censor: "[REDACTED]",
      paths: expect.arrayContaining([
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
      ]),
    });
  });
});
