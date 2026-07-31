import {
  createPool,
  migrate,
  PostgresIdeaService,
  PostgresProjectExecutionService,
  PostgresReadiness,
} from "@idea/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const aiToken = "lp02-ai-token-that-is-at-least-thirty-two-characters";
const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
let app: FastifyInstance;

const aiHeaders = (key: string) => ({
  authorization: `Bearer ${aiToken}`,
  "idempotency-key": key,
  "content-type": "application/json",
});
const humanHeaders = (key: string) => ({
  "x-human-control-token": humanToken,
  "idempotency-key": key,
  "content-type": "application/json",
});
const aiActor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "Codex",
  client: "lp02-acceptance",
};
const humanActor = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

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
      aiApiToken: aiToken,
      humanControlToken: humanToken,
      logLevel: "silent",
      dbPoolMax: 8,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 1_000,
    },
    service: new PostgresIdeaService(pool),
    executionService: new PostgresProjectExecutionService(pool, humanToken),
    readiness: new PostgresReadiness(pool),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("LP2-AC-016 objective API scenario", () => {
  it("executes, records three attention classes, completes by human confirmation, and reopens", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/ideas",
      headers: aiHeaders("lp02-api-create"),
      payload: {
        intentSummary: "Validate one traceable execution and decision loop",
        proposer: humanActor,
        desiredOutcome: "Make a human-confirmed evidence-backed decision",
        facts: [{ text: "LP-01 created the project authority" }],
        hypotheses: [{ text: "A bounded loop preserves decision context" }],
        clarificationQuestions: [],
        actor: aiActor,
        reason: "Create the acceptance Idea",
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    const ideaId = create.json().data.idea.id as string;

    const promote = await app.inject({
      method: "POST",
      url: `/api/v1/ideas/${ideaId}/promotions`,
      headers: aiHeaders("lp02-api-promote"),
      payload: {
        expectedVersion: 1,
        explicitIntent: "PROMOTE",
        actor: humanActor,
        reason: "Start the acceptance project",
      },
    });
    expect(promote.statusCode, promote.body).toBe(201);
    const projectId = promote.json().data.project.authority.id as string;

    const start = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/transitions`,
      headers: aiHeaders("lp02-api-start"),
      payload: {
        expectedVersion: 1,
        transition: "START",
        nextStep: "Record one objective signal",
        actor: aiActor,
        reason: "Begin execution",
      },
    });
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().data.project).toMatchObject({
      status: "IN_PROGRESS",
      version: 2,
    });

    const evidence = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/evidence`,
      headers: aiHeaders("lp02-api-evidence"),
      payload: {
        expectedVersion: 2,
        kind: "LINK",
        title: "Interview synthesis",
        summary: "The bounded interview round is complete",
        locator: "https://example.test/evidence/interview-synthesis",
        capturedAt: "2026-07-31T03:00:00.000Z",
        actor: aiActor,
        reason: "Record the source metadata without fetching it",
      },
    });
    expect(evidence.statusCode, evidence.body).toBe(201);
    const evidenceId = evidence.json().data.evidence.id as string;

    const progress = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/progress-updates`,
      headers: aiHeaders("lp02-api-progress"),
      payload: {
        expectedVersion: 3,
        summary: "Interview synthesis completed",
        completedWork: ["Collected and synthesized the target interviews"],
        nextStep: "Resolve the three execution attention classes",
        evidenceIds: [evidenceId],
        occurredAt: "2026-07-31T03:05:00.000Z",
        actor: aiActor,
        reason: "Record evidence-backed progress",
      },
    });
    expect(progress.statusCode, progress.body).toBe(201);
    expect(progress.json().data.project).toMatchObject({
      status: "IN_PROGRESS",
      phase: "PLANNING",
      version: 4,
    });

    const attentionInputs = [
      {
        type: "BLOCKER",
        title: "Missing threshold",
        background: "The decision threshold must be explicit",
        impact: "The conclusion cannot be interpreted without it",
      },
      {
        type: "DECISION_REQUEST",
        title: "Choose the threshold",
        background: "The planned evidence is available",
        decisionImpact: "The choice determines whether to conclude",
        waitingForRole: "PROPOSER",
        options: ["Proceed", "Collect more"],
        recommendation: "Proceed",
      },
      {
        type: "SUPPORT_REQUEST",
        title: "Review the synthesis",
        supportNeeded: "Review the evidence summary",
        requestReason: "A second human reading reduces ambiguity",
        impact: "The final conclusion will cite the reviewed summary",
        expectedResponderRole: "PROPOSER",
      },
    ] as const;
    const attentionIds: string[] = [];
    let version = 4;
    for (const [index, input] of attentionInputs.entries()) {
      const opened = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/attention-items`,
        headers: aiHeaders(`lp02-api-attention-${index}`),
        payload: {
          expectedVersion: version,
          ...input,
          actor: aiActor,
          reason: `Open ${input.type}`,
        },
      });
      expect(opened.statusCode, opened.body).toBe(201);
      version += 1;
      attentionIds.push(opened.json().data.attentionItem.id as string);
    }
    const resolutionPayloads = [
      {
        kind: "RESOLVE",
        message: "The threshold is now explicit",
        resolution: "Proceed when all five planned interviews are complete",
      },
      {
        kind: "RESOLVE",
        message: "Use the planned threshold",
        selectedOption: "Proceed",
      },
      {
        kind: "RESOLVE",
        message: "The synthesis was reviewed",
        supportSummary: "The evidence summary matches the interview notes",
      },
    ] as const;
    for (const [index, resolution] of resolutionPayloads.entries()) {
      const itemId = attentionIds[index];
      if (itemId === undefined) throw new Error("ATTENTION_ID_MISSING");
      const resolved = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/attention-items/${itemId}/events`,
        headers: aiHeaders(`lp02-api-attention-resolve-${index}`),
        payload: {
          expectedVersion: version,
          ...resolution,
          actor: humanActor,
          reason: `Resolve ${attentionInputs[index]?.type ?? "attention"}`,
        },
      });
      expect(resolved.statusCode, resolved.body).toBe(201);
      expect(resolved.json().data.attentionItem.status).toBe("RESOLVED");
      version += 1;
    }
    expect(version).toBe(10);

    const conclusion = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/conclusions`,
      headers: aiHeaders("lp02-api-conclusion"),
      payload: {
        expectedVersion: version,
        evidenceSummary:
          "The planned interviews completed and all execution questions were resolved",
        evidenceIds: [evidenceId],
        limitations: ["The validation sample is intentionally bounded"],
        uncertainties: ["Long-term retention remains unobserved"],
        recommendation: "CONTINUE",
        recommendationNote: "Continue to the next lightweight plan",
        actor: aiActor,
        reason: "Record the objective conclusion",
      },
    });
    expect(conclusion.statusCode, conclusion.body).toBe(201);
    const conclusionId = conclusion.json().data.conclusion.id as string;
    version += 1;

    const aiCannotCreateConfirmation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/human-confirmations`,
      headers: aiHeaders("lp02-api-ai-confirmation"),
      payload: {
        expectedVersion: version,
        operation: "COMPLETE_PROJECT",
        conclusionId,
        completionSummary: "Complete the validation objective",
        actor: humanActor,
        reason: "Attempt with the wrong credential class",
      },
    });
    expect(aiCannotCreateConfirmation.statusCode).toBe(401);
    expect(aiCannotCreateConfirmation.json().error.code).toBe(
      "HUMAN_CONTROL_REQUIRED",
    );

    const confirmation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/human-confirmations`,
      headers: humanHeaders("lp02-api-completion-confirmation"),
      payload: {
        expectedVersion: version,
        operation: "COMPLETE_PROJECT",
        conclusionId,
        completionSummary: "Complete the validation objective",
        actor: humanActor,
        reason: "Create the bound completion opportunity",
      },
    });
    expect(confirmation.statusCode, confirmation.body).toBe(201);
    const confirmationBody = confirmation.json();
    const confirmationId = confirmationBody.data.confirmation.id as string;
    const cookie = confirmation.headers["set-cookie"];
    expect(cookie).toContain("lp02_confirmation=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain(
      `Path=/api/v1/human-confirmations/${confirmationId}`,
    );
    const capability = cookie?.match(/^lp02_confirmation=([^;]+)/)?.[1];
    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(confirmation.body).not.toContain("capability");
    expect(confirmation.body).not.toContain(humanToken);
    expect(confirmation.body).not.toContain(aiToken);
    version += 1;

    const privateSummary = await app.inject({
      method: "GET",
      url: `/api/v1/human-confirmations/${confirmationId}`,
    });
    expect(privateSummary.statusCode).toBe(401);
    const controlledSummary = await app.inject({
      method: "GET",
      url: `/api/v1/human-confirmations/${confirmationId}`,
      headers: { "x-human-control-token": humanToken },
    });
    expect(controlledSummary.statusCode, controlledSummary.body).toBe(200);
    expect(
      controlledSummary.json().data.confirmation.payloadSummary,
    ).toMatchObject({
      operation: "COMPLETE_PROJECT",
      projectVersion: version,
      conclusion: { id: conclusionId, statusAtRequest: "DRAFT" },
      completionKind: "COMPLETE",
    });

    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/human-confirmations/${confirmationId}/decisions`,
      headers: {
        cookie,
        "idempotency-key": "lp02-api-completion-decision",
        "content-type": "application/json",
      },
      payload: {
        expectedVersion: version,
        decision: "APPROVE",
        decisionNote: "The bound facts support completion",
        actor: humanActor,
        reason: "Approve the exact completion opportunity",
      },
    });
    expect(complete.statusCode, complete.body).toBe(200);
    expect(complete.json().data).toMatchObject({
      project: {
        status: "COMPLETED",
        completionKind: "COMPLETE",
      },
      conclusion: { id: conclusionId, status: "CONFIRMED" },
      confirmation: { decision: "APPROVED", usability: "CONSUMED" },
      transition: { kind: "COMPLETE" },
    });
    const terminalTransitionId = complete.json().data.transition.id as string;
    version += 1;

    const reopenConfirmation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/human-confirmations`,
      headers: humanHeaders("lp02-api-reopen-confirmation"),
      payload: {
        expectedVersion: version,
        operation: "REOPEN_PROJECT",
        terminalTransitionId,
        reopenReason: "A follow-up signal needs one more execution pass",
        nextStep: "Collect the follow-up signal",
        actor: humanActor,
        reason: "Create the bound reopen opportunity",
      },
    });
    expect(reopenConfirmation.statusCode, reopenConfirmation.body).toBe(201);
    const reopenBody = reopenConfirmation.json();
    const reopenId = reopenBody.data.confirmation.id as string;
    const reopenCookie = reopenConfirmation.headers["set-cookie"];
    version += 1;

    const reopen = await app.inject({
      method: "POST",
      url: `/api/v1/human-confirmations/${reopenId}/decisions`,
      headers: {
        cookie: reopenCookie,
        "idempotency-key": "lp02-api-reopen-decision",
        "content-type": "application/json",
      },
      payload: {
        expectedVersion: version,
        decision: "APPROVE",
        decisionNote: "Reopen without rewriting terminal history",
        actor: humanActor,
        reason: "Approve the exact reopen opportunity",
      },
    });
    expect(reopen.statusCode, reopen.body).toBe(200);
    expect(reopen.json().data).toMatchObject({
      project: {
        status: "IN_PROGRESS",
        completedAt: null,
        completionKind: null,
        currentNextStep: "Collect the follow-up signal",
      },
      conclusion: null,
      transition: {
        kind: "REOPEN",
        relatedTransitionId: terminalTransitionId,
      },
    });

    const [proposer, executor, attention, filteredAttention, history] =
      await Promise.all([
        app.inject(`/api/v1/projects/${projectId}?view=proposer`),
        app.inject(`/api/v1/projects/${projectId}?view=executor`),
        app.inject(`/api/v1/projects/${projectId}/attention-items`),
        app.inject(
          `/api/v1/projects/${projectId}/attention-items?type=BLOCKER&status=RESOLVED`,
        ),
        app.inject(`/api/v1/projects/${projectId}/history?limit=100`),
      ]);
    expect(proposer.statusCode, proposer.body).toBe(200);
    expect(executor.statusCode, executor.body).toBe(200);
    expect(proposer.json().data.project.authority).toEqual(
      executor.json().data.project.authority,
    );
    expect(proposer.json().data.project.execution).toMatchObject({
      openAttentionCount: 0,
      openAttentionPreview: [],
      evidenceCount: 1,
      latestConclusion: { id: conclusionId, status: "CONFIRMED" },
      allowedCommands: ["PAUSE", "CHANGE_PHASE", "COMPLETE_PROJECT"],
    });
    expect(attention.statusCode, attention.body).toBe(200);
    expect(attention.json().data.items).toHaveLength(3);
    for (const item of attention.json().data.items) {
      expect(item.item.status).toBe("RESOLVED");
      expect(item.eventHistory).toHaveLength(1);
    }
    expect(filteredAttention.statusCode, filteredAttention.body).toBe(200);
    expect(filteredAttention.json().data.items).toHaveLength(1);
    expect(filteredAttention.json().data.items[0].item.type).toBe("BLOCKER");
    expect(history.statusCode, history.body).toBe(200);
    expect(
      history
        .json()
        .data.items.filter(
          (item: { kind: string }) => item.kind === "TRANSITION",
        )
        .map((item: { transition: { kind: string } }) => item.transition.kind),
    ).toEqual(["REOPEN", "COMPLETE", "START"]);

    expect(
      (
        await pool.query(
          `
            SELECT (
              (SELECT count(*) FROM human_confirmations
                WHERE capability_hash IN ($1,$2,$3)
                   OR payload_digest IN ($1,$2,$3)
                   OR payload_summary::text LIKE $4
                   OR payload_summary::text LIKE $5
                   OR payload_summary::text LIKE $6)
              +
              (SELECT count(*) FROM idempotency_records
                WHERE response_payload::text LIKE $4
                   OR response_payload::text LIKE $5
                   OR response_payload::text LIKE $6)
              +
              (SELECT count(*) FROM audit_events
                WHERE before_summary::text LIKE $4
                   OR before_summary::text LIKE $5
                   OR before_summary::text LIKE $6
                   OR after_summary::text LIKE $4
                   OR after_summary::text LIKE $5
                   OR after_summary::text LIKE $6)
            )::int AS count
          `,
          [
            humanToken,
            aiToken,
            capability,
            `%${humanToken}%`,
            `%${aiToken}%`,
            `%${capability}%`,
          ],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });
});
