import type { StructuredReportV1 } from "@idea/contracts";
import {
  createIdFactory,
  requestDigest,
  type ReportWriteContext,
} from "@idea/application";
import {
  compileReportView,
  reportContentDigest,
  validateStructuredReport,
} from "@idea/reporting";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPool,
  migrate,
  PostgresIdeaService,
  PostgresProjectExecutionService,
  PostgresReportService,
  type ReportFailurePoint,
} from "../src/index.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
const ideaService = new PostgresIdeaService(pool);
const executionService = new PostgresProjectExecutionService(
  pool,
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
);
const reportService = new PostgresReportService(pool);
const ids = createIdFactory();

const aiActor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "Codex",
  client: "lp03-integration",
};
const humanActor = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

const oldContext = (
  key: string,
  route: string,
  params: Readonly<Record<string, unknown>>,
  body: unknown,
) => ({
  idempotencyKey: key,
  requestId: ids.request(),
  requestDigest: requestDigest("POST", route, params, body),
});

const reportContext = (clientRequestId: string): ReportWriteContext => ({
  idempotencyKey: clientRequestId,
  requestId: ids.request(),
  principal: {
    actorType: "AI",
    role: "EXECUTOR",
    displayName: "LP-03 report writer",
    client: "integration-test",
    onBehalfOfRole: null,
  },
});

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

const createProject = async (suffix: string): Promise<string> => {
  const create = {
    intentSummary: `Validate reporting ${suffix}`,
    proposer: humanActor,
    desiredOutcome: "Create an immutable structured report",
    facts: [],
    hypotheses: [{ text: "A declarative report is safely renderable" }],
    clarificationQuestions: [],
    actor: aiActor,
    reason: "Create the LP-03 fixture",
  };
  const created = await ideaService.createIdea(
    create,
    oldContext(`lp03-create-${suffix}`, "/api/v1/ideas", {}, create),
  );
  if (!created.ok) throw new Error("LP03_CREATE_FAILED");
  const promote = {
    expectedVersion: created.data.idea.version,
    explicitIntent: "PROMOTE" as const,
    actor: humanActor,
    reason: "Promote the LP-03 fixture",
  };
  const promoted = await ideaService.promoteIdea(
    created.data.idea.id,
    promote,
    oldContext(
      `lp03-promote-${suffix}`,
      "/api/v1/ideas/:ideaId/promotions",
      { ideaId: created.data.idea.id },
      promote,
    ),
  );
  if (!promoted.ok) throw new Error("LP03_PROMOTE_FAILED");
  return promoted.data.project.authority.id;
};

const report = (
  projectId: string,
  clientRequestId: string,
  basedOnRevision: number,
  title = "结构化验证报告",
  blocks: StructuredReportV1["sections"][number]["blocks"] = [
    { id: "summary", type: "text", markdown: "**安全**的验证结论。" },
  ],
): StructuredReportV1 => ({
  schemaVersion: "1.0",
  projectId,
  clientRequestId,
  basedOnRevision,
  locale: "zh-CN",
  title,
  sections: [{ id: "overview", title: "概览", blocks }],
});

const validated = (document: StructuredReportV1) => {
  const checked = validateStructuredReport(document);
  if (!checked.ok) throw new Error("LP03_REPORT_FIXTURE_INVALID");
  return {
    document: checked.document,
    renderModel: compileReportView(checked.document),
    contentSha256: reportContentDigest(checked.document),
  };
};

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(reset);
afterAll(async () => {
  await pool.end();
});

