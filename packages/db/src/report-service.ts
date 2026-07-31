import type {
  AcceptedReportDto,
  ActorDto,
  ApiError,
  HydratedAttentionRefDto,
  HydratedEvidenceRefDto,
  ReportCurrentDto,
  ReportRenderSlotDto,
  ReportRevisionDto,
  ReportRevisionSummaryDto,
  ReportSubmissionResultDto,
  SafeReportRenderModelDto,
  StructuredReportV1,
} from "@idea/contracts";
import {
  createIdFactory,
  decodeHistoryCursor,
  encodeHistoryCursor,
  type ErrorPayload,
  type Page,
  type ReportService,
  type ReportWriteContext,
  type ValidatedReportSubmission,
  type WriteResult,
} from "@idea/application";
import { WORKSPACE_ID } from "@idea/domain";
import {
  canonicalJson,
  compileReportView,
  reportContentDigest,
  REPORT_COMPILER_VERSION,
  validateStructuredReport,
} from "@idea/reporting";
import type { Pool, PoolClient } from "pg";

export type ReportFailurePoint =
  "AFTER_REVISION_INSERT" | "AFTER_POINTER_UPDATE" | "AFTER_AUDIT_INSERT";

export class ReportServiceError extends Error {
  readonly code: ApiError["code"];
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = "ReportServiceError";
    this.code = error.code;
    this.details = error.details;
  }
}

interface ProjectRow {
  id: string;
  status: "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
}

interface AggregateRow {
  id: string;
  project_id: string;
  current_accepted_revision: number;
  current_renderable_revision: number | null;
}

interface RevisionRow {
  report_id: string;
  revision: number;
  project_id: string;
  previous_revision: number | null;
  schema_version: string;
  content_sha256: string;
  source_document: StructuredReportV1;
  render_model: SafeReportRenderModelDto;
  render_status: "RENDERABLE" | "UNSUPPORTED";
  compiler_version: string;
  submitted_by_type: "AI";
  submitted_by_role: "EXECUTOR";
  submitted_by_display_name: string;
  submitted_by_client: string | null;
  submitted_on_behalf_of_role: null;
  accepted_at: Date;
}

interface SubmissionKeyRow {
  content_sha256: string;
  state: "IN_PROGRESS" | "COMPLETED";
  response_status: number | null;
  response_body: ReportSubmissionResultDto | null;
}

interface EvidenceRow {
  id: string;
  kind: "LINK" | "ARTIFACT" | "METRIC" | "NOTE";
  title: string;
  summary: string;
  state: "ACTIVE" | "RETRACTED";
}

interface AttentionRow {
  id: string;
  type: "BLOCKER" | "DECISION_REQUEST" | "SUPPORT_REQUEST";
  title: string;
  status: "OPEN" | "NEEDS_INFO" | "RESOLVED" | "CLOSED";
  waiting_for_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
}

const ids = createIdFactory();
const REPORT_AUDIT_REASON = "Submit structured project report revision";
const noFault = async (_point: ReportFailurePoint): Promise<void> => undefined;
const toIso = (value: Date): string => value.toISOString();

const apiError = (
  code: Extract<
    ApiError["code"],
    | "REPORT_IDENTITY_MISMATCH"
    | "REPORT_SCHEMA_UNSUPPORTED"
    | "REPORT_VALIDATION_FAILED"
    | "REPORT_UNSAFE_CONTENT"
    | "REPORT_REFERENCE_INVALID"
    | "REPORT_REVISION_NOT_FOUND"
    | "REPORT_REVISION_CONFLICT"
    | "PROJECT_REPORT_FROZEN"
    | "IDEMPOTENCY_KEY_REUSED"
  >,
  message: string,
  details: Readonly<Record<string, unknown>>,
  retryable = false,
): ApiError => ({ code, message, retryable, details }) as ApiError;

const actorDto = (row: RevisionRow): ActorDto => ({
  actorType: row.submitted_by_type,
  role: row.submitted_by_role,
  displayName: row.submitted_by_display_name,
  client: row.submitted_by_client,
  onBehalfOfRole: row.submitted_on_behalf_of_role,
});

const acceptedDto = (row: RevisionRow): AcceptedReportDto => ({
  revision: row.revision,
  previousRevision: row.previous_revision,
  schemaVersion: row.schema_version,
  contentSha256: row.content_sha256,
  sourceDocument: row.source_document,
  submittedBy: actorDto(row),
  acceptedAt: toIso(row.accepted_at),
});

