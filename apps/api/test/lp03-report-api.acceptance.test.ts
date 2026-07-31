import type { StructuredReportV1 } from "@idea/contracts";
import { createIdFactory } from "@idea/application";
import {
  canonicalJson,
  compileReportView,
  reportContentDigest,
  REPORT_COMPILER_VERSION,
} from "@idea/reporting";
import {
  createPool,
  migrate,
  PostgresIdeaService,
  PostgresExperienceQueryService,
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
const aiToken = "lp03-ai-token-that-is-at-least-thirty-two-characters";
const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
const ids = createIdFactory();
let app: FastifyInstance;

const headers = (key: string, token = aiToken) => ({
  authorization: `Bearer ${token}`,
  "idempotency-key": key,
  "content-type": "application/json",
});
const aiActor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "Codex",
};
const humanActor = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

const createProject = async (suffix: string): Promise<string> => {
  const create = await app.inject({
    method: "POST",
    url: "/api/v1/ideas",
    headers: headers(`lp03-api-create-${suffix}`),
    payload: {
      intentSummary: `Validate LP-03 report API ${suffix}`,
      proposer: humanActor,
      desiredOutcome: "Read a safe immutable report",
      facts: [],
      hypotheses: [{ text: "The report remains separate from authority" }],
      clarificationQuestions: [],
      actor: aiActor,
      reason: "Create the LP-03 API fixture",
    },
  });
  expect(create.statusCode, create.body).toBe(201);
  const ideaId = create.json().data.idea.id as string;
  const promote = await app.inject({
    method: "POST",
    url: `/api/v1/ideas/${ideaId}/promotions`,
    headers: headers(`lp03-api-promote-${suffix}`),
    payload: {
      expectedVersion: 1,
      explicitIntent: "PROMOTE",
      actor: humanActor,
      reason: "Promote the LP-03 API fixture",
    },
  });
  expect(promote.statusCode, promote.body).toBe(201);
  return promote.json().data.project.authority.id as string;
};

const report = (
  projectId: string,
  clientRequestId: string,
  basedOnRevision: number,
  title = "API 验证报告",
): StructuredReportV1 => ({
  schemaVersion: "1.0",
  projectId,
  clientRequestId,
  basedOnRevision,
  locale: "zh-CN",
  title,
  generator: { name: "Untrusted display metadata", version: "1.0" },
  sections: [
    {
      id: "overview",
      title: "概览",
      blocks: [
        {
          id: "summary",
          type: "text",
          markdown: "  保留首尾空格  ",
        },
      ],
    },
  ],
});

