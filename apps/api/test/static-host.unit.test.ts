import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  ExperienceQueryService,
  IdeaService,
  ProjectExecutionService,
  Readiness,
  ReportService,
} from "@idea/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openapiCompatibilityDigest } from "../../../scripts/client-profile/verify.js";
import { buildApp } from "../src/app.js";

const unavailable = new Proxy({} as IdeaService, {
  get() {
    return async () => {
      throw new Error("STATIC_HOST_SERVICE_MUST_NOT_BE_CALLED");
    };
  },
});
const ready: Readiness = {
  async probe() {
    return { status: "READY", checkedAt: Date.now() };
  },
  async current() {
    return { status: "READY", checkedAt: Date.now() };
  },
};
let root = "";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "lp03-static-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(
    path.join(root, "index.html"),
    "<!doctype html><title>LP03_SHELL</title>",
  );
  await writeFile(path.join(root, "assets", "app-deadbeef.js"), "export {};\n");
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("LP-03 static hosting boundary", () => {
  it("serves only known deep links with strict CSP and immutable assets", async () => {
    const app = await buildApp({
      config: {
        nodeEnv: "test",
        host: "127.0.0.1",
        port: 3000,
        databaseUrl: "postgres://example.invalid/idea_validation",
        aiApiToken: "static-host-token-at-least-thirty-two-characters",
        aiWriteDisplayName: "LP-03 report writer",
        aiWriteClient: null,
        humanControlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        logLevel: "silent",
        dbPoolMax: 1,
        dbConnectTimeoutMs: 100,
        shutdownGraceMs: 1_000,
        webDistDir: root,
      },
      service: unavailable,
      executionService: unavailable as unknown as ProjectExecutionService,
      reportService: unavailable as unknown as ReportService,
      experienceService: unavailable as unknown as ExperienceQueryService,
      readiness: ready,
    });
    try {
      const shellPaths = [
        "/",
        "/proposer",
        "/executor",
        "/proposer/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "/executor/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "/confirmations/conf_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      ];
      for (const shellPath of shellPaths) {
        const shell = await app.inject(shellPath);
        expect(shell.statusCode).toBe(200);
        expect(shell.body).toContain("LP03_SHELL");
        expect(shell.headers["cache-control"]).toBe("no-cache");
      }

      const deepLink = await app.inject(shellPaths[3] as string);
      const csp = deepLink.headers["content-security-policy"];
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).not.toContain("unsafe-inline");
      expect(csp).not.toContain("unsafe-eval");

      const asset = await app.inject("/assets/app-deadbeef.js");
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );

      const apiMiss = await app.inject("/api/v1/this-route-does-not-exist");
      expect(apiMiss.statusCode).toBe(404);
      expect(apiMiss.body).not.toContain("LP03_SHELL");
      const uiMiss = await app.inject("/not-a-known-ui-route");
      expect(uiMiss.statusCode).toBe(404);
      expect(uiMiss.body).not.toContain("LP03_SHELL");

      const runtimeResponse = await app.inject("/openapi.json");
      expect(runtimeResponse.statusCode).toBe(200);
      const runtimeOpenapi = runtimeResponse.json() as Record<string, unknown>;
      const frozenOpenapi = JSON.parse(
        await readFile(path.resolve("openapi/lp03.v1.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(runtimeOpenapi).toEqual(frozenOpenapi);
      const frozenDigest = openapiCompatibilityDigest(frozenOpenapi);
      expect(frozenDigest).toBe(
        "5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7",
      );
      expect(openapiCompatibilityDigest(runtimeOpenapi)).toBe(frozenDigest);

      const runtimePaths = runtimeOpenapi.paths as Record<string, unknown>;
      for (const hiddenPath of [
        "/",
        "/proposer",
        "/executor",
        "/proposer/projects/{projectId}",
        "/executor/projects/{projectId}",
        "/confirmations/{confirmationId}",
      ]) {
        expect(runtimePaths).not.toHaveProperty(hiddenPath);
      }
    } finally {
      await app.close();
    }
  });
});