const revisionSummaryDto = (row: RevisionRow): ReportRevisionSummaryDto => ({
  reportId: row.report_id,
  projectId: row.project_id,
  revision: row.revision,
  previousRevision: row.previous_revision,
  schemaVersion: row.schema_version,
  compilerVersion: row.compiler_version,
  contentSha256: row.content_sha256,
  renderable:
    row.render_status === "RENDERABLE" &&
    row.schema_version === "1.0" &&
    row.compiler_version === REPORT_COMPILER_VERSION,
  submittedBy: actorDto(row),
  acceptedAt: toIso(row.accepted_at),
});

const reportRefs = (
  document: StructuredReportV1,
): { attentionIds: string[]; evidenceIds: string[] } => {
  const evidenceIds = new Set<string>();
  const attentionIds = new Set<string>();
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.type === "evidence_refs") {
        block.evidenceIds.forEach((id) => evidenceIds.add(id));
      } else if (block.type === "action_refs") {
        block.attentionItemIds.forEach((id) => attentionIds.add(id));
      } else if (block.type === "timeline") {
        block.items.forEach((item) =>
          item.evidenceIds?.forEach((id) => evidenceIds.add(id)),
        );
      }
    }
  }
  return {
    attentionIds: [...attentionIds].sort(),
    evidenceIds: [...evidenceIds].sort(),
  };
};

export class PostgresReportService implements ReportService {
  constructor(
    private readonly pool: Pool,
    private readonly faultInjector: (
      point: ReportFailurePoint,
      client: PoolClient,
    ) => Promise<void> = noFault,
  ) {}

