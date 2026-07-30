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
        "res.headers.set-cookie",
        "body",
        "databaseUrl",
        "AI_API_TOKEN",
        "*.requestDigest",
      ]),
    });
  });
});
