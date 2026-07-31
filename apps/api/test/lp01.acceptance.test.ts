import {
  createPool,
  migrate,
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
const token = "acceptance-token-that-is-at-least-thirty-two-characters";
const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
let app: FastifyInstance;
const observedRequests: { id: string; method: string; url: string }[] = [];

const writeHeaders = (key: string) => ({
  authorization: `Bearer ${token}`,
  "idempotency-key": key,
  "content-type": "application/json",
});

beforeAll(async () => {
  await migrate(pool);
  await pool.query(`
    TRUNCATE TABLE
      audit_events,
      project_hypotheses,
      validation_projects,
      clarification_answers,
      clarification_questions,
      idea_statements,
      idempotency_records,
      ideas
    CASCADE
  `);
  app = await buildApp({
    config: {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3000,
      databaseUrl,
      aiApiToken: token,
      aiWriteDisplayName: "LP-03 report writer",
      aiWriteClient: null,
      humanControlToken: humanToken,
      logLevel: "silent",
      dbPoolMax: 8,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 1_000,
    },
    service: new PostgresIdeaService(pool),
    executionService: new PostgresProjectExecutionService(pool, humanToken),
    reportService: new PostgresReportService(pool),
    readiness: new PostgresReadiness(pool),
  });
  app.addHook("onRequest", async (request) => {
    observedRequests.push({
      id: request.id,
      method: request.method,
      url: request.url,
    });
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("LP1-AC-014 objective flow", () => {
  it("creates, clarifies, explicitly promotes, reads and audits one Idea", async () => {
    const createBody = {
      intentSummary: "Validate a traceable CEO idea workflow",
      proposer: {
        actorType: "HUMAN",
        role: "PROPOSER",
        displayName: "CEO",
      },
      facts: [{ text: "The repository started as documentation only" }],
      hypotheses: [],
      clarificationQuestions: [],
      actor: {
        actorType: "AI",
        role: "EXECUTOR",
        displayName: "Codex",
        client: "acceptance-test",
        onBehalfOfRole: "PROPOSER",
      },
      reason: "Record the initial incomplete Idea",
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ideas",
      headers: writeHeaders("acceptance-create"),
      payload: createBody,
    });
    expect(created.statusCode, created.body).toBe(201);
    const createEnvelope = created.json();
    expect(createEnvelope.data.idea.intakeStatus).toBe("NEEDS_CLARIFICATION");
    const firstProcessing = observedRequests.at(-1);
    expect(firstProcessing).toMatchObject({
      method: "POST",
      url: "/api/v1/ideas",
    });
    expect(createEnvelope.meta.requestId).toBe(firstProcessing?.id);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/ideas",
      headers: writeHeaders("acceptance-create"),
      payload: createBody,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().meta).toMatchObject({
      requestId: createEnvelope.meta.requestId,
      idempotentReplay: true,
    });
    expect(observedRequests.at(-1)?.id).not.toBe(createEnvelope.meta.requestId);

    const ideaId = createEnvelope.data.idea.id as string;
    const initialDetail = await app.inject(`/api/v1/ideas/${ideaId}`);
    expect(initialDetail.statusCode, initialDetail.body).toBe(200);
    const questions = initialDetail.json().data.idea.clarificationQuestions as {
      id: string;
      targetField: string;
    }[];
    const outcomeQuestion = questions.find(
      (question) => question.targetField === "DESIRED_OUTCOME",
    );
    const hypothesisQuestion = questions.find(
      (question) => question.targetField === "HYPOTHESIS",
    );
    expect(outcomeQuestion).toBeDefined();
    expect(hypothesisQuestion).toBeDefined();

    const outcomeAnswer = await app.inject({
      method: "POST",
      url: `/api/v1/ideas/${ideaId}/clarifications/${outcomeQuestion?.id}/answers`,
      headers: writeHeaders("acceptance-outcome-answer"),
      payload: {
        expectedVersion: 1,
        answerText: "We need a measurable validation outcome.",
        desiredOutcomeRevision:
          "Confirm that traceability reduces lost decision context",
        newFacts: [],
        newHypotheses: [],
        actor: {
          actorType: "HUMAN",
          role: "PROPOSER",
          displayName: "CEO",
        },
        reason: "Supply the desired outcome",
      },
    });
    expect(outcomeAnswer.statusCode, outcomeAnswer.body).toBe(200);
    expect(outcomeAnswer.json().data.openQuestionCount).toBe(1);

    const hypothesisAnswer = await app.inject({
      method: "POST",
      url: `/api/v1/ideas/${ideaId}/clarifications/${hypothesisQuestion?.id}/answers`,
      headers: writeHeaders("acceptance-hypothesis-answer"),
      payload: {
        expectedVersion: 2,
        answerText:
          "Teams lose context when evidence and decisions live apart.",
        newFacts: [],
        newHypotheses: [
          {
            text: "A shared trace will reduce time spent reconstructing decisions",
          },
        ],
        actor: {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "Codex",
          client: "acceptance-test",
          onBehalfOfRole: "PROPOSER",
        },
        reason: "Record the explicit hypothesis",
      },
    });
    expect(hypothesisAnswer.statusCode, hypothesisAnswer.body).toBe(200);
    expect(hypothesisAnswer.json().data.idea).toMatchObject({
      intakeStatus: "IDEA",
      version: 3,
    });

    const promoted = await app.inject({
      method: "POST",
      url: `/api/v1/ideas/${ideaId}/promotions`,
      headers: writeHeaders("acceptance-promotion"),
      payload: {
        expectedVersion: 3,
        explicitIntent: "PROMOTE",
        actor: {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "Codex",
          client: "acceptance-test",
          onBehalfOfRole: "PROPOSER",
        },
        reason: "Explicitly begin validation planning",
      },
    });
    expect(promoted.statusCode, promoted.body).toBe(201);
    const promotionData = promoted.json().data;
    expect(promotionData.project.authority).toMatchObject({
      phase: "PLANNING",
      status: "QUEUED",
      sourceIdeaVersion: 3,
    });
    expect(promotionData.project.hypotheses).toHaveLength(1);

    const projectId = promotionData.project.authority.id as string;
    const project = await app.inject(
      `/api/v1/projects/${projectId}?view=executor`,
    );
    expect(project.statusCode, project.body).toBe(200);
    expect(project.json().data.project.focus).toMatchObject({
      view: "executor",
      execution: { phase: "PLANNING", status: "QUEUED" },
    });

    const finalIdea = await app.inject(`/api/v1/ideas/${ideaId}?view=proposer`);
    expect(finalIdea.statusCode, finalIdea.body).toBe(200);
    expect(finalIdea.json().data.idea).toMatchObject({
      authority: { projectId, version: 4 },
    });
    expect(finalIdea.json().data.idea.history).toHaveLength(4);
    expect(
      finalIdea
        .json()
        .data.idea.history.find(
          (event: { eventType: string }) => event.eventType === "IDEA_CREATED",
        ).requestId,
    ).toBe(createEnvelope.meta.requestId);
  });

  it("requires the write credential before exposing idempotency state", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ideas",
      headers: { "idempotency-key": "acceptance-create" },
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(400);
    // Schema validation occurs before route-level authentication. A valid body
    // with a missing credential exercises the actual credential boundary.
    const validBody = {
      intentSummary: "Another idea",
      proposer: { actorType: "HUMAN", role: "PROPOSER", displayName: "CEO" },
      facts: [],
      hypotheses: [{ text: "A hypothesis" }],
      clarificationQuestions: [],
      actor: { actorType: "HUMAN", role: "PROPOSER", displayName: "CEO" },
      reason: "Test authentication",
    };
    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/v1/ideas",
      headers: {
        "idempotency-key": "acceptance-create",
        "content-type": "application/json",
      },
      payload: validBody,
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().error.code).toBe("WRITE_CREDENTIAL_REQUIRED");
  });
});