  async submitReport(
    projectId: string,
    submission: Readonly<ValidatedReportSubmission>,
    context: Readonly<ReportWriteContext>,
  ): Promise<WriteResult<ReportSubmissionResultDto>> {
    const validation = validateStructuredReport(submission.document);
    if (!validation.ok) {
      return this.failed(
        400,
        apiError(validation.code, "The structured report is invalid.", {
          issues: validation.issues,
          recovery: "FIX_REPORT_AND_RETRY",
        }),
        context.requestId,
      );
    }
    if (projectId !== validation.document.projectId) {
      return this.failed(
        400,
        apiError(
          "REPORT_IDENTITY_MISMATCH",
          "The report project identity does not match the route.",
          { recovery: "MATCH_ROUTE_AND_DOCUMENT" },
        ),
        context.requestId,
      );
    }
    if (
      validation.document.clientRequestId !== context.idempotencyKey ||
      context.principal.actorType !== "AI" ||
      context.principal.role !== "EXECUTOR" ||
      context.principal.onBehalfOfRole !== null
    ) {
      return this.failed(
        400,
        apiError(
          "REPORT_IDENTITY_MISMATCH",
          "The report request identity is inconsistent.",
          { recovery: "MATCH_HEADER_BODY_AND_CREDENTIAL" },
        ),
        context.requestId,
      );
    }
    const displayName = context.principal.displayName.trim();
    const clientName = context.principal.client?.trim() ?? null;
    if (
      displayName.length < 1 ||
      displayName.length > 120 ||
      (clientName !== null &&
        (clientName.length < 1 || clientName.length > 120))
    ) {
      throw new Error("REPORT_WRITE_PRINCIPAL_INVALID");
    }
    const contentSha256 = reportContentDigest(validation.document);
    const renderModel = compileReportView(validation.document);
    if (
      contentSha256 !== submission.contentSha256 ||
      canonicalJson(renderModel) !== canonicalJson(submission.renderModel)
    ) {
      throw new Error("REPORT_VALIDATED_SUBMISSION_INVARIANT");
    }

    const dbClient = await this.pool.connect();
    try {
      await dbClient.query("BEGIN");
      await dbClient.query("SET LOCAL lock_timeout = '2s'");
      const claimed = await dbClient.query(
        `
          INSERT INTO report_submission_keys (
            workspace_id,project_id,client_request_id,content_sha256,state
          ) VALUES ($1,$2,$3,$4,'IN_PROGRESS')
          ON CONFLICT DO NOTHING RETURNING client_request_id
        `,
        [WORKSPACE_ID, projectId, context.idempotencyKey, contentSha256],
      );
      if (claimed.rowCount !== 1) {
        const existingResult = await dbClient.query<SubmissionKeyRow>(
          `
            SELECT content_sha256,state,response_status,response_body
            FROM report_submission_keys
            WHERE workspace_id=$1 AND project_id=$2 AND client_request_id=$3
          `,
          [WORKSPACE_ID, projectId, context.idempotencyKey],
        );
        const existing = existingResult.rows[0];
        await dbClient.query("ROLLBACK");
        if (existing === undefined || existing.state === "IN_PROGRESS") {
          return this.inProgress(context.requestId);
        }
        if (existing.content_sha256 !== contentSha256) {
          return this.failed(
            409,
            apiError(
              "IDEMPOTENCY_KEY_REUSED",
              "The report request identity is bound to different content.",
              { recovery: "USE_NEW_KEY_OR_REPLAY_ORIGINAL" },
            ),
            context.requestId,
          );
        }
        if (
          existing.response_status === null ||
          existing.response_body === null
        ) {
          throw new Error("REPORT_SUBMISSION_KEY_TERMINAL_INVARIANT");
        }
        return {
          ok: true,
          status: existing.response_status,
          data: existing.response_body,
          requestId: context.requestId,
          idempotentReplay: true,
        };
      }

      try {
        const project = await this.lockProject(dbClient, projectId);
        if (project.status === "COMPLETED") {
          throw new ReportServiceError(
            409,
            apiError(
              "PROJECT_REPORT_FROZEN",
              "Completed projects must be reopened before accepting reports.",
              { projectId, recovery: "REOPEN_PROJECT_AND_RETRY" },
            ),
          );
        }
        const aggregate = await this.lockOrCreateAggregate(dbClient, projectId);
        if (
          validation.document.basedOnRevision !==
          aggregate.current_accepted_revision
        ) {
          throw new ReportServiceError(
            409,
            apiError(
              "REPORT_REVISION_CONFLICT",
              "The report was based on a stale accepted revision.",
              {
                currentRevision: aggregate.current_accepted_revision,
                recovery: "READ_CURRENT_AND_RETRY_WITH_NEW_KEY",
              },
            ),
          );
        }
        const refs = reportRefs(validation.document);
        await this.assertReferences(dbClient, projectId, refs);
        const revision = aggregate.current_accepted_revision + 1;
        const previousRevision = revision === 1 ? null : revision - 1;
        const previousRow =
          previousRevision === null
            ? null
            : await this.loadRevisionWithClient(
                dbClient,
                projectId,
                previousRevision,
              );
        const inserted = await dbClient.query<RevisionRow>(
          `
            INSERT INTO report_revisions (
              report_id,revision,project_id,workspace_id,previous_revision,
              schema_version,content_sha256,source_document,render_model,
              render_status,compiler_version,submitted_by_type,
              submitted_by_role,submitted_by_display_name,submitted_by_client,
              submitted_on_behalf_of_role
            ) VALUES (
              $1,$2,$3,$4,$5,'1.0',$6,$7,$8,'RENDERABLE',$9,
              'AI','EXECUTOR',$10,$11,NULL
            ) RETURNING *
          `,
          [
            aggregate.id,
            revision,
            projectId,
            WORKSPACE_ID,
            previousRevision,
            contentSha256,
            JSON.stringify(validation.document),
            JSON.stringify(renderModel),
            REPORT_COMPILER_VERSION,
            displayName,
            clientName,
          ],
        );
        const revisionRow = inserted.rows[0];
        if (revisionRow === undefined)
          throw new Error("REPORT_REVISION_INSERT_EMPTY");
        await this.faultInjector("AFTER_REVISION_INSERT", dbClient);
        await dbClient.query(
          `
            UPDATE project_reports SET
              current_accepted_revision=$2,current_renderable_revision=$2,
              updated_at=clock_timestamp()
            WHERE id=$1
          `,
          [aggregate.id, revision],
        );
        await this.faultInjector("AFTER_POINTER_UPDATE", dbClient);
        await dbClient.query(
          `
            INSERT INTO audit_events (
              id,workspace_id,aggregate_type,aggregate_id,aggregate_version,
              event_type,actor_type,actor_role,actor_display_name,actor_client,
              on_behalf_of_role,reason,request_id,idempotency_key,
              before_summary,after_summary,related_event_id
            ) VALUES (
              $1,$2,'REPORT',$3,$4,'REPORT_REVISION_ACCEPTED','AI','EXECUTOR',
              $5,$6,NULL,$7,$8,$9,$10,$11,NULL
            )
          `,
          [
            ids.event(),
            WORKSPACE_ID,
            aggregate.id,
            revision,
            displayName,
            clientName,
            REPORT_AUDIT_REASON,
            context.requestId,
            context.idempotencyKey,
            previousRow === null
              ? null
              : JSON.stringify({
                  revision: previousRow.revision,
                  contentSha256: previousRow.content_sha256,
                  schemaVersion: previousRow.schema_version,
                }),
            JSON.stringify({
              revision,
              contentSha256,
              schemaVersion: "1.0",
              compilerVersion: REPORT_COMPILER_VERSION,
            }),
          ],
        );
        await this.faultInjector("AFTER_AUDIT_INSERT", dbClient);
        const result: ReportSubmissionResultDto = {
          reportId: aggregate.id,
          projectId,
          revision,
          previousRevision,
          contentSha256,
          acceptedAt: toIso(revisionRow.accepted_at),
        };
        await dbClient.query(
          `
            UPDATE report_submission_keys SET
              state='COMPLETED',response_status=201,response_body=$1,
              completed_at=clock_timestamp()
            WHERE workspace_id=$2 AND project_id=$3 AND client_request_id=$4
          `,
          [
            JSON.stringify(result),
            WORKSPACE_ID,
            projectId,
            context.idempotencyKey,
          ],
        );
        await dbClient.query("COMMIT");
        return {
          ok: true,
          status: 201,
          data: result,
          requestId: context.requestId,
          idempotentReplay: false,
        };
      } catch (error) {
        if (!(error instanceof ReportServiceError)) throw error;
        await dbClient.query("ROLLBACK");
        return this.failed(error.status, error.error, context.requestId);
      }
    } catch (error) {
      await dbClient.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "55P03") {
        return this.inProgress(context.requestId);
      }
      throw error;
    } finally {
      dbClient.release();
    }
  }

  async getCurrentReport(projectId: string): Promise<ReportCurrentDto> {
    await this.assertProjectExists(projectId);
    const aggregateResult = await this.pool.query<AggregateRow>(
      "SELECT * FROM project_reports WHERE project_id=$1",
      [projectId],
    );
    const aggregate = aggregateResult.rows[0];
    if (aggregate === undefined) {
      return {
        projectId,
        reportId: null,
        displayMode: "EMPTY",
        accepted: null,
        primary: null,
        runtimeFallback: null,
        compatibilityCode: null,
      };
    }
    const accepted = await this.loadRevision(
      projectId,
      aggregate.current_accepted_revision,
    );
    if (accepted === null) throw new Error("REPORT_ACCEPTED_POINTER_INVALID");
    const candidates = await this.pool.query<RevisionRow>(
      `
        SELECT * FROM report_revisions
        WHERE project_id=$1 AND revision <= $2
          AND render_status='RENDERABLE'
          AND schema_version='1.0' AND compiler_version=$3
        ORDER BY revision DESC LIMIT 2
      `,
      [projectId, accepted.revision, REPORT_COMPILER_VERSION],
    );
    const primaryRow = candidates.rows[0] ?? null;
    const fallbackRow = candidates.rows[1] ?? null;
    const slots = await this.hydrateSlots(
      projectId,
      [primaryRow, fallbackRow].filter(
        (row): row is RevisionRow => row !== null,
      ),
    );
    const primary =
      primaryRow === null ? null : (slots.get(primaryRow.revision) ?? null);
    const runtimeFallback =
      fallbackRow === null ? null : (slots.get(fallbackRow.revision) ?? null);
    const displayMode =
      primary === null
        ? "UNSUPPORTED"
        : primary.revision === accepted.revision
          ? "CURRENT"
          : "FALLBACK";
    return {
      projectId,
      reportId: aggregate.id,
      displayMode,
      accepted: acceptedDto(accepted),
      primary,
      runtimeFallback,
      compatibilityCode:
        displayMode === "CURRENT"
          ? null
          : accepted.schema_version !== "1.0"
            ? "REPORT_SCHEMA_UNSUPPORTED"
            : accepted.compiler_version !== REPORT_COMPILER_VERSION
              ? "REPORT_COMPILER_UNSUPPORTED"
              : "REPORT_RENDER_UNAVAILABLE",
    };
  }

  async listReportRevisions(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ReportRevisionSummaryDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined ? undefined : decodeHistoryCursor(cursor, "report");
    const result = await this.pool.query<RevisionRow>(
      `
        SELECT * FROM report_revisions
        WHERE project_id=$1
          AND ($2::int IS NULL OR (revision,report_id) < ($2::int,$3))
        ORDER BY revision DESC,report_id DESC LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const pageRows = result.rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(revisionSummaryDto),
      limit,
      nextCursor:
        result.rows.length > limit && last !== undefined
          ? encodeHistoryCursor({
              v: 1,
              resultingProjectVersion: last.revision,
              id: last.report_id,
            })
          : null,
    };
  }

  async getReportRevision(
    projectId: string,
    revision: number,
  ): Promise<ReportRevisionDto | null> {
    await this.assertProjectExists(projectId);
    const row = await this.loadRevision(projectId, revision);
    if (row === null) return null;
    const supported =
      row.render_status === "RENDERABLE" &&
      row.schema_version === "1.0" &&
      row.compiler_version === REPORT_COMPILER_VERSION;
    const slots = supported
      ? await this.hydrateSlots(projectId, [row])
      : new Map();
    return {
      ...revisionSummaryDto(row),
      sourceDocument: row.source_document,
      renderSlot: slots.get(row.revision) ?? null,
      compatibilityCode: supported
        ? null
        : row.schema_version !== "1.0"
          ? "REPORT_SCHEMA_UNSUPPORTED"
          : row.compiler_version !== REPORT_COMPILER_VERSION
            ? "REPORT_COMPILER_UNSUPPORTED"
            : "REPORT_RENDER_UNAVAILABLE",
    };
  }

  private async lockProject(
    client: PoolClient,
    projectId: string,
  ): Promise<ProjectRow> {
    const result = await client.query<ProjectRow>(
      "SELECT id,status FROM validation_projects WHERE id=$1 FOR UPDATE",
      [projectId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new ReportServiceError(404, {
        code: "PROJECT_NOT_FOUND",
        message: "The project was not found.",
        retryable: false,
        details: {
          resourceType: "PROJECT",
          resourceId: projectId,
          recovery: "VERIFY_ID_AND_REFETCH",
        },
      });
    }
    return row;
  }

  private async lockOrCreateAggregate(
    client: PoolClient,
    projectId: string,
  ): Promise<AggregateRow> {
    const existing = await client.query<AggregateRow>(
      "SELECT * FROM project_reports WHERE project_id=$1 FOR UPDATE",
      [projectId],
    );
    if (existing.rows[0] !== undefined) return existing.rows[0];
    const created = await client.query<AggregateRow>(
      `
        INSERT INTO project_reports (id,workspace_id,project_id)
        VALUES ($1,$2,$3) RETURNING *
      `,
      [ids.report(), WORKSPACE_ID, projectId],
    );
    const row = created.rows[0];
    if (row === undefined) throw new Error("REPORT_AGGREGATE_INSERT_EMPTY");
    return row;
  }

  private async assertReferences(
    client: PoolClient,
    projectId: string,
    refs: { attentionIds: string[]; evidenceIds: string[] },
  ): Promise<void> {
    const [evidence, attention] = await Promise.all([
      client.query<{ id: string }>(
        "SELECT id FROM evidence_items WHERE project_id=$1 AND id=ANY($2::varchar[])",
        [projectId, refs.evidenceIds],
      ),
      client.query<{ id: string }>(
        "SELECT id FROM attention_items WHERE project_id=$1 AND id=ANY($2::varchar[])",
        [projectId, refs.attentionIds],
      ),
    ]);
    if (
      evidence.rowCount !== refs.evidenceIds.length ||
      attention.rowCount !== refs.attentionIds.length
    ) {
      throw new ReportServiceError(
        400,
        apiError(
          "REPORT_REFERENCE_INVALID",
          "One or more report references are missing or belong to another project.",
          { recovery: "USE_EXISTING_SAME_PROJECT_REFERENCES" },
        ),
      );
    }
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const result = await this.pool.query(
      "SELECT 1 FROM validation_projects WHERE id=$1",
      [projectId],
    );
    if (result.rowCount !== 1) {
      throw new ReportServiceError(404, {
        code: "PROJECT_NOT_FOUND",
        message: "The project was not found.",
        retryable: false,
        details: {
          resourceType: "PROJECT",
          resourceId: projectId,
          recovery: "VERIFY_ID_AND_REFETCH",
        },
      });
    }
  }

  private async loadRevision(
    projectId: string,
    revision: number,
  ): Promise<RevisionRow | null> {
    const result = await this.pool.query<RevisionRow>(
      "SELECT * FROM report_revisions WHERE project_id=$1 AND revision=$2",
      [projectId, revision],
    );
    return result.rows[0] ?? null;
  }

  private async loadRevisionWithClient(
    client: PoolClient,
    projectId: string,
    revision: number,
  ): Promise<RevisionRow> {
    const result = await client.query<RevisionRow>(
      "SELECT * FROM report_revisions WHERE project_id=$1 AND revision=$2",
      [projectId, revision],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("REPORT_PREVIOUS_REVISION_INVALID");
    return row;
  }

  private async hydrateSlots(
    projectId: string,
    rows: readonly RevisionRow[],
  ): Promise<Map<number, ReportRenderSlotDto>> {
    const refsByRevision = new Map(
      rows.map((row) => [row.revision, reportRefs(row.source_document)]),
    );
    const evidenceIds = [
      ...new Set(
        [...refsByRevision.values()].flatMap((refs) => refs.evidenceIds),
      ),
    ];
    const attentionIds = [
      ...new Set(
        [...refsByRevision.values()].flatMap((refs) => refs.attentionIds),
      ),
    ];
    const [evidenceResult, attentionResult] = await Promise.all([
      this.pool.query<EvidenceRow>(
        `
          SELECT e.id,e.kind,e.title,e.summary,
            CASE WHEN EXISTS (
              SELECT 1 FROM evidence_events x WHERE x.evidence_id=e.id
            ) THEN 'RETRACTED' ELSE 'ACTIVE' END AS state
          FROM evidence_items e
          WHERE e.project_id=$1 AND e.id=ANY($2::varchar[])
        `,
        [projectId, evidenceIds],
      ),
      this.pool.query<AttentionRow>(
        `
          SELECT id,type,title,status,waiting_for_role FROM attention_items
          WHERE project_id=$1 AND id=ANY($2::varchar[])
        `,
        [projectId, attentionIds],
      ),
    ]);
    const evidenceById = new Map(
      evidenceResult.rows.map((row) => [row.id, row]),
    );
    const attentionById = new Map(
      attentionResult.rows.map((row) => [row.id, row]),
    );
    return new Map(
      rows.map((row) => {
        const refs = refsByRevision.get(row.revision) ?? {
          evidenceIds: [],
          attentionIds: [],
        };
        const evidence: HydratedEvidenceRefDto[] = refs.evidenceIds.map(
          (id) => {
            const authority = evidenceById.get(id);
            const collection = `/api/v1/projects/${projectId}/evidence`;
            return authority === undefined
              ? {
                  id,
                  kind: "UNAVAILABLE",
                  title: "不可用 Evidence",
                  summary: "该引用当前不可用。",
                  state: "UNAVAILABLE",
                  detailPath: `${collection}#${id}`,
                  historyPath: collection,
                }
              : {
                  id,
                  kind: authority.kind,
                  title: authority.title,
                  summary: authority.summary,
                  state: authority.state,
                  detailPath: `${collection}#${id}`,
                  historyPath: collection,
                };
          },
        );
        const attentionItems: HydratedAttentionRefDto[] = refs.attentionIds.map(
          (id) => {
            const authority = attentionById.get(id);
            const collection = `/api/v1/projects/${projectId}/attention-items`;
            return authority === undefined
              ? {
                  id,
                  type: "UNAVAILABLE",
                  title: "不可用关注事项",
                  status: "UNAVAILABLE",
                  waitingForRole: null,
                  detailPath: `${collection}#${id}`,
                  historyPath: collection,
                }
              : {
                  id,
                  type: authority.type,
                  title: authority.title,
                  status: authority.status,
                  waitingForRole: authority.waiting_for_role,
                  detailPath: `${collection}#${id}`,
                  historyPath: collection,
                };
          },
        );
        return [
          row.revision,
          {
            revision: row.revision,
            schemaVersion: row.schema_version,
            compilerVersion: row.compiler_version,
            contentSha256: row.content_sha256,
            acceptedAt: toIso(row.accepted_at),
            renderModel: row.render_model,
            hydratedRefs: { evidence, attentionItems },
          },
        ];
      }),
    );
  }

  private failed<T>(
    status: number,
    error: ErrorPayload,
    requestId: string,
  ): WriteResult<T> {
    return { ok: false, status, error, requestId };
  }

  private inProgress<T>(requestId: string): WriteResult<T> {
    return {
      ok: false,
      status: 409,
      error: {
        code: "IDEMPOTENCY_IN_PROGRESS",
        message: "The original report request is still in progress.",
        retryable: true,
        details: { retryAfterMs: 250, recovery: "RETRY_SAME_KEY" },
      },
      requestId,
    };
  }
}
