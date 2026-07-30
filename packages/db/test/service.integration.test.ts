import { requestDigest } from "@idea/application";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPool,
  migrate,
  PostgresIdeaService,
  PostgresReadiness,
} from "../src/index.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const pool = createPool({ databaseUrl, max: 5, connectTimeoutMs: 2_000 });
const service = new PostgresIdeaService(pool);

const reset = async (): Promise<void> => {
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
};

const createBody = {
  intentSummary: "Validate durable decision traceability",
  proposer: {
    actorType: "HUMAN" as const,
    role: "PROPOSER" as const,
    displayName: "Founder",
  },
  desiredOutcome: "Learn whether the workflow reduces lost context",
  facts: [],
  hypotheses: [{ text: "Teams lose validation context between tools" }],
  clarificationQuestions: [],
  actor: {
    actorType: "AI" as const,
    role: "EXECUTOR" as const,
    displayName: "Codex",
    client: "integration-test",
    onBehalfOfRole: "PROPOSER" as const,
  },
  reason: "Create the test Idea",
};

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(reset);
afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL command protocol", () => {
  it("requires the exact latest migration and does not leak probe timeouts", async () => {
    const readinessPool = createPool({
      databaseUrl,
      max: 1,
      connectTimeoutMs: 2_000,
    });
    const readiness = new PostgresReadiness(readinessPool);
    try {
      expect(await readiness.probe()).toMatchObject({ status: "READY" });
      expect(
        (
          await readinessPool.query<{ statement_timeout: string }>(
            "SHOW statement_timeout",
          )
        ).rows[0]?.statement_timeout,
      ).toBe("0");

      await readinessPool.query(`
        INSERT INTO schema_migrations (id, checksum)
        VALUES ('9999_future', repeat('0', 64))
      `);
      expect(await readiness.probe()).toMatchObject({
        status: "NOT_READY",
        reason: "MIGRATION_MISMATCH",
      });
    } finally {
      await readinessPool
        .query("DELETE FROM schema_migrations WHERE id = '9999_future'")
        .catch(() => undefined);
      await readinessPool.end();
    }
  });

  it("replays a committed result and rejects a different intent on the same key", async () => {
    const key = "integration-create-1";
    const digest = requestDigest("POST", "/api/v1/ideas", {}, createBody);
    const first = await service.createIdea(createBody, {
      idempotencyKey: key,
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      requestDigest: digest,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected success");

    const replay = await service.createIdea(createBody, {
      idempotencyKey: key,
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      requestDigest: digest,
    });
    expect(replay).toMatchObject({
      ok: true,
      requestId: first.requestId,
      idempotentReplay: true,
      data: first.data,
    });

    const conflict = await service.createIdea(
      { ...createBody, reason: "A different intent" },
      {
        idempotencyKey: key,
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAX",
        requestDigest: requestDigest(
          "POST",
          "/api/v1/ideas",
          {},
          { ...createBody, reason: "A different intent" },
        ),
      },
    );
    expect(conflict).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM ideas")).rows[0]
        .count,
    ).toBe(1);
  });

  it("keeps audit history append-only at the database boundary", async () => {
    await service.createIdea(createBody, {
      idempotencyKey: "integration-create-audit",
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAY",
      requestDigest: requestDigest("POST", "/api/v1/ideas", {}, createBody),
    });
    await expect(
      pool.query("UPDATE audit_events SET reason = 'tampered'"),
    ).rejects.toMatchObject({
      code: "55000",
    });
    await expect(pool.query("DELETE FROM audit_events")).rejects.toMatchObject({
      code: "55000",
    });
  });

  it("rolls back business, audit and idempotency writes after a post-mutation infrastructure failure", async () => {
    const key = "integration-post-mutation-failure";
    const digest = requestDigest("POST", "/api/v1/ideas", {}, createBody);
    await pool.query(`
      CREATE OR REPLACE FUNCTION lp01_test_fail_target_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.idempotency_key = '${key}' THEN
          RAISE EXCEPTION 'injected failure after business mutation'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await pool.query(`
      CREATE TRIGGER lp01_test_fail_target_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION lp01_test_fail_target_audit()
    `);

    try {
      await expect(
        service.createIdea(createBody, {
          idempotencyKey: key,
          requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBD",
          requestDigest: digest,
        }),
      ).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await pool.query(
        "DROP TRIGGER lp01_test_fail_target_audit_trigger ON audit_events",
      );
      await pool.query("DROP FUNCTION lp01_test_fail_target_audit()");
    }

    const rolledBack = await pool.query<{
      auditEvents: number;
      clarificationQuestions: number;
      ideas: number;
      idempotencyRecords: number;
      statements: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM ideas) AS "ideas",
        (SELECT count(*)::int FROM idea_statements) AS "statements",
        (SELECT count(*)::int FROM clarification_questions)
          AS "clarificationQuestions",
        (SELECT count(*)::int FROM audit_events) AS "auditEvents",
        (SELECT count(*)::int FROM idempotency_records)
          AS "idempotencyRecords"
    `);
    expect(rolledBack.rows[0]).toEqual({
      auditEvents: 0,
      clarificationQuestions: 0,
      ideas: 0,
      idempotencyRecords: 0,
      statements: 0,
    });

    const retried = await service.createIdea(createBody, {
      idempotencyKey: key,
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBE",
      requestDigest: digest,
    });
    expect(retried).toMatchObject({
      ok: true,
      idempotentReplay: false,
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBE",
    });
    expect(
      (
        await pool.query(
          "SELECT status FROM idempotency_records WHERE idempotency_key = $1",
          [key],
        )
      ).rows[0]?.status,
    ).toBe("SUCCEEDED");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE idempotency_key = $1",
          [key],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("commits a deterministic correction rejection without partial business writes", async () => {
    const withQuestion = {
      ...createBody,
      clarificationQuestions: [
        {
          prompt: "Do any facts need correction?",
          targetField: "OTHER" as const,
        },
      ],
    };
    const created = await service.createIdea(withQuestion, {
      idempotencyKey: "integration-correction-create",
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBB",
      requestDigest: requestDigest("POST", "/api/v1/ideas", {}, withQuestion),
    });
    if (!created.ok) throw new Error("expected create success");
    const ideaId = created.data.idea.id;
    const questionId = created.data.created.questionIds[0];
    if (questionId === undefined) throw new Error("expected question");
    const answer = {
      expectedVersion: 1,
      answerText: "Attempt an invalid correction",
      newFacts: [
        {
          text: "A correction",
          supersedesStatementId: "stmt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        },
      ],
      newHypotheses: [],
      actor: {
        actorType: "HUMAN" as const,
        role: "PROPOSER" as const,
        displayName: "Founder",
      },
      reason: "Correct a missing statement",
    };
    const rejected = await service.answerClarification(
      ideaId,
      questionId,
      answer,
      {
        idempotencyKey: "integration-invalid-correction",
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBC",
        requestDigest: requestDigest(
          "POST",
          "/api/v1/ideas/:ideaId/clarifications/:questionId/answers",
          { ideaId, questionId },
          answer,
        ),
      },
    );
    expect(rejected).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(
      (await pool.query("SELECT version FROM ideas WHERE id = $1", [ideaId]))
        .rows[0].version,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM clarification_answers WHERE idea_id = $1",
          [ideaId],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT status FROM clarification_questions WHERE id = $1",
          [questionId],
        )
      ).rows[0].status,
    ).toBe("OPEN");
  });

  it("stores deterministic promotion rejection without business mutation", async () => {
    const incomplete = {
      ...createBody,
      desiredOutcome: undefined,
      hypotheses: [],
    };
    const created = await service.createIdea(incomplete, {
      idempotencyKey: "integration-incomplete",
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAZ",
      requestDigest: requestDigest("POST", "/api/v1/ideas", {}, incomplete),
    });
    if (!created.ok) throw new Error("expected create success");
    const ideaId = created.data.idea.id;
    const promotion = {
      expectedVersion: 1,
      explicitIntent: "PROMOTE" as const,
      actor: {
        actorType: "HUMAN" as const,
        role: "PROPOSER" as const,
        displayName: "Founder",
      },
      reason: "Promote now",
    };
    const context = {
      idempotencyKey: "integration-rejected-promotion",
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB0",
      requestDigest: requestDigest(
        "POST",
        "/api/v1/ideas/:ideaId/promotions",
        { ideaId },
        promotion,
      ),
    };
    const rejected = await service.promoteIdea(ideaId, promotion, context);
    expect(rejected).toMatchObject({
      ok: false,
      status: 422,
      error: { code: "PROMOTION_PRECONDITION_FAILED" },
    });
    const replay = await service.promoteIdea(ideaId, promotion, {
      ...context,
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB1",
    });
    expect(replay).toEqual(rejected);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM validation_projects",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("maps an idempotency lock timeout outside the aborted transaction", async () => {
    const blocker = await pool.connect();
    const key = "integration-held-key";
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `
          INSERT INTO idempotency_records (
            workspace_id, idempotency_key, operation, route_template,
            request_digest, first_request_id, status
          ) VALUES (
            'workspace_default', $1, 'CREATE_IDEA', '/api/v1/ideas',
            $2, 'req_01ARZ3NDEKTSV4RRFFQ69G5FB2', 'IN_PROGRESS'
          )
        `,
        [key, requestDigest("POST", "/api/v1/ideas", {}, createBody)],
      );
      const startedAt = Date.now();
      const competing = await service.createIdea(createBody, {
        idempotencyKey: key,
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB3",
        requestDigest: requestDigest("POST", "/api/v1/ideas", {}, createBody),
      });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_900);
      expect(competing).toMatchObject({
        ok: false,
        status: 409,
        error: {
          code: "IDEMPOTENCY_IN_PROGRESS",
          details: { retryAfterMs: 250, recovery: "RETRY_SAME_KEY" },
        },
      });
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
  });

  it("becomes the owner when a competing first transaction rolls back", async () => {
    const blocker = await pool.connect();
    const key = "integration-rollback-key";
    const digest = requestDigest("POST", "/api/v1/ideas", {}, createBody);
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `
          INSERT INTO idempotency_records (
            workspace_id, idempotency_key, operation, route_template,
            request_digest, first_request_id, status
          ) VALUES (
            'workspace_default', $1, 'CREATE_IDEA', '/api/v1/ideas',
            $2, 'req_01ARZ3NDEKTSV4RRFFQ69G5FB7', 'IN_PROGRESS'
          )
        `,
        [key, digest],
      );
      const release = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          void blocker.query("ROLLBACK").then(() => resolve(), reject);
        }, 100);
      });
      const result = await service.createIdea(createBody, {
        idempotencyKey: key,
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB8",
        requestDigest: digest,
      });
      await release;
      expect(result).toMatchObject({
        ok: true,
        idempotentReplay: false,
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB8",
      });
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
  });

  it("waits for a competing commit and replays its terminal response", async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION lp01_test_delay_idea_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.25);
        RETURN NEW;
      END
      $$
    `);
    await pool.query(`
      CREATE TRIGGER lp01_test_delay_idea_insert_trigger
      BEFORE INSERT ON ideas
      FOR EACH ROW EXECUTE FUNCTION lp01_test_delay_idea_insert()
    `);
    try {
      const key = "integration-commit-key";
      const digest = requestDigest("POST", "/api/v1/ideas", {}, createBody);
      const [first, second] = await Promise.all([
        service.createIdea(createBody, {
          idempotencyKey: key,
          requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB9",
          requestDigest: digest,
        }),
        service.createIdea(createBody, {
          idempotencyKey: key,
          requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FBA",
          requestDigest: digest,
        }),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(2);
      const replayed = [first, second].filter(
        (result) => result.ok && result.idempotentReplay,
      );
      expect(replayed).toHaveLength(1);
      expect(first.ok && second.ok && first.data).toEqual(
        second.ok && second.data,
      );
    } finally {
      await pool.query(
        "DROP TRIGGER lp01_test_delay_idea_insert_trigger ON ideas",
      );
      await pool.query("DROP FUNCTION lp01_test_delay_idea_insert()");
    }
  });

  it("allows exactly one concurrent promotion and reports the existing project", async () => {
    const created = await service.createIdea(createBody, {
      idempotencyKey: "integration-concurrent-create",
      requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB4",
      requestDigest: requestDigest("POST", "/api/v1/ideas", {}, createBody),
    });
    if (!created.ok) throw new Error("expected create success");
    const ideaId = created.data.idea.id;
    const promotion = {
      expectedVersion: 1,
      explicitIntent: "PROMOTE" as const,
      actor: {
        actorType: "HUMAN" as const,
        role: "PROPOSER" as const,
        displayName: "Founder",
      },
      reason: "Start validation",
    };
    const [first, second] = await Promise.all([
      service.promoteIdea(ideaId, promotion, {
        idempotencyKey: "integration-promote-a",
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB5",
        requestDigest: requestDigest(
          "POST",
          "/api/v1/ideas/:ideaId/promotions",
          { ideaId },
          promotion,
        ),
      }),
      service.promoteIdea(ideaId, promotion, {
        idempotencyKey: "integration-promote-b",
        requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FB6",
        requestDigest: requestDigest(
          "POST",
          "/api/v1/ideas/:ideaId/promotions",
          { ideaId },
          promotion,
        ),
      }),
    ]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toMatchObject([
      { status: 409, error: { code: "ALREADY_PROMOTED" } },
    ]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM validation_projects",
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
