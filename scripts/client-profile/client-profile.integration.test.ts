import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json.js";
import type { DeploymentConnectionHandoffV1 } from "./contracts.js";
import { initializeProfile } from "./initialize.js";
import { openapiCompatibilityDigest, verifyConnection } from "./verify.js";

const REQUEST_ID = "req_01KYZMC5YD76BMCGXBCPERA3M1";
const IDEA_ID = "idea_01KYZMC5YD76BMCGXBCPERA3M1";
const TOKEN = "isolated-ai-token-abcdefghijklmnopqrstuvwxyz-123456";

const roots: string[] = [];
let priorToken: string | undefined;

const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), "client-profile-integration-"));
  roots.push(root);
  return root;
};

beforeEach(() => {
  priorToken = process.env.IDEA_VALIDATION_AI_TOKEN;
});

afterEach(() => {
  if (priorToken === undefined) delete process.env.IDEA_VALIDATION_AI_TOKEN;
  else process.env.IDEA_VALIDATION_AI_TOKEN = priorToken;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const json = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
};

const startFixture = async () => {
  const openapi = JSON.parse(
    readFileSync(path.resolve("openapi/lp03.v1.json"), "utf8"),
  ) as unknown;
  let storedProposer: unknown;
  let writes = 0;
  const server = createServer(async (request, response) => {
    if (request.url === "/health/live")
      return json(response, 200, {
        ok: true,
        data: { status: "live" },
        meta: { requestId: REQUEST_ID },
      });
    if (request.url === "/health/ready")
      return json(response, 200, {
        ok: true,
        data: { status: "ready" },
        meta: { requestId: REQUEST_ID },
      });
    if (request.url === "/openapi.json") return json(response, 200, openapi);
    if (request.url === "/api/v1/ideas" && request.method === "POST") {
      if (request.headers.authorization !== `Bearer ${TOKEN}`)
        return json(response, 401, {
          ok: false,
          error: { code: "WRITE_CREDENTIAL_REQUIRED" },
          meta: { requestId: REQUEST_ID },
        });
      const body = JSON.parse(await readBody(request)) as Record<
        string,
        unknown
      >;
      storedProposer = body.proposer;
      writes += 1;
      return json(response, 201, {
        ok: true,
        data: {
          idea: { id: IDEA_ID },
          created: { statementIds: [], questionIds: [] },
        },
        meta: { requestId: REQUEST_ID, idempotentReplay: writes > 1 },
      });
    }
    if (request.url === `/api/v1/ideas/${IDEA_ID}` && request.method === "GET")
      return json(response, 200, {
        ok: true,
        data: { idea: { id: IDEA_ID, proposer: storedProposer } },
        meta: { requestId: REQUEST_ID },
      });
    return json(response, 404, { ok: false });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("FIXTURE_ADDRESS");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    openapi,
    writes: () => writes,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      ),
  };
};

describe("client initialization over real HTTP", () => {
  it("creates a verified profile, preserves exact bytes on replay and gates replacement", async () => {
    const fixture = await startFixture();
    try {
      const root = temporaryRoot();
      const handoffPath = path.join(root, "handoff.json");
      const outputPath = path.join(root, "profile.json");
      const handoff: DeploymentConnectionHandoffV1 = {
        schemaVersion: 1,
        kind: "idea-validation-deployment-handoff",
        baseUrl: fixture.baseUrl,
        openapiUrl: `${fixture.baseUrl}/openapi.json`,
        releaseId: "isolated-release",
        sourceCommit: "a".repeat(40),
        skillCommit: "b".repeat(40),
        skillVersion: "0.1.0",
        openapiSha256: openapiCompatibilityDigest(fixture.openapi),
        declaredAiScopes: ["idea:write"],
        credentialId: "isolated-ai",
        expiresAt: null,
        issuedAt: "2026-08-05T00:00:00Z",
      };
      writeFileSync(handoffPath, canonicalJson(handoff), { mode: 0o600 });
      process.env.IDEA_VALIDATION_AI_TOKEN = TOKEN;
      const common = {
        handoffPath,
        clientId: "codex-isolated-01",
        displayName: "Codex isolated client",
        credentialSource: {
          kind: "ENV" as const,
          name: "IDEA_VALIDATION_AI_TOKEN",
        },
        outputPath,
        skillRoot: path.resolve("skills"),
        allowLoopbackHttp: true,
        verifySyntheticWrite: true,
        now: () => "2026-08-05T00:01:00Z",
      };
      const first = await initializeProfile(common);
      expect(first.credentialVerified).toBe(true);
      expect(first.profile.validation.credentialEvidence).toMatchObject({
        requestId: REQUEST_ID,
        resourceId: IDEA_ID,
        observedClient: common.clientId,
        observedDisplayName: common.displayName,
      });
      const bytes = readFileSync(outputPath, "utf8");
      const replay = await initializeProfile({
        ...common,
        now: () => "2026-08-05T02:00:00Z",
      });
      expect(replay.changed).toBe(false);
      expect(readFileSync(outputPath, "utf8")).toBe(bytes);
      expect(fixture.writes()).toBe(2);

      await expect(
        initializeProfile({ ...common, displayName: "Changed client" }),
      ).rejects.toThrow("PROFILE_UPDATE_REQUIRED");
      const replaced = await initializeProfile({
        ...common,
        displayName: "Changed client",
        replace: true,
      });
      expect(replaced.profile.profileRevision).toBe(2);
    } finally {
      await fixture.close();
    }
  });

  it("keeps credential usability unverified for the wrong token without creating data", async () => {
    const fixture = await startFixture();
    try {
      const root = temporaryRoot();
      const handoffPath = path.join(root, "handoff.json");
      const outputPath = path.join(root, "profile.json");
      writeFileSync(
        handoffPath,
        canonicalJson({
          schemaVersion: 1,
          kind: "idea-validation-deployment-handoff",
          baseUrl: fixture.baseUrl,
          openapiUrl: `${fixture.baseUrl}/openapi.json`,
          releaseId: "isolated-release",
          sourceCommit: "a".repeat(40),
          skillCommit: "b".repeat(40),
          skillVersion: "0.1.0",
          openapiSha256: openapiCompatibilityDigest(fixture.openapi),
          declaredAiScopes: ["idea:write"],
          credentialId: "isolated-ai",
          expiresAt: null,
          issuedAt: "2026-08-05T00:00:00Z",
        }),
        { mode: 0o600 },
      );
      process.env.IDEA_VALIDATION_AI_TOKEN =
        "wrong-ai-token-abcdefghijklmnopqrstuvwxyz-123456";
      const result = await initializeProfile({
        handoffPath,
        clientId: "claude-isolated-01",
        displayName: "Claude isolated client",
        credentialSource: { kind: "ENV", name: "IDEA_VALIDATION_AI_TOKEN" },
        outputPath,
        skillRoot: path.resolve("skills"),
        allowLoopbackHttp: true,
        verifySyntheticWrite: true,
      });
      expect(result.credentialVerified).toBe(false);
      expect(result.profile.validation.credentialEvidence).toBeNull();
      expect(fixture.writes()).toBe(0);
      expect(readFileSync(outputPath, "utf8")).not.toContain(
        process.env.IDEA_VALIDATION_AI_TOKEN,
      );
    } finally {
      await fixture.close();
    }
  });

  it("rejects redirects without following them", async () => {
    let redirected = 0;
    const server = createServer((request, response) => {
      if (request.url === "/health/live") {
        response.writeHead(302, {
          location: "/redirect-target",
          "content-type": "application/json",
        });
        return response.end(JSON.stringify({ ok: false }));
      }
      redirected += 1;
      return json(response, 200, {
        ok: true,
        data: { status: "live" },
        meta: { requestId: REQUEST_ID },
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("FIXTURE_ADDRESS");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      await expect(
        verifyConnection({
          schemaVersion: 1,
          kind: "idea-validation-deployment-handoff",
          baseUrl,
          openapiUrl: `${baseUrl}/openapi.json`,
          releaseId: "redirect-release",
          sourceCommit: "a".repeat(40),
          skillCommit: "b".repeat(40),
          skillVersion: "0.1.0",
          openapiSha256: "c".repeat(64),
          declaredAiScopes: ["idea:write"],
          credentialId: "isolated-ai",
          expiresAt: null,
          issuedAt: "2026-08-05T00:00:00Z",
        }),
      ).rejects.toThrow("REDIRECT_REJECTED");
      expect(redirected).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
  });
});