describe("LP-03 report persistence authority", () => {
  it("keeps migration application idempotent after reaching LP-03", async () => {
    await expect(migrate(pool)).resolves.toEqual({
      id: "0003_lp03_reporting_experience",
      applied: false,
    });
  });

  it("commits immutable revisions, exact replays and independent render slots", async () => {
    const projectId = await createProject("revisions");
    const firstKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FAA";
    const firstSubmission = validated(report(projectId, firstKey, 0));
    const first = await reportService.submitReport(
      projectId,
      firstSubmission,
      reportContext(firstKey),
    );
    expect(first).toMatchObject({
      ok: true,
      idempotentReplay: false,
      data: { projectId, revision: 1, previousRevision: null },
    });
    const replay = await reportService.submitReport(
      projectId,
      firstSubmission,
      reportContext(firstKey),
    );
    expect(replay).toMatchObject({
      ok: true,
      idempotentReplay: true,
      data: first.ok ? first.data : undefined,
    });

    const secondKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FAB";
    const second = await reportService.submitReport(
      projectId,
      validated(report(projectId, secondKey, 1, "第二版报告")),
      reportContext(secondKey),
    );
    expect(second).toMatchObject({ ok: true, data: { revision: 2 } });

    const current = await reportService.getCurrentReport(projectId);
    expect(current).toMatchObject({
      projectId,
      displayMode: "CURRENT",
      accepted: { revision: 2 },
      primary: { revision: 2 },
      runtimeFallback: { revision: 1 },
    });
    const history = await reportService.listReportRevisions(projectId, 1);
    expect(history.items).toMatchObject([{ revision: 2 }]);
    expect(history.nextCursor).not.toBeNull();
    const older = await reportService.listReportRevisions(
      projectId,
      1,
      history.nextCursor ?? undefined,
    );
    expect(older.items).toMatchObject([{ revision: 1 }]);

    const persisted = await pool.query<{
      actor_client: string | null;
      actor_display_name: string;
      audit_count: number;
      revision_count: number;
      submitted_by_client: string | null;
      submitted_by_display_name: string;
    }>(`
      SELECT
        (SELECT count(*)::int FROM report_revisions) AS revision_count,
        (SELECT count(*)::int FROM audit_events
          WHERE aggregate_type='REPORT') AS audit_count,
        r.submitted_by_display_name,
        r.submitted_by_client,
        a.actor_display_name,
        a.actor_client
      FROM report_revisions r
      JOIN audit_events a
        ON a.aggregate_type='REPORT'
       AND a.aggregate_id=r.report_id
       AND a.aggregate_version=r.revision
      WHERE r.revision=2
    `);
    expect(persisted.rows[0]).toEqual({
      revision_count: 2,
      audit_count: 2,
      submitted_by_display_name: "LP-03 report writer",
      submitted_by_client: "integration-test",
      actor_display_name: "LP-03 report writer",
      actor_client: "integration-test",
    });
  });

  it("rejects key reuse and stale revisions without adding durable effects", async () => {
    const projectId = await createProject("conflicts");
    const key = "req_01ARZ3NDEKTSV4RRFFQ69G5FAC";
    await reportService.submitReport(
      projectId,
      validated(report(projectId, key, 0)),
      reportContext(key),
    );
    const keyReuse = await reportService.submitReport(
      projectId,
      validated(report(projectId, key, 0, "Different intent")),
      reportContext(key),
    );
    expect(keyReuse).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
    const staleKey = "req_01ARZ3NDEKTSV4RRFFQ69G5FAD";
    const stale = await reportService.submitReport(
      projectId,
      validated(report(projectId, staleKey, 0, "Stale intent")),
      reportContext(staleKey),
    );
    expect(stale).toMatchObject({
      ok: false,
      status: 409,
      error: {
        code: "REPORT_REVISION_CONFLICT",
        details: { currentRevision: 1 },
      },
    });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM report_revisions"))
        .rows[0]?.count,
    ).toBe(1);
  });

  it("maps same-key lock contention to a bounded in-progress response", async () => {
    const projectId = await createProject("contention");
    const key = "req_01ARZ3NDEKTSV4RRFFQ69G5FAK";
    const submission = validated(report(projectId, key, 0));
    let releaseOwner: (() => void) | undefined;
    let signalEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseOwner = resolve;
    });
    const ownerService = new PostgresReportService(pool, async (point) => {
      if (point === "AFTER_REVISION_INSERT") {
        signalEntered?.();
        await release;
      }
    });
    const owner = ownerService.submitReport(
      projectId,
      submission,
      reportContext(key),
    );
    await entered;
    const contender = await reportService.submitReport(
      projectId,
      submission,
      reportContext(key),
    );
    expect(contender).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "IDEMPOTENCY_IN_PROGRESS", retryable: true },
    });
    releaseOwner?.();
    await expect(owner).resolves.toMatchObject({ ok: true });
  });

  it("rejects cross-project references before creating a report", async () => {
    const ownerProject = await createProject("reference-owner");
    const targetProject = await createProject("reference-target");
    const evidence = {
      expectedVersion: 1,
      kind: "NOTE" as const,
      title: "Other project evidence",
      summary: "Must not cross the project boundary",
      capturedAt: "2026-07-31T16:00:00.000Z",
      actor: aiActor,
      reason: "Create a cross-project fixture",
    };
    const recorded = await executionService.createEvidence(
      ownerProject,
      evidence,
      oldContext(
        "lp03-cross-project-evidence",
        "/api/v1/projects/:projectId/evidence",
        { projectId: ownerProject },
        evidence,
      ),
    );
    if (!recorded.ok) throw new Error("LP03_EVIDENCE_FAILED");
    const key = "req_01ARZ3NDEKTSV4RRFFQ69G5FAE";
    const rejected = await reportService.submitReport(
      targetProject,
      validated(
        report(targetProject, key, 0, "Invalid references", [
          {
            id: "evidence",
            type: "evidence_refs",
            evidenceIds: [recorded.data.evidence.id],
          },
        ]),
      ),
      reportContext(key),
    );
    expect(rejected).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "REPORT_REFERENCE_INVALID" },
    });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM report_revisions"))
        .rows[0]?.count,
    ).toBe(0);
  });

  it.each<ReportFailurePoint>([
    "AFTER_REVISION_INSERT",
    "AFTER_POINTER_UPDATE",
    "AFTER_AUDIT_INSERT",
  ])(
    "rolls back every durable effect at %s and permits same-key recovery",
    async (point) => {
      const projectId = await createProject(point.toLowerCase());
      const keyByPoint: Record<ReportFailurePoint, string> = {
        AFTER_REVISION_INSERT: "req_01ARZ3NDEKTSV4RRFFQ69G5FAF",
        AFTER_POINTER_UPDATE: "req_01ARZ3NDEKTSV4RRFFQ69G5FAG",
        AFTER_AUDIT_INSERT: "req_01ARZ3NDEKTSV4RRFFQ69G5FAH",
      };
      const key = keyByPoint[point];
      const submission = validated(report(projectId, key, 0));
      const failing = new PostgresReportService(pool, async (current) => {
        if (current === point)
          throw Object.assign(new Error("injected"), { code: "P0001" });
      });
      await expect(
        failing.submitReport(projectId, submission, reportContext(key)),
      ).rejects.toMatchObject({ code: "P0001" });
      const counts = await pool.query<{
        aggregates: number;
        audits: number;
        keys: number;
        revisions: number;
      }>(`
      SELECT
        (SELECT count(*)::int FROM project_reports) AS aggregates,
        (SELECT count(*)::int FROM report_revisions) AS revisions,
        (SELECT count(*)::int FROM report_submission_keys) AS keys,
        (SELECT count(*)::int FROM audit_events
          WHERE aggregate_type='REPORT') AS audits
    `);
      expect(counts.rows[0]).toEqual({
        aggregates: 0,
        revisions: 0,
        keys: 0,
        audits: 0,
      });
      const recovered = await reportService.submitReport(
        projectId,
        submission,
        reportContext(key),
      );
      expect(recovered).toMatchObject({ ok: true, data: { revision: 1 } });
    },
  );

  it("freezes completed projects and enforces revision immutability", async () => {
    const projectId = await createProject("frozen");
    await pool.query(
      `
        UPDATE validation_projects SET
          status='COMPLETED',completed_at=clock_timestamp(),completion_kind='COMPLETE'
        WHERE id=$1
      `,
      [projectId],
    );
    const key = "req_01ARZ3NDEKTSV4RRFFQ69G5FAJ";
    const frozen = await reportService.submitReport(
      projectId,
      validated(report(projectId, key, 0)),
      reportContext(key),
    );
    expect(frozen).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "PROJECT_REPORT_FROZEN" },
    });

    await pool.query(
      `
        UPDATE validation_projects SET
          status='IN_PROGRESS',completed_at=NULL,completion_kind=NULL
        WHERE id=$1
      `,
      [projectId],
    );
    const accepted = await reportService.submitReport(
      projectId,
      validated(report(projectId, key, 0)),
      reportContext(key),
    );
    expect(accepted.ok).toBe(true);
    await expect(
      pool.query("UPDATE report_revisions SET schema_version='9.0'"),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("DELETE FROM report_revisions"),
    ).rejects.toMatchObject({
      code: "55000",
    });
  });
});
