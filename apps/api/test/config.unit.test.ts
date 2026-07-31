import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.js";

const valid = {
  DATABASE_URL: "postgres://user:password@127.0.0.1:5432/idea_validation",
  AI_API_TOKEN: "a-token-that-is-at-least-thirty-two-characters",
  HUMAN_CONTROL_TOKEN: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

describe("runtime configuration", () => {
  it("applies only the documented defaults", () => {
    expect(loadConfig(valid)).toMatchObject({
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 3000,
      dbPoolMax: 10,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 10_000,
    });
  });

  it("does not accept AI_WRITE_TOKEN as an alias", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: valid.DATABASE_URL,
        AI_WRITE_TOKEN: valid.AI_API_TOKEN,
      }),
    ).toThrowError(ConfigError);
  });

  it("reports only the invalid field name", () => {
    expect(() => loadConfig({ ...valid, PORT: "70000" })).toThrowError(
      "Invalid or missing configuration field: PORT",
    );
  });

  it("requires a distinct 32-byte base64url human-control token", () => {
    expect(() =>
      loadConfig({ ...valid, HUMAN_CONTROL_TOKEN: valid.AI_API_TOKEN }),
    ).toThrowError(
      "Invalid or missing configuration field: HUMAN_CONTROL_TOKEN",
    );
    expect(() =>
      loadConfig({ ...valid, HUMAN_CONTROL_TOKEN: "too-short" }),
    ).toThrowError(
      "Invalid or missing configuration field: HUMAN_CONTROL_TOKEN",
    );
    expect(() =>
      loadConfig({
        ...valid,
        HUMAN_CONTROL_TOKEN: `${valid.HUMAN_CONTROL_TOKEN.slice(0, -1)}B`,
      }),
    ).toThrowError(
      "Invalid or missing configuration field: HUMAN_CONTROL_TOKEN",
    );
  });
});