const insertUnsupportedRevision = async (
  projectId: string,
  basedOnRevision: number,
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let aggregate = await client.query<{
      id: string;
      current_accepted_revision: number;
    }>(
      "SELECT id,current_accepted_revision FROM project_reports WHERE project_id=$1",
      [projectId],
    );
    if (aggregate.rows[0] === undefined) {
      aggregate = await client.query(
        `
          INSERT INTO project_reports (id,workspace_id,project_id)
          VALUES ($1,'workspace_default',$2)
          RETURNING id,current_accepted_revision
        `,
        [ids.report(), projectId],
      );
    }
    const reportId = aggregate.rows[0]?.id;
    if (reportId === undefined)
      throw new Error("LP03_REPORT_AGGREGATE_MISSING");
    const revision = basedOnRevision + 1;
    const document = report(
      projectId,
      ids.request(),
      basedOnRevision,
      `Unsupported revision ${revision}`,
    );
    const model = compileReportView(document);
    await client.query(
      `
        INSERT INTO report_revisions (
          report_id,revision,project_id,workspace_id,previous_revision,
          schema_version,content_sha256,source_document,render_model,
          render_status,compiler_version,submitted_by_type,submitted_by_role,
          submitted_by_display_name,submitted_by_client,
          submitted_on_behalf_of_role
        ) VALUES (
          $1,$2,$3,'workspace_default',$4,'1.0',$5,$6,$7,
          'UNSUPPORTED',$8,'AI','EXECUTOR','Compatibility fixture',NULL,NULL
        )
      `,
      [
        reportId,
        revision,
        projectId,
        basedOnRevision === 0 ? null : basedOnRevision,
        reportContentDigest(document),
        canonicalJson(document),
        canonicalJson(model),
        `${REPORT_COMPILER_VERSION}-future`,
      ],
    );
    await client.query(
      `
        UPDATE project_reports SET current_accepted_revision=$2,
          updated_at=clock_timestamp()
        WHERE id=$1
      `,
      [reportId, revision],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
      aiWriteDisplayName: "Configured report principal",
      aiWriteClient: "lp03-api-test",
      humanControlToken: humanToken,
      logLevel: "silent",
      dbPoolMax: 8,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 1_000,
    },
    service: new PostgresIdeaService(pool),
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

describe("LP-03 report HTTP contract", () => {
  it("requires the bearer and exact header/body request identity", async () => {
    const projectId = await createProject("identity");
    const key = "req_01ARZ3NDEKTSV4RRFFQ69G5FB0";
    const payload = report(projectId, key, 0);
    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: { "idempotency-key": key, "content-type": "application/json" },
      payload,
    });
    expect(missing.statusCode, missing.body).toBe(401);
    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(
        key,
        "wrong-token-that-is-at-least-thirty-two-characters",
      ),
      payload,
    });
    expect(invalid.statusCode, invalid.body).toBe(401);
    const mismatch = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers("req_01ARZ3NDEKTSV4RRFFQ69G5FB1"),
      payload,
    });
    expect(mismatch.statusCode, mismatch.body).toBe(400);
    expect(mismatch.json().error.code).toBe("REPORT_IDENTITY_MISMATCH");
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM report_revisions"))
        .rows[0]?.count,
    ).toBe(0);
  });

  it("submits, replays and reads current/history/specific report DTOs", async () => {
    const projectId = await createProject("roundtrip");
    const firstKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FB2";
    const firstPayload = report(projectId, firstKey, 0);
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(firstKey),
      payload: firstPayload,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({
      ok: true,
      data: { projectId, revision: 1 },
      meta: { idempotentReplay: false },
    });
    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(firstKey),
      payload: firstPayload,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().data).toEqual(first.json().data);
    expect(replay.json().meta.idempotentReplay).toBe(true);

    const secondKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FB3";
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(secondKey),
      payload: report(projectId, secondKey, 1, "第二版 API 报告"),
    });
    expect(second.statusCode, second.body).toBe(201);

    const current = await app.inject(
      `/api/v1/projects/${projectId}/reports/current`,
    );
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json().data).toMatchObject({
      displayMode: "CURRENT",
      accepted: {
        revision: 2,
        sourceDocument: { title: "第二版 API 报告" },
        submittedBy: {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "Configured report principal",
          client: "lp03-api-test",
          onBehalfOfRole: null,
        },
      },
      primary: { revision: 2 },
      runtimeFallback: { revision: 1 },
    });
    expect(
      current.json().data.accepted.sourceDocument.sections[0].blocks[0]
        .markdown,
    ).toBe("  保留首尾空格  ");
    const history = await app.inject(
      `/api/v1/projects/${projectId}/reports?limit=20`,
    );
    expect(history.statusCode, history.body).toBe(200);
    expect(
      history
        .json()
        .data.items.map((item: { revision: number }) => item.revision),
    ).toEqual([2, 1]);
    const specific = await app.inject(
      `/api/v1/projects/${projectId}/reports/1`,
    );
    expect(specific.statusCode, specific.body).toBe(200);
    expect(specific.json().data).toMatchObject({
      revision: 1,
      renderSlot: { revision: 1 },
    });
  });

  it("distinguishes EMPTY, FALLBACK and UNSUPPORTED current modes", async () => {
    const emptyProject = await createProject("empty-mode");
    const empty = await app.inject(
      `/api/v1/projects/${emptyProject}/reports/current`,
    );
    expect(empty.json().data).toMatchObject({
      displayMode: "EMPTY",
      reportId: null,
      accepted: null,
      primary: null,
      runtimeFallback: null,
    });

    const fallbackProject = await createProject("fallback-mode");
    const key1 = "req_01ARZ3NDEKTSV4RRFFQ69G5FB4";
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${fallbackProject}/reports`,
      headers: headers(key1),
      payload: report(fallbackProject, key1, 0),
    });
    const key2 = "req_01ARZ3NDEKTSV4RRFFQ69G5FB5";
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${fallbackProject}/reports`,
      headers: headers(key2),
      payload: report(fallbackProject, key2, 1, "Second supported"),
    });
    await insertUnsupportedRevision(fallbackProject, 2);
    const fallback = await app.inject(
      `/api/v1/projects/${fallbackProject}/reports/current`,
    );
    expect(fallback.statusCode, fallback.body).toBe(200);
    expect(fallback.json().data).toMatchObject({
      displayMode: "FALLBACK",
      accepted: { revision: 3 },
      primary: { revision: 2 },
      runtimeFallback: { revision: 1 },
      compatibilityCode: "REPORT_COMPILER_UNSUPPORTED",
    });

    const unsupportedProject = await createProject("unsupported-mode");
    await insertUnsupportedRevision(unsupportedProject, 0);
    const unsupported = await app.inject(
      `/api/v1/projects/${unsupportedProject}/reports/current`,
    );
    expect(unsupported.statusCode, unsupported.body).toBe(200);
    expect(unsupported.json().data).toMatchObject({
      displayMode: "UNSUPPORTED",
      accepted: { revision: 1 },
      primary: null,
      runtimeFallback: null,
      compatibilityCode: "REPORT_COMPILER_UNSUPPORTED",
    });
  });

  it("returns bounded report-specific parse, safety and size failures", async () => {
    const projectId = await createProject("errors");
    const invalidJson = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers("req_01ARZ3NDEKTSV4RRFFQ69G5FB6"),
      payload: "{invalid",
    });
    expect(invalidJson.statusCode, invalidJson.body).toBe(400);
    expect(invalidJson.json().error.code).toBe("REPORT_VALIDATION_FAILED");

    const unsafeKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FB7";
    const unsafe = report(projectId, unsafeKey, 0);
    const text = unsafe.sections[0]?.blocks[0];
    if (text?.type === "text") text.markdown = "<script>secret()</script>";
    const unsafeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(unsafeKey),
      payload: unsafe,
    });
    expect(unsafeResponse.statusCode, unsafeResponse.body).toBe(400);
    expect(unsafeResponse.json().error.code).toBe("REPORT_UNSAFE_CONTENT");
    expect(unsafeResponse.body).not.toContain("secret()");

    const tooLargeKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FB8";
    const tooLarge = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/reports`,
      headers: headers(tooLargeKey),
      payload: {
        ...report(projectId, tooLargeKey, 0),
        padding: "x".repeat(263_000),
      },
    });
    expect(tooLarge.statusCode, tooLarge.body).toBe(413);
    expect(tooLarge.json().error).toMatchObject({
      code: "REQUEST_TOO_LARGE",
      details: { maxBytes: 262_144 },
    });
  });
});
