import { createIdFactory, requestDigest } from "@idea/application";
import {
  createPool,
  migrate,
  PostgresExperienceQueryService,
  PostgresIdeaService,
  PostgresProjectExecutionService,
  PostgresReadiness,
  PostgresReportService,
} from "@idea/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const aiToken = "lp03-experience-token-at-least-thirty-two-characters";
const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
const ids = createIdFactory();
const ideaService = new PostgresIdeaService(pool);
let app: FastifyInstance;

const actor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "Experience API test",
};
const proposer = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

const createIdea = async (name: string, shouldPromote: boolean) => {
  const input = {
    intentSummary: `Experience ${name}`,
    proposer,
    desiredOutcome: `Outcome ${name}`,
    facts: [],
    hypotheses: [{ text: `Hypothesis ${name}` }],
    clarificationQuestions: [],
    actor,
    reason: "Create API fixture",
  };
  const created = await ideaService.createIdea(input, {
    idempotencyKey: `experience-create-${name}`,
    requestId: ids.request(),
    requestDigest: requestDigest("POST", "/api/v1/ideas", {}, input),
  });
  if (!created.ok) throw new Error("CREATE_FAILED");
  if (!shouldPromote) return { idea: created.data.idea, project: null };
  const body = {
    expectedVersion: created.data.idea.version,
    explicitIntent: "PROMOTE" as const,
    actor: proposer,
    reason: "Promote API fixture",
  };
  const promoted = await ideaService.promoteIdea(created.data.idea.id, body, {
    idempotencyKey: `experience-promote-${name}`,
    requestId: ids.request(),
    requestDigest: requestDigest(
      "POST",
      "/api/v1/ideas/:ideaId/promotions",
      { ideaId: created.data.idea.id },
      body,
    ),
  });
  if (!promoted.ok) throw new Error("PROMOTE_FAILED");
  return { idea: promoted.data.idea, project: promoted.data.project.authority };
};

beforeAll(async () => {
  await migrate(pool);
  await pool.query(`
    TRUNCATE TABLE audit_events,project_hypotheses,validation_projects,
      clarification_answers,clarification_questions,idea_statements,
      idempotency_records,ideas CASCADE
  `);
  app = await buildApp({
    config: {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3000,
      databaseUrl,
      aiApiToken: aiToken,
      aiWriteDisplayName: "LP-03 report writer",
      aiWriteClient: null,
      humanControlToken: humanToken,
      logLevel: "silent",
      dbPoolMax: 8,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 1_000,
    },
    service: ideaService,
    executionService: new PostgresProjectExecutionService(pool, humanToken),
    reportService: new PostgresReportService(pool),
    experienceService: new PostgresExperienceQueryService(pool),
    readiness: new PostgresReadiness(pool),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("LP-03 public experience API", () => {
  it("serves role projections, filters, cursors and identical authority IDs", async () => {
    const first = await createIdea("first", true);
    const second = await createIdea("second", true);
    await createIdea("unpromoted", false);
    if (first.project === null || second.project === null)
      throw new Error("PROJECT_FIXTURE_MISSING");

    const proposerResponse = await app.inject({
      method: "GET",
      url: "/api/v1/experience/proposer/ideas?limit=2",
    });
    expect(proposerResponse.statusCode, proposerResponse.body).toBe(200);
    expect(proposerResponse.json()).toMatchObject({
      ok: true,
      data: { page: { limit: 2 } },
    });
    expect(proposerResponse.json().data.items).toHaveLength(2);
    expect(proposerResponse.json().data.page.nextCursor).toBeTypeOf("string");
    const next = await app.inject({
      method: "GET",
      url: `/api/v1/experience/proposer/ideas?limit=2&cursor=${proposerResponse.json().data.page.nextCursor}`,
    });
    expect(next.statusCode, next.body).toBe(200);
    expect(next.json().data.items).toHaveLength(1);

    const filtered = await app.inject(
      "/api/v1/experience/proposer/ideas?category=AWAITING_EXECUTION",
    );
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json().data.items).toHaveLength(2);
    expect(
      filtered
        .json()
        .data.items.every(
          (item: { category: string }) =>
            item.category === "AWAITING_EXECUTION",
        ),
    ).toBe(true);

    const executor = await app.inject(
      "/api/v1/experience/executor/projects?group=OPEN",
    );
    expect(executor.statusCode, executor.body).toBe(200);
    expect(executor.json().data.items).toHaveLength(2);
    const experienceId = executor.json().data.items[0].projectId;
    const legacy = await app.inject(
      `/api/v1/projects/${experienceId}?view=executor`,
    );
    expect(legacy.statusCode, legacy.body).toBe(200);
    expect(legacy.json().data.project.authority.id).toBe(experienceId);
    expect(legacy.json().data.project.authority.version).toBe(
      executor.json().data.items[0].version,
    );

    const detail = await app.inject(
      `/api/v1/experience/projects/${experienceId}?view=PROPOSER`,
    );
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({
      ok: true,
      data: {
        view: "PROPOSER",
        authority: { id: experienceId },
        previewCounts: {
          progressUpdates: 0,
          attentionItems: 0,
          evidence: 0,
          conclusions: 0,
          confirmations: 0,
        },
      },
    });
  });

  it("keeps reads public and returns stable validation/not-found envelopes", async () => {
    const invalidCursor = await app.inject(
      "/api/v1/experience/executor/projects?cursor=not-a-cursor",
    );
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json().error.code).toBe("VALIDATION_FAILED");

    const missing = await app.inject(
      `/api/v1/experience/projects/${ids.project()}?view=EXECUTOR`,
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("PROJECT_NOT_FOUND");

    const invalidFilter = await app.inject(
      "/api/v1/experience/proposer/ideas?category=QUEUED",
    );
    expect(invalidFilter.statusCode).toBe(400);
    expect(invalidFilter.json().error.code).toBe("VALIDATION_FAILED");
  });
});
