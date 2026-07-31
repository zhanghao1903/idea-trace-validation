import type {
  ActorDto,
  ActorInput,
  AttentionEventDto,
  AttentionEventRequest,
  AttentionEffectiveResponse,
  AttentionItemDto,
  AttentionItemHistoryDto,
  AttentionStatus,
  AttentionType,
  AuditEventDto,
  ConclusionDto,
  ConfirmationDecisionRequest,
  ConfirmationPayloadSummary,
  CreateAttentionItemRequest,
  CreateConclusionRequest,
  CreateConfirmationRequest,
  CreateEvidenceRequest,
  CreateProgressUpdateRequest,
  EvidenceCorrectionRequest,
  EvidenceDto,
  EvidenceEventDto,
  EvidenceHistoryDto,
  HumanConfirmationSummaryDto,
  ProgressUpdateDto,
  ProjectAuthorityDto,
  ProjectHistoryItemDto,
  ProjectTransitionDto,
  ProjectTransitionRequest,
} from "@idea/contracts";
import {
  capabilityHash,
  canonicalConfirmationJson,
  confirmationPayloadDigest,
  createIdFactory,
  decodeHistoryCursor,
  deriveConfirmationCapability,
  encodeHistoryCursor,
  secureHashEqual,
  type CommandContext,
  type ConfirmationCreationResult,
  type ErrorPayload,
  type Page,
  type ProjectExecutionService,
  type WriteResult,
} from "@idea/application";
import {
  DomainError,
  WORKSPACE_ID,
  applyExecutionTransition,
  assertEvidenceLocator,
  assertProjectExpectedVersion,
  assertRecommendationMatchesOperation,
  nextAttentionStatus,
} from "@idea/domain";
import type { Pool, PoolClient } from "pg";

const ids = createIdFactory();
const CONFIRMATION_TTL_MS = 30 * 60 * 1000;
const trim = (value: string): string => value.trim().normalize("NFC");
const toIso = (value: Date): string => value.toISOString();

interface ProjectRow {
  id: string;
  idea_id: string;
  goal: string;
  phase: "PLANNING" | "BUILDING" | "VALIDATING" | "CONCLUDING";
  status: "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  current_next_step: string | null;
  latest_progress_update_id: string | null;
  active_conclusion_id: string | null;
  completed_at: Date | null;
  completion_kind: "COMPLETE" | "STOP" | "TRANSFER" | null;
  source_idea_version: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface ActorColumns {
  actor_type: "HUMAN" | "AI";
  actor_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER";
  actor_display_name: string;
  actor_client: string | null;
  on_behalf_of_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
}

interface TransitionRow extends ActorColumns {
  id: string;
  project_id: string;
  kind:
    | "START"
    | "PAUSE"
    | "RESUME"
    | "CHANGE_PHASE"
    | "COMPLETE"
    | "STOP"
    | "TRANSFER"
    | "REOPEN";
  from_status: ProjectRow["status"];
  to_status: ProjectRow["status"];
  from_phase: ProjectRow["phase"];
  to_phase: ProjectRow["phase"];
  explanation: string;
  next_step: string | null;
  conclusion_id: string | null;
  confirmation_id: string | null;
  related_transition_id: string | null;
  resulting_project_version: number;
  recorded_at: Date;
}

interface EvidenceRow extends ActorColumns {
  id: string;
  project_id: string;
  kind: "LINK" | "ARTIFACT" | "METRIC" | "NOTE";
  title: string;
  summary: string;
  locator: string | null;
  metric_name: string | null;
  metric_value: string | null;
  metric_unit: string | null;
  captured_at: Date;
  recorded_at: Date;
  replaces_evidence_id: string | null;
  resulting_project_version: number;
  state?: "ACTIVE" | "RETRACTED";
}

interface ProgressRow extends ActorColumns {
  id: string;
  project_id: string;
  sequence: number;
  summary: string;
  completed_work: string[];
  next_step: string;
  project_status_at_submission: ProjectRow["status"];
  phase_at_submission: ProjectRow["phase"];
  occurred_at: Date;
  submitted_at: Date;
  corrects_progress_id: string | null;
  resulting_project_version: number;
  evidence_ids?: string[];
}

interface EvidenceLifecycleRow extends ActorColumns {
  id: string;
  project_id: string;
  evidence_id: string;
  kind: "CORRECT" | "RETRACT";
  replacement_evidence_id: string | null;
  reason: string;
  resulting_project_version: number;
  recorded_at: Date;
}

interface AttentionRow extends ActorColumns {
  id: string;
  project_id: string;
  type: "BLOCKER" | "DECISION_REQUEST" | "SUPPORT_REQUEST";
  title: string;
  status: "OPEN" | "NEEDS_INFO" | "RESOLVED" | "CLOSED";
  background: string | null;
  impact: string | null;
  options: string[];
  recommendation: string | null;
  decision_impact: string | null;
  waiting_for_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  support_needed: string | null;
  request_reason: string | null;
  expected_responder_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  resulting_project_version: number;
}

interface AttentionEventRow extends ActorColumns {
  id: string;
  project_id: string;
  attention_item_id: string;
  kind:
    | "COMMENT"
    | "REQUEST_INFO"
    | "PROVIDE_INFO"
    | "RESOLVE"
    | "CLOSE"
    | "CORRECT_RESPONSE";
  message: string;
  from_status: AttentionRow["status"];
  to_status: AttentionRow["status"];
  resolution: string | null;
  selected_option: string | null;
  decision_text: string | null;
  support_summary: string | null;
  corrects_event_id: string | null;
  corrected_kind: Exclude<AttentionEventRow["kind"], "CORRECT_RESPONSE"> | null;
  recorded_at: Date;
  resulting_project_version: number;
}

interface ConclusionRow extends ActorColumns {
  id: string;
  project_id: string;
  sequence: number;
  evidence_summary: string;
  limitations: string[];
  uncertainties: string[];
  recommendation: "CONTINUE" | "ADJUST" | "STOP" | "TRANSFER";
  recommendation_note: string;
  supplemental_note: string | null;
  supersedes_conclusion_id: string | null;
  submitted_at: Date;
  resulting_project_version: number;
  evidence_ids?: string[];
  effective_status?:
    "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SUPERSEDED";
}

interface ConfirmationRow {
  id: string;
  project_id: string;
  operation:
    | "CONFIRM_CONCLUSION"
    | "COMPLETE_PROJECT"
    | "STOP_PROJECT"
    | "TRANSFER_PROJECT"
    | "REOPEN_PROJECT";
  conclusion_id: string | null;
  terminal_transition_id: string | null;
  completion_summary: string | null;
  reopen_reason: string | null;
  next_step: string | null;
  payload_digest: string;
  payload_summary: ConfirmationPayloadSummary;
  expected_project_version: number;
  capability_hash: string;
  expires_at: Date;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decided_actor_type: "HUMAN" | "AI" | null;
  decided_actor_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  decided_actor_display_name: string | null;
  decided_actor_client: string | null;
  decided_on_behalf_of_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  decided_at: Date | null;
  decision_note: string | null;
  resulting_project_version: number | null;
  confirmation_request_idempotency_key: string;
  created_at: Date;
}

interface IdempotencyRow {
  operation: string;
  request_digest: string;
  first_request_id: string;
  status: "IN_PROGRESS" | "SUCCEEDED" | "REJECTED";
  response_status: number | null;
  response_payload: unknown;
}

interface ProjectAuditRow extends ActorColumns {
  id: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: AuditEventDto["eventType"];
  occurred_at: Date;
  reason: string;
  request_id: string;
  before_summary: AuditEventDto["beforeSummary"];
  after_summary: AuditEventDto["afterSummary"];
  related_event_id: string | null;
}

interface ProjectHistoryIndexRow {
  id: string;
  kind: "TRANSITION" | "AUDIT";
  project_version: number;
}

const actorColumns = (input: ActorInput): ActorColumns => ({
  actor_type: input.actorType,
  actor_role: input.role,
  actor_display_name: trim(input.displayName),
  actor_client: input.client === undefined ? null : trim(input.client),
  on_behalf_of_role: input.onBehalfOfRole ?? null,
});

const actorDto = (row: ActorColumns): ActorDto => ({
  actorType: row.actor_type,
  role: row.actor_role,
  displayName: row.actor_display_name,
  client: row.actor_client,
  onBehalfOfRole: row.on_behalf_of_role,
});

const projectDto = (row: ProjectRow): ProjectAuthorityDto => ({
  id: row.id,
  ideaId: row.idea_id,
  goal: row.goal,
  phase: row.phase,
  status: row.status,
  currentNextStep: row.current_next_step,
  latestProgressUpdateId: row.latest_progress_update_id,
  activeConclusionId: row.active_conclusion_id,
  completedAt: row.completed_at === null ? null : toIso(row.completed_at),
  completionKind: row.completion_kind,
  sourceIdeaVersion: row.source_idea_version,
  version: row.version,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const transitionDto = (row: TransitionRow): ProjectTransitionDto => ({
  id: row.id,
  projectId: row.project_id,
  kind: row.kind,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  fromPhase: row.from_phase,
  toPhase: row.to_phase,
  explanation: row.explanation,
  nextStep: row.next_step,
  conclusionId: row.conclusion_id,
  confirmationId: row.confirmation_id,
  relatedTransitionId: row.related_transition_id,
  resultingProjectVersion: row.resulting_project_version,
  declaredActor: actorDto(row),
  recordedAt: toIso(row.recorded_at),
});

const evidenceDto = (row: EvidenceRow): EvidenceDto => ({
  id: row.id,
  projectId: row.project_id,
  kind: row.kind,
  title: row.title,
  summary: row.summary,
  locator: row.locator,
  metricName: row.metric_name,
  metricValue: row.metric_value,
  metricUnit: row.metric_unit,
  capturedAt: toIso(row.captured_at),
  recordedAt: toIso(row.recorded_at),
  recordedBy: actorDto(row),
  state: row.state ?? "ACTIVE",
  replacesEvidenceId: row.replaces_evidence_id,
  resultingProjectVersion: row.resulting_project_version,
});

const evidenceEventDto = (row: EvidenceLifecycleRow): EvidenceEventDto => ({
  id: row.id,
  projectId: row.project_id,
  evidenceId: row.evidence_id,
  kind: row.kind,
  replacementEvidenceId: row.replacement_evidence_id,
  reason: row.reason,
  declaredActor: actorDto(row),
  resultingProjectVersion: row.resulting_project_version,
  recordedAt: toIso(row.recorded_at),
});

const progressDto = (row: ProgressRow): ProgressUpdateDto => ({
  id: row.id,
  projectId: row.project_id,
  sequence: row.sequence,
  summary: row.summary,
  completedWork: row.completed_work,
  nextStep: row.next_step,
  projectStatusAtSubmission: row.project_status_at_submission,
  phaseAtSubmission: row.phase_at_submission,
  evidenceIds: row.evidence_ids ?? [],
  occurredAt: toIso(row.occurred_at),
  submittedAt: toIso(row.submitted_at),
  submittedBy: actorDto(row),
  correctsProgressId: row.corrects_progress_id,
  resultingProjectVersion: row.resulting_project_version,
});

const attentionDto = (row: AttentionRow): AttentionItemDto => ({
  id: row.id,
  projectId: row.project_id,
  type: row.type,
  title: row.title,
  status: row.status,
  background: row.background,
  impact: row.impact,
  options: row.options,
  recommendation: row.recommendation,
  decisionImpact: row.decision_impact,
  waitingForRole: row.waiting_for_role,
  supportNeeded: row.support_needed,
  requestReason: row.request_reason,
  expectedResponderRole: row.expected_responder_role,
  createdBy: actorDto(row),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  resolvedAt: row.resolved_at === null ? null : toIso(row.resolved_at),
  resultingProjectVersion: row.resulting_project_version,
});

const attentionEventDto = (row: AttentionEventRow): AttentionEventDto => ({
  id: row.id,
  attentionItemId: row.attention_item_id,
  projectId: row.project_id,
  kind: row.kind,
  message: row.message,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  resolution: row.resolution,
  selectedOption: row.selected_option,
  decisionText: row.decision_text,
  supportSummary: row.support_summary,
  correctsEventId: row.corrects_event_id,
  correctedKind: row.corrected_kind,
  declaredActor: actorDto(row),
  recordedAt: toIso(row.recorded_at),
  resultingProjectVersion: row.resulting_project_version,
});

const conclusionDto = (row: ConclusionRow): ConclusionDto => ({
  id: row.id,
  projectId: row.project_id,
  sequence: row.sequence,
  evidenceSummary: row.evidence_summary,
  evidenceIds: row.evidence_ids ?? [],
  limitations: row.limitations,
  uncertainties: row.uncertainties,
  recommendation: row.recommendation,
  recommendationNote: row.recommendation_note,
  supplementalNote: row.supplemental_note,
  supersedesConclusionId: row.supersedes_conclusion_id,
  status: row.effective_status ?? "DRAFT",
  submittedBy: actorDto(row),
  submittedAt: toIso(row.submitted_at),
  resultingProjectVersion: row.resulting_project_version,
});

const confirmationDto = (
  row: ConfirmationRow,
  currentProjectVersion: number,
  now = new Date(),
): HumanConfirmationSummaryDto => ({
  id: row.id,
  projectId: row.project_id,
  operation: row.operation,
  conclusionId: row.conclusion_id,
  terminalTransitionId: row.terminal_transition_id,
  payloadSummary: row.payload_summary,
  expectedProjectVersion: row.expected_project_version,
  expiresAt: toIso(row.expires_at),
  decision: row.decision,
  usability:
    row.decision !== "PENDING"
      ? "CONSUMED"
      : row.expires_at.getTime() <= now.getTime()
        ? "EXPIRED"
        : row.expected_project_version !== currentProjectVersion
          ? "STALE"
          : "ACTIVE",
  decidedBy:
    row.decided_actor_type === null ||
    row.decided_actor_role === null ||
    row.decided_actor_display_name === null
      ? null
      : {
          actorType: row.decided_actor_type,
          role: row.decided_actor_role,
          displayName: row.decided_actor_display_name,
          client: row.decided_actor_client,
          onBehalfOfRole: row.decided_on_behalf_of_role,
        },
  decidedAt: row.decided_at === null ? null : toIso(row.decided_at),
  decisionNote: row.decision_note,
  resultingProjectVersion: row.resulting_project_version,
  createdAt: toIso(row.created_at),
});

const projectAuditDto = (row: ProjectAuditRow): AuditEventDto => ({
  id: row.id,
  aggregateType: "PROJECT",
  aggregateId: row.aggregate_id,
  aggregateVersion: row.aggregate_version,
  eventType: row.event_type,
  occurredAt: toIso(row.occurred_at),
  declaredActor: actorDto(row),
  reason: row.reason,
  requestId: row.request_id,
  beforeSummary: row.before_summary,
  afterSummary: row.after_summary,
  relatedEventId: row.related_event_id,
});

const notFound = (
  code:
    | "PROJECT_NOT_FOUND"
    | "ATTENTION_ITEM_NOT_FOUND"
    | "EVIDENCE_NOT_FOUND"
    | "CONCLUSION_NOT_FOUND"
    | "CONFIRMATION_NOT_FOUND",
  resourceType: string,
  resourceId: string,
) =>
  new DomainError(code, `${resourceType} was not found.`, {
    resourceType,
    resourceId,
    recovery: "VERIFY_ID_AND_REFETCH",
  });

const domainErrorPayload = (
  error: DomainError,
): { status: number; error: ErrorPayload } => {
  const statusByCode: Readonly<Record<string, number>> = {
    VALIDATION_FAILED: 400,
    PROJECT_NOT_FOUND: 404,
    ATTENTION_ITEM_NOT_FOUND: 404,
    EVIDENCE_NOT_FOUND: 404,
    CONCLUSION_NOT_FOUND: 404,
    CONFIRMATION_NOT_FOUND: 404,
    PROJECT_STATE_CONFLICT: 409,
    PHASE_TRANSITION_INVALID: 409,
    ATTENTION_STATE_CONFLICT: 409,
    CROSS_PROJECT_REFERENCE: 409,
    REFERENCE_NOT_ACTIVE: 409,
    CONCLUSION_STATE_CONFLICT: 409,
    RECOMMENDATION_MISMATCH: 409,
    CONFIRMATION_ALREADY_PENDING: 409,
    CONFIRMATION_EXPIRED: 409,
    CONFIRMATION_ALREADY_DECIDED: 409,
    CONFIRMATION_STALE: 409,
    VERSION_CONFLICT: 409,
    PROJECT_PRECONDITION_FAILED: 422,
  };
  return {
    status: statusByCode[error.code] ?? 500,
    error: {
      code: error.code,
      message: error.message,
      retryable: false,
      details: error.details,
    } as ErrorPayload,
  };
};

export class PostgresProjectExecutionService implements ProjectExecutionService {
  constructor(
    private readonly pool: Pool,
    private readonly humanControlToken: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async transitionProject(
    projectId: string,
    input: ProjectTransitionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      transition: ProjectTransitionDto;
    }>
  > {
    return this.runWrite(
      "PROJECT_TRANSITION",
      "/api/v1/projects/:projectId/transitions",
      200,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        const next = applyExecutionTransition(project, input);
        const version = project.version + 1;
        const declared = actorColumns(input.actor);
        const transition = await client.query<TransitionRow>(
          `
            INSERT INTO project_transitions (
              id, workspace_id, project_id, kind, from_status, to_status,
              from_phase, to_phase, explanation, next_step,
              resulting_project_version, actor_type, actor_role,
              actor_display_name, actor_client, on_behalf_of_role
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
            ) RETURNING *
          `,
          [
            ids.transition(),
            WORKSPACE_ID,
            projectId,
            input.transition,
            project.status,
            next.status,
            project.phase,
            next.phase,
            trim(next.explanation),
            next.nextStep === null ? null : trim(next.nextStep),
            version,
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
          ],
        );
        const updated = await this.updateProject(client, projectId, {
          status: next.status,
          phase: next.phase,
          currentNextStep: next.nextStep,
          version,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "PROJECT_TRANSITIONED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: transition.rows[0]?.id ?? null,
        });
        const row = transition.rows[0];
        if (row === undefined) throw new Error("TRANSITION_RETURNING_EMPTY");
        return { project: projectDto(updated), transition: transitionDto(row) };
      },
    );
  }

  async createEvidence(
    projectId: string,
    input: CreateEvidenceRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{ project: ProjectAuthorityDto; evidence: EvidenceDto }>
  > {
    return this.runWrite(
      "CREATE_EVIDENCE",
      "/api/v1/projects/:projectId/evidence",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        this.assertNonTerminal(project);
        assertEvidenceLocator(
          input.kind,
          "locator" in input ? input.locator : undefined,
        );
        const version = project.version + 1;
        const row = await this.insertEvidence(
          client,
          projectId,
          input,
          version,
        );
        const updated = await this.updateProject(client, projectId, {
          version,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "EVIDENCE_RECORDED",
          actor: actorColumns(input.actor),
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: row.id,
        });
        return { project: projectDto(updated), evidence: evidenceDto(row) };
      },
    );
  }

  async correctEvidence(
    projectId: string,
    evidenceId: string,
    input: EvidenceCorrectionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      evidence: EvidenceDto;
      event: EvidenceEventDto;
    }>
  > {
    return this.runWrite(
      "CORRECT_EVIDENCE",
      "/api/v1/projects/:projectId/evidence/:evidenceId/corrections",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        this.assertNonTerminal(project);
        const original = await this.lockActiveEvidence(
          client,
          projectId,
          evidenceId,
        );
        const version = project.version + 1;
        let current = original;
        if (input.action === "CORRECT") {
          assertEvidenceLocator(
            input.replacement.kind,
            "locator" in input.replacement
              ? input.replacement.locator
              : undefined,
          );
          current = await this.insertEvidence(
            client,
            projectId,
            {
              ...input.replacement,
              expectedVersion: input.expectedVersion,
              actor: input.actor,
              reason: input.reason,
            },
            version,
            evidenceId,
          );
        }
        const declared = actorColumns(input.actor);
        const eventResult = await client.query<{
          id: string;
          recorded_at: Date;
        }>(
          `
            INSERT INTO evidence_events (
              id, workspace_id, project_id, evidence_id, kind,
              replacement_evidence_id, reason, actor_type, actor_role,
              actor_display_name, actor_client, on_behalf_of_role,
              resulting_project_version
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id, recorded_at
          `,
          [
            ids.event(),
            WORKSPACE_ID,
            projectId,
            evidenceId,
            input.action,
            input.action === "CORRECT" ? current.id : null,
            trim(input.reason),
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            version,
          ],
        );
        const updated = await this.updateProject(client, projectId, {
          version,
        });
        const eventRow = eventResult.rows[0];
        if (eventRow === undefined) throw new Error("EVIDENCE_EVENT_EMPTY");
        await this.audit(client, {
          project,
          updated,
          eventType:
            input.action === "CORRECT"
              ? "EVIDENCE_CORRECTED"
              : "EVIDENCE_RETRACTED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: eventRow.id,
        });
        const event: EvidenceEventDto = {
          id: eventRow.id,
          projectId,
          evidenceId,
          kind: input.action,
          replacementEvidenceId: input.action === "CORRECT" ? current.id : null,
          reason: trim(input.reason),
          declaredActor: actorDto(declared),
          resultingProjectVersion: version,
          recordedAt: toIso(eventRow.recorded_at),
        };
        return {
          project: projectDto(updated),
          evidence: evidenceDto({
            ...current,
            state: input.action === "RETRACT" ? "RETRACTED" : "ACTIVE",
          }),
          event,
        };
      },
    );
  }

  async listEvidence(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<EvidenceHistoryDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined
        ? undefined
        : decodeHistoryCursor(cursor, "evidence");
    const result = await this.pool.query<EvidenceRow>(
      `
        SELECT e.*,
          CASE WHEN re.id IS NOT NULL THEN 'RETRACTED' ELSE 'ACTIVE' END AS state
        FROM evidence_items e
        LEFT JOIN evidence_events re
          ON re.evidence_id = e.id
        WHERE e.project_id = $1
          AND ($2::int IS NULL OR (e.resulting_project_version,e.id) < ($2::int,$3))
        ORDER BY e.resulting_project_version DESC,e.id DESC
        LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = result.rows.length > limit;
    const visible = result.rows.slice(0, limit);
    const events = await this.pool.query<EvidenceLifecycleRow>(
      "SELECT * FROM evidence_events WHERE evidence_id=ANY($1::varchar[])",
      [visible.map((row) => row.id)],
    );
    const eventByEvidenceId = new Map(
      events.rows.map((row) => [row.evidence_id, row]),
    );
    const last = visible.at(-1);
    return {
      items: visible.map((row) => {
        const event = eventByEvidenceId.get(row.id);
        return {
          evidence: evidenceDto(row),
          lifecycleEvent: event === undefined ? null : evidenceEventDto(event),
        };
      }),
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeHistoryCursor({
              v: 1,
              resultingProjectVersion: last.resulting_project_version,
              id: last.id,
            })
          : null,
    };
  }

  async createProgressUpdate(
    projectId: string,
    input: CreateProgressUpdateRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      progressUpdate: ProgressUpdateDto;
    }>
  > {
    return this.runWrite(
      "CREATE_PROGRESS",
      "/api/v1/projects/:projectId/progress-updates",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        if (project.status !== "IN_PROGRESS") {
          throw new DomainError(
            "PROJECT_STATE_CONFLICT",
            "Progress can be submitted only while the project is in progress.",
            {
              projectId,
              currentStatus: project.status,
              allowedTransitions: [],
              recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
            },
          );
        }
        await this.assertActiveEvidence(client, projectId, input.evidenceIds);
        if (input.correctsProgressId !== undefined) {
          const target = await client.query(
            `
              SELECT 1 FROM progress_updates p
              WHERE p.id=$1 AND p.project_id=$2
                AND NOT EXISTS (
                  SELECT 1 FROM progress_updates n WHERE n.corrects_progress_id=p.id
                )
              FOR UPDATE
            `,
            [input.correctsProgressId, projectId],
          );
          if (target.rowCount !== 1) {
            throw new DomainError(
              "CROSS_PROJECT_REFERENCE",
              "A progress correction must target the current same-project leaf.",
              {
                resourceType: "PROGRESS",
                resourceId: input.correctsProgressId,
                projectId,
                recovery: "USE_SAME_PROJECT_REFERENCE",
              },
            );
          }
        }
        const version = project.version + 1;
        const sequenceResult = await client.query<{ sequence: number }>(
          "SELECT coalesce(max(sequence),0)::int+1 AS sequence FROM progress_updates WHERE project_id=$1",
          [projectId],
        );
        const declared = actorColumns(input.actor);
        const result = await client.query<ProgressRow>(
          `
            INSERT INTO progress_updates (
              id, workspace_id, project_id, sequence, summary, completed_work,
              next_step, project_status_at_submission, phase_at_submission,
              occurred_at, actor_type, actor_role, actor_display_name,
              actor_client, on_behalf_of_role, corrects_progress_id,
              resulting_project_version
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
            ) RETURNING *
          `,
          [
            ids.progress(),
            WORKSPACE_ID,
            projectId,
            sequenceResult.rows[0]?.sequence ?? 1,
            trim(input.summary),
            JSON.stringify(input.completedWork.map(trim)),
            trim(input.nextStep),
            project.status,
            project.phase,
            input.occurredAt,
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            input.correctsProgressId ?? null,
            version,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) throw new Error("PROGRESS_RETURNING_EMPTY");
        for (const [position, evidenceId] of input.evidenceIds.entries()) {
          await client.query(
            `INSERT INTO progress_update_evidence
              (progress_update_id,project_id,evidence_id,position)
             VALUES ($1,$2,$3,$4)`,
            [row.id, projectId, evidenceId, position],
          );
        }
        row.evidence_ids = input.evidenceIds;
        const updated = await this.updateProject(client, projectId, {
          version,
          currentNextStep: input.nextStep,
          latestProgressUpdateId: row.id,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "PROJECT_PROGRESS_RECORDED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: row.id,
        });
        return {
          project: projectDto(updated),
          progressUpdate: progressDto(row),
        };
      },
    );
  }

  async listProgressUpdates(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProgressUpdateDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined
        ? undefined
        : decodeHistoryCursor(cursor, "progress");
    const result = await this.pool.query<ProgressRow>(
      `
        SELECT p.*,
          coalesce(
            (SELECT jsonb_agg(pe.evidence_id ORDER BY pe.position)
             FROM progress_update_evidence pe
             WHERE pe.progress_update_id=p.id),
            '[]'::jsonb
          ) AS evidence_ids
        FROM progress_updates p
        WHERE p.project_id=$1
          AND ($2::int IS NULL OR (p.resulting_project_version,p.id) < ($2::int,$3))
        ORDER BY p.resulting_project_version DESC,p.id DESC
        LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    return this.page(
      result.rows,
      limit,
      progressDto,
      (row) => row.resulting_project_version,
    );
  }

  async createAttentionItem(
    projectId: string,
    input: CreateAttentionItemRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      attentionItem: AttentionItemDto;
    }>
  > {
    return this.runWrite(
      "CREATE_ATTENTION",
      "/api/v1/projects/:projectId/attention-items",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        this.assertNonTerminal(project);
        if (
          input.type === "DECISION_REQUEST" &&
          input.options.length === 0 &&
          input.recommendation === null
        ) {
          throw new DomainError(
            "PROJECT_PRECONDITION_FAILED",
            "A decision request needs options or a recommendation.",
            {
              missing: ["OPTIONS_OR_RECOMMENDATION"],
              recovery: "FIX_REQUEST_AND_USE_NEW_KEY",
            },
          );
        }
        const version = project.version + 1;
        const declared = actorColumns(input.actor);
        const result = await client.query<AttentionRow>(
          `
            INSERT INTO attention_items (
              id,workspace_id,project_id,type,title,status,background,impact,
              options,recommendation,decision_impact,waiting_for_role,
              support_needed,request_reason,expected_responder_role,
              actor_type,actor_role,actor_display_name,actor_client,
              on_behalf_of_role,resulting_project_version
            ) VALUES (
              $1,$2,$3,$4,$5,'OPEN',$6,$7,$8,$9,$10,$11,$12,$13,$14,
              $15,$16,$17,$18,$19,$20
            ) RETURNING *
          `,
          [
            ids.attention(),
            WORKSPACE_ID,
            projectId,
            input.type,
            trim(input.title),
            "background" in input ? trim(input.background) : null,
            "impact" in input ? trim(input.impact) : null,
            JSON.stringify("options" in input ? input.options.map(trim) : []),
            "recommendation" in input && input.recommendation !== null
              ? trim(input.recommendation)
              : null,
            "decisionImpact" in input ? trim(input.decisionImpact) : null,
            "waitingForRole" in input ? input.waitingForRole : null,
            "supportNeeded" in input ? trim(input.supportNeeded) : null,
            "requestReason" in input ? trim(input.requestReason) : null,
            "expectedResponderRole" in input
              ? input.expectedResponderRole
              : null,
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            version,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) throw new Error("ATTENTION_RETURNING_EMPTY");
        const updated = await this.updateProject(client, projectId, {
          version,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "ATTENTION_ITEM_CREATED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: row.id,
        });
        return {
          project: projectDto(updated),
          attentionItem: attentionDto(row),
        };
      },
    );
  }

  async appendAttentionEvent(
    projectId: string,
    itemId: string,
    input: AttentionEventRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      attentionItem: AttentionItemDto;
      event: AttentionEventDto;
      effectiveResponse: AttentionEffectiveResponse | null;
    }>
  > {
    return this.runWrite(
      "APPEND_ATTENTION_EVENT",
      "/api/v1/projects/:projectId/attention-items/:itemId/events",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        const itemResult = await client.query<AttentionRow>(
          "SELECT * FROM attention_items WHERE id=$1 AND project_id=$2 FOR UPDATE",
          [itemId, projectId],
        );
        const item = itemResult.rows[0];
        if (item === undefined) {
          throw notFound("ATTENTION_ITEM_NOT_FOUND", "ATTENTION_ITEM", itemId);
        }
        const toStatus = nextAttentionStatus(itemId, item.status, input.kind);
        const version = project.version + 1;
        const declared = actorColumns(input.actor);
        let message: string;
        let resolution: string | null = null;
        let selectedOption: string | null = null;
        let decisionText: string | null = null;
        let supportSummary: string | null = null;
        let correctsEventId: string | null = null;
        let correctedKind: AttentionEventRow["corrected_kind"] = null;
        let effectiveResponse: AttentionEffectiveResponse | null = null;
        if (input.kind === "CORRECT_RESPONSE") {
          const target = await client.query<AttentionEventRow>(
            `
              SELECT root.* FROM attention_events root
              WHERE root.id=$1 AND root.attention_item_id=$2 AND root.project_id=$3
                AND NOT EXISTS (
                  SELECT 1 FROM attention_events newer
                  WHERE newer.corrects_event_id=root.id
                )
              FOR UPDATE
            `,
            [input.correctsEventId, itemId, projectId],
          );
          const targetRow = target.rows[0];
          if (
            targetRow === undefined ||
            (targetRow.kind === "CORRECT_RESPONSE"
              ? targetRow.corrected_kind
              : targetRow.kind) !== input.correctedKind
          ) {
            throw new DomainError(
              "ATTENTION_STATE_CONFLICT",
              "A response correction must target the current leaf and root kind.",
              {
                attentionItemId: itemId,
                currentStatus: item.status,
                allowedEvents: ["CORRECT_RESPONSE"],
                recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
              },
            );
          }
          this.assertCorrectionShape(item.type, input);
          message = trim(input.replacement.message);
          resolution = !("resolution" in input.replacement)
            ? null
            : trim(input.replacement.resolution);
          selectedOption = !("selectedOption" in input.replacement)
            ? null
            : trim(input.replacement.selectedOption);
          decisionText = !("decisionText" in input.replacement)
            ? null
            : trim(input.replacement.decisionText);
          supportSummary = !("supportSummary" in input.replacement)
            ? null
            : trim(input.replacement.supportSummary);
          correctsEventId = input.correctsEventId;
          correctedKind = input.correctedKind;
          effectiveResponse = {
            message,
            resolution,
            selectedOption,
            decisionText,
            supportSummary,
          };
        } else {
          message = trim(input.message);
          resolution = "resolution" in input ? trim(input.resolution) : null;
          selectedOption =
            "selectedOption" in input && input.selectedOption !== undefined
              ? trim(input.selectedOption)
              : null;
          decisionText =
            "decisionText" in input && input.decisionText !== undefined
              ? trim(input.decisionText)
              : null;
          supportSummary =
            "supportSummary" in input ? trim(input.supportSummary) : null;
          this.assertResolveShape(item, input, {
            resolution,
            selectedOption,
            decisionText,
            supportSummary,
          });
        }
        const eventResult = await client.query<AttentionEventRow>(
          `
            INSERT INTO attention_events (
              id,workspace_id,project_id,attention_item_id,kind,message,
              from_status,to_status,resolution,selected_option,decision_text,
              support_summary,corrects_event_id,corrected_kind,
              actor_type,actor_role,actor_display_name,actor_client,
              on_behalf_of_role,resulting_project_version
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
              $15,$16,$17,$18,$19,$20
            ) RETURNING *
          `,
          [
            ids.attentionEvent(),
            WORKSPACE_ID,
            projectId,
            itemId,
            input.kind,
            message,
            item.status,
            toStatus,
            resolution,
            selectedOption,
            decisionText,
            supportSummary,
            correctsEventId,
            correctedKind,
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            version,
          ],
        );
        const updatedItemResult = await client.query<AttentionRow>(
          `
            UPDATE attention_items
            SET status=$1::varchar(16),updated_at=clock_timestamp(),
                resolved_at=CASE
                  WHEN $1::varchar(16)='RESOLVED' THEN clock_timestamp()
                  WHEN $1::varchar(16) IN ('OPEN','NEEDS_INFO') THEN NULL
                  ELSE resolved_at
                END
            WHERE id=$2 RETURNING *
          `,
          [toStatus, itemId],
        );
        const updated = await this.updateProject(client, projectId, {
          version,
        });
        const event = eventResult.rows[0];
        const updatedItem = updatedItemResult.rows[0];
        if (event === undefined || updatedItem === undefined) {
          throw new Error("ATTENTION_EVENT_RETURNING_EMPTY");
        }
        await this.audit(client, {
          project,
          updated,
          eventType:
            input.kind === "CORRECT_RESPONSE"
              ? "ATTENTION_RESPONSE_CORRECTED"
              : "ATTENTION_ITEM_UPDATED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: event.id,
        });
        return {
          project: projectDto(updated),
          attentionItem: attentionDto(updatedItem),
          event: attentionEventDto(event),
          effectiveResponse,
        };
      },
    );
  }

  async listAttentionItems(
    projectId: string,
    limit: number,
    cursor?: string,
    filters?: { type?: AttentionType; status?: AttentionStatus },
  ): Promise<Page<AttentionItemHistoryDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined
        ? undefined
        : decodeHistoryCursor(cursor, "attention");
    const result = await this.pool.query<AttentionRow>(
      `
        SELECT * FROM attention_items
        WHERE project_id=$1
          AND ($2::int IS NULL OR (resulting_project_version,id) < ($2::int,$3))
          AND ($5::varchar IS NULL OR type=$5::varchar)
          AND ($6::varchar IS NULL OR status=$6::varchar)
        ORDER BY resulting_project_version DESC,id DESC
        LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
        filters?.type ?? null,
        filters?.status ?? null,
      ],
    );
    const hasMore = result.rows.length > limit;
    const visible = result.rows.slice(0, limit);
    const itemIds = visible.map((row) => row.id);
    const eventResult = await this.pool.query<AttentionEventRow>(
      `
        SELECT * FROM attention_events
        WHERE attention_item_id=ANY($1::varchar[])
        ORDER BY resulting_project_version ASC,id ASC
      `,
      [itemIds],
    );
    const eventsByItem = new Map<string, AttentionEventRow[]>();
    for (const event of eventResult.rows) {
      const itemEvents = eventsByItem.get(event.attention_item_id) ?? [];
      itemEvents.push(event);
      eventsByItem.set(event.attention_item_id, itemEvents);
    }
    const items = visible.map((row): AttentionItemHistoryDto => {
      const events = eventsByItem.get(row.id) ?? [];
      const correctionByParent = new Map(
        events
          .filter(
            (
              event,
            ): event is AttentionEventRow & { corrects_event_id: string } =>
              event.kind === "CORRECT_RESPONSE" &&
              event.corrects_event_id !== null,
          )
          .map((event) => [event.corrects_event_id, event]),
      );
      const roots = events.filter((event) => event.kind !== "CORRECT_RESPONSE");
      return {
        item: attentionDto(row),
        eventHistory: roots.map((root) => {
          const corrections: AttentionEventRow[] = [];
          let current = root;
          for (;;) {
            const correction = correctionByParent.get(current.id);
            if (correction === undefined) break;
            corrections.push(correction);
            current = correction;
          }
          const effective = corrections.at(-1) ?? root;
          return {
            original: attentionEventDto(root),
            corrections: corrections.map(attentionEventDto),
            effectiveResponse: {
              message: effective.message,
              resolution: effective.resolution,
              selectedOption: effective.selected_option,
              decisionText: effective.decision_text,
              supportSummary: effective.support_summary,
            },
            stateEffect: {
              fromStatus: root.from_status,
              toStatus: root.to_status,
            },
          };
        }),
      };
    });
    const last = visible.at(-1);
    return {
      items,
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeHistoryCursor({
              v: 1,
              resultingProjectVersion: last.resulting_project_version,
              id: last.id,
            })
          : null,
    };
  }

  async createConclusion(
    projectId: string,
    input: CreateConclusionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{ project: ProjectAuthorityDto; conclusion: ConclusionDto }>
  > {
    return this.runWrite(
      "CREATE_CONCLUSION",
      "/api/v1/projects/:projectId/conclusions",
      201,
      context,
      async (client) => {
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        this.assertNonTerminal(project);
        await this.assertActiveEvidence(client, projectId, input.evidenceIds);
        if (
          (project.active_conclusion_id === null) !==
          (input.supersedesConclusionId === undefined)
        ) {
          throw new DomainError(
            "CONCLUSION_STATE_CONFLICT",
            "The conclusion must supersede exactly the current conclusion.",
            {
              conclusionId:
                project.active_conclusion_id ??
                input.supersedesConclusionId ??
                "NONE",
              currentStatus:
                project.active_conclusion_id === null ? "NONE" : "CURRENT",
              recovery: "CREATE_OR_SELECT_CURRENT_CONCLUSION",
            },
          );
        }
        if (
          project.active_conclusion_id !== null &&
          input.supersedesConclusionId !== project.active_conclusion_id
        ) {
          throw new DomainError(
            "CONCLUSION_STATE_CONFLICT",
            "The supplied conclusion is not current.",
            {
              conclusionId: input.supersedesConclusionId ?? "NONE",
              currentStatus: "SUPERSEDED",
              recovery: "CREATE_OR_SELECT_CURRENT_CONCLUSION",
            },
          );
        }
        const version = project.version + 1;
        const sequence = await client.query<{ value: number }>(
          "SELECT coalesce(max(sequence),0)::int+1 AS value FROM validation_conclusions WHERE project_id=$1",
          [projectId],
        );
        const declared = actorColumns(input.actor);
        const result = await client.query<ConclusionRow>(
          `
            INSERT INTO validation_conclusions (
              id,workspace_id,project_id,sequence,evidence_summary,limitations,
              uncertainties,recommendation,recommendation_note,supplemental_note,
              supersedes_conclusion_id,actor_type,actor_role,actor_display_name,
              actor_client,on_behalf_of_role,resulting_project_version
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
            ) RETURNING *
          `,
          [
            ids.conclusion(),
            WORKSPACE_ID,
            projectId,
            sequence.rows[0]?.value ?? 1,
            trim(input.evidenceSummary),
            JSON.stringify(input.limitations.map(trim)),
            JSON.stringify(input.uncertainties.map(trim)),
            input.recommendation,
            trim(input.recommendationNote),
            input.supplementalNote === undefined
              ? null
              : trim(input.supplementalNote),
            input.supersedesConclusionId ?? null,
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            version,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) throw new Error("CONCLUSION_RETURNING_EMPTY");
        for (const [position, evidenceId] of input.evidenceIds.entries()) {
          await client.query(
            `INSERT INTO conclusion_evidence
              (conclusion_id,project_id,evidence_id,position)
             VALUES ($1,$2,$3,$4)`,
            [row.id, projectId, evidenceId, position],
          );
        }
        if (input.supersedesConclusionId !== undefined) {
          await this.insertConclusionState(client, {
            projectId,
            conclusionId: input.supersedesConclusionId,
            status: "SUPERSEDED",
            confirmationId: null,
            reason: input.reason,
            actor: declared,
            version,
          });
        }
        await this.insertConclusionState(client, {
          projectId,
          conclusionId: row.id,
          status: "DRAFT",
          confirmationId: null,
          reason: input.reason,
          actor: declared,
          version,
        });
        row.evidence_ids = input.evidenceIds;
        row.effective_status = "DRAFT";
        const updated = await this.updateProject(client, projectId, {
          version,
          activeConclusionId: row.id,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "CONCLUSION_RECORDED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: row.id,
        });
        return {
          project: projectDto(updated),
          conclusion: conclusionDto(row),
        };
      },
    );
  }

  async listConclusions(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ConclusionDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined
        ? undefined
        : decodeHistoryCursor(cursor, "conclusion");
    const result = await this.pool.query<ConclusionRow>(
      `
        SELECT c.*,
          coalesce(
            (SELECT jsonb_agg(ce.evidence_id ORDER BY ce.position)
             FROM conclusion_evidence ce WHERE ce.conclusion_id=c.id),
            '[]'::jsonb
          ) AS evidence_ids,
          CASE
            WHEN c.id <> p.active_conclusion_id THEN 'SUPERSEDED'
            WHEN last_state.status='PENDING_CONFIRMATION'
              AND (hc.id IS NULL OR hc.decision <> 'PENDING'
                OR hc.expires_at <= clock_timestamp()
                OR hc.expected_project_version <> p.version)
              THEN 'DRAFT'
            ELSE coalesce(last_state.status,'DRAFT')
          END AS effective_status
        FROM validation_conclusions c
        JOIN validation_projects p ON p.id=c.project_id
        LEFT JOIN LATERAL (
          SELECT status,confirmation_id FROM conclusion_state_events
          WHERE conclusion_id=c.id ORDER BY recorded_at DESC,id DESC LIMIT 1
        ) last_state ON true
        LEFT JOIN human_confirmations hc ON hc.id=last_state.confirmation_id
        WHERE c.project_id=$1
          AND ($2::int IS NULL OR (c.resulting_project_version,c.id) < ($2::int,$3))
        ORDER BY c.resulting_project_version DESC,c.id DESC
        LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    return this.page(
      result.rows,
      limit,
      conclusionDto,
      (row) => row.resulting_project_version,
    );
  }

  async listProjectHistory(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProjectHistoryItemDto>> {
    await this.assertProjectExists(projectId);
    const decoded =
      cursor === undefined
        ? undefined
        : decodeHistoryCursor(cursor, "projectHistory");
    const index = await this.pool.query<ProjectHistoryIndexRow>(
      `
        SELECT kind,id,project_version FROM (
          SELECT
            'TRANSITION'::text AS kind,
            id,
            resulting_project_version AS project_version
          FROM project_transitions
          WHERE project_id=$1
          UNION ALL
          SELECT
            'AUDIT'::text AS kind,
            id,
            aggregate_version AS project_version
          FROM audit_events
          WHERE aggregate_type='PROJECT' AND aggregate_id=$1
        ) history
        WHERE $2::int IS NULL
          OR (project_version,id) < ($2::int,$3)
        ORDER BY project_version DESC,id DESC
        LIMIT $4
      `,
      [
        projectId,
        decoded?.resultingProjectVersion ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const transitionIds = index.rows
      .filter((row) => row.kind === "TRANSITION")
      .map((row) => row.id);
    const auditIds = index.rows
      .filter((row) => row.kind === "AUDIT")
      .map((row) => row.id);
    const [transitions, audits] = await Promise.all([
      this.pool.query<TransitionRow>(
        "SELECT * FROM project_transitions WHERE id=ANY($1::varchar[])",
        [transitionIds],
      ),
      this.pool.query<ProjectAuditRow>(
        "SELECT * FROM audit_events WHERE id=ANY($1::varchar[])",
        [auditIds],
      ),
    ]);
    const transitionById = new Map(
      transitions.rows.map((row) => [row.id, row]),
    );
    const auditById = new Map(audits.rows.map((row) => [row.id, row]));
    return this.page(
      index.rows,
      limit,
      (row): ProjectHistoryItemDto => {
        if (row.kind === "TRANSITION") {
          const transition = transitionById.get(row.id);
          if (transition === undefined) {
            throw new Error("PROJECT_HISTORY_TRANSITION_INVARIANT");
          }
          return {
            kind: "TRANSITION",
            projectVersion: row.project_version,
            transition: transitionDto(transition),
          };
        }
        const audit = auditById.get(row.id);
        if (audit === undefined) {
          throw new Error("PROJECT_HISTORY_AUDIT_INVARIANT");
        }
        return {
          kind: "AUDIT",
          projectVersion: row.project_version,
          audit: projectAuditDto(audit),
        };
      },
      (row) => row.project_version,
    );
  }

  async createConfirmation(
    projectId: string,
    input: CreateConfirmationRequest,
    context: CommandContext,
  ): Promise<ConfirmationCreationResult> {
    const result = await this.runWrite(
      "CREATE_CONFIRMATION",
      "/api/v1/projects/:projectId/human-confirmations",
      201,
      context,
      async (client) => {
        if (input.actor.actorType !== "HUMAN") {
          throw new DomainError(
            "PROJECT_PRECONDITION_FAILED",
            "Human confirmation creation requires a HUMAN actor declaration.",
            {
              missing: ["HUMAN_ACTOR"],
              recovery: "FIX_REQUEST_AND_USE_NEW_KEY",
            },
          );
        }
        const project = await this.lockProject(client, projectId);
        assertProjectExpectedVersion(project, input.expectedVersion);
        const pending = await client.query(
          `
            SELECT 1 FROM human_confirmations
            WHERE project_id=$1 AND decision='PENDING'
              AND expires_at > clock_timestamp()
              AND expected_project_version=$2
            FOR UPDATE
          `,
          [projectId, project.version],
        );
        if (pending.rowCount !== 0) {
          throw new DomainError(
            "CONFIRMATION_ALREADY_PENDING",
            "The project already has an active confirmation opportunity.",
            {
              confirmationId: "ACTIVE",
              recovery: "USE_ACTIVE_CONFIRMATION",
            },
          );
        }
        const facts = await this.confirmationFacts(client, project, input);
        const version = project.version + 1;
        const confirmationId = ids.confirmation();
        const expiresAt = new Date(this.now().getTime() + CONFIRMATION_TTL_MS);
        const payloadSummary = this.payloadSummary(
          project,
          version,
          input,
          facts,
        );
        const payloadDigest = confirmationPayloadDigest(payloadSummary);
        const capability = deriveConfirmationCapability({
          secret: this.humanControlToken,
          confirmationId,
          payloadDigest,
          expiresAt,
          idempotencyKey: context.idempotencyKey,
        });
        const declared = actorColumns(input.actor);
        const insert = await client.query<ConfirmationRow>(
          `
            INSERT INTO human_confirmations (
              id,workspace_id,project_id,operation,conclusion_id,
              terminal_transition_id,completion_summary,reopen_reason,next_step,
              payload_digest,payload_summary,expected_project_version,
              capability_hash,expires_at,confirmation_request_idempotency_key
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
            ) RETURNING *
          `,
          [
            confirmationId,
            WORKSPACE_ID,
            projectId,
            input.operation,
            "conclusionId" in input ? input.conclusionId : null,
            "terminalTransitionId" in input ? input.terminalTransitionId : null,
            "completionSummary" in input ? trim(input.completionSummary) : null,
            "reopenReason" in input ? trim(input.reopenReason) : null,
            "nextStep" in input ? trim(input.nextStep) : null,
            payloadDigest,
            JSON.stringify(payloadSummary),
            version,
            capabilityHash(capability),
            expiresAt,
            context.idempotencyKey,
          ],
        );
        const row = insert.rows[0];
        if (row === undefined) throw new Error("CONFIRMATION_RETURNING_EMPTY");
        if (facts.conclusion?.status === "DRAFT") {
          await this.insertConclusionState(client, {
            projectId,
            conclusionId: facts.conclusion.row.id,
            status: "PENDING_CONFIRMATION",
            confirmationId,
            reason: input.reason,
            actor: declared,
            version,
          });
        }
        const updated = await this.updateProject(client, projectId, {
          version,
        });
        await this.audit(client, {
          project,
          updated,
          eventType: "CONFIRMATION_REQUESTED",
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: confirmationId,
        });
        return {
          project: projectDto(updated),
          confirmation: confirmationDto(row, updated.version, this.now()),
        };
      },
    );
    if (!result.ok) return result;
    const confirmation = await this.pool.query<ConfirmationRow>(
      "SELECT * FROM human_confirmations WHERE id=$1",
      [result.data.confirmation.id],
    );
    const row = confirmation.rows[0];
    if (row === undefined) throw new Error("CONFIRMATION_REPLAY_INVARIANT");
    return {
      ...result,
      capability: deriveConfirmationCapability({
        secret: this.humanControlToken,
        confirmationId: row.id,
        payloadDigest: row.payload_digest,
        expiresAt: row.expires_at,
        idempotencyKey: row.confirmation_request_idempotency_key,
      }),
    };
  }

  async decideConfirmation(
    confirmationId: string,
    capability: string,
    input: ConfirmationDecisionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      confirmation: HumanConfirmationSummaryDto;
      conclusion: ConclusionDto | null;
      transition: ProjectTransitionDto | null;
    }>
  > {
    const preflight = await this.pool.query<ConfirmationRow>(
      "SELECT * FROM human_confirmations WHERE id=$1",
      [confirmationId],
    );
    const preflightRow = preflight.rows[0];
    if (preflightRow === undefined) {
      return {
        ok: false,
        status: 404,
        error: domainErrorPayload(
          notFound("CONFIRMATION_NOT_FOUND", "CONFIRMATION", confirmationId),
        ).error,
        requestId: context.requestId,
      };
    }
    if (
      capability === "" ||
      !secureHashEqual(capabilityHash(capability), preflightRow.capability_hash)
    ) {
      return {
        ok: false,
        status: 401,
        error: {
          code: "CONFIRMATION_CAPABILITY_REQUIRED",
          message: "A valid scoped confirmation capability is required.",
          retryable: false,
          details: { recovery: "USE_SCOPED_CONFIRMATION_COOKIE" },
        },
        requestId: context.requestId,
      };
    }
    return this.runWrite(
      "DECIDE_CONFIRMATION",
      "/api/v1/human-confirmations/:confirmationId/decisions",
      200,
      context,
      async (client) => {
        if (input.actor.actorType !== "HUMAN") {
          throw new DomainError(
            "PROJECT_PRECONDITION_FAILED",
            "A decision requires a HUMAN actor declaration.",
            {
              missing: ["HUMAN_ACTOR"],
              recovery: "FIX_REQUEST_AND_USE_NEW_KEY",
            },
          );
        }
        const confirmationResult = await client.query<ConfirmationRow>(
          "SELECT * FROM human_confirmations WHERE id=$1 FOR UPDATE",
          [confirmationId],
        );
        const confirmation = confirmationResult.rows[0];
        if (confirmation === undefined) {
          throw notFound(
            "CONFIRMATION_NOT_FOUND",
            "CONFIRMATION",
            confirmationId,
          );
        }
        const project = await this.lockProject(client, confirmation.project_id);
        if (confirmation.decision !== "PENDING") {
          throw new DomainError(
            "CONFIRMATION_ALREADY_DECIDED",
            "The confirmation has already been consumed.",
            {
              confirmationId,
              recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
            },
          );
        }
        if (confirmation.expires_at.getTime() <= this.now().getTime()) {
          throw new DomainError(
            "CONFIRMATION_EXPIRED",
            "The confirmation has expired.",
            {
              confirmationId,
              recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
            },
          );
        }
        if (
          input.expectedVersion !== confirmation.expected_project_version ||
          project.version !== confirmation.expected_project_version
        ) {
          throw new DomainError(
            "CONFIRMATION_STALE",
            "The project changed after the confirmation opportunity was created.",
            {
              confirmationId,
              recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
            },
          );
        }
        const rebuilt = await this.rebuildConfirmationPayload(
          client,
          project,
          confirmation,
        );
        if (
          confirmationPayloadDigest(rebuilt) !== confirmation.payload_digest ||
          canonicalConfirmationJson(rebuilt) !==
            canonicalConfirmationJson(confirmation.payload_summary)
        ) {
          throw new DomainError(
            "CONFIRMATION_STALE",
            "The bound confirmation payload no longer matches current facts.",
            {
              confirmationId,
              recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
            },
          );
        }
        const version = project.version + 1;
        const declared = actorColumns(input.actor);
        let transition: TransitionRow | null = null;
        let conclusion: ConclusionRow | null = null;
        if (confirmation.conclusion_id !== null) {
          conclusion = await this.loadConclusion(
            client,
            project.id,
            confirmation.conclusion_id,
          );
        }
        if (input.decision === "APPROVE") {
          if (
            confirmation.operation === "CONFIRM_CONCLUSION" ||
            (confirmation.operation !== "REOPEN_PROJECT" &&
              "conclusion" in confirmation.payload_summary &&
              confirmation.payload_summary.conclusion.statusAtRequest ===
                "DRAFT")
          ) {
            if (conclusion === null) throw new Error("CONCLUSION_REQUIRED");
            await this.insertConclusionState(client, {
              projectId: project.id,
              conclusionId: conclusion.id,
              status: "CONFIRMED",
              confirmationId,
              reason: input.reason,
              actor: declared,
              version,
            });
            conclusion.effective_status = "CONFIRMED";
          }
          if (confirmation.operation !== "CONFIRM_CONCLUSION") {
            transition = await this.insertDecisionTransition(
              client,
              project,
              confirmation,
              declared,
              input.reason,
              version,
            );
          }
        } else if (
          conclusion !== null &&
          "conclusion" in confirmation.payload_summary &&
          confirmation.payload_summary.conclusion.statusAtRequest === "DRAFT"
        ) {
          await this.insertConclusionState(client, {
            projectId: project.id,
            conclusionId: conclusion.id,
            status: "DRAFT",
            confirmationId,
            reason: input.reason,
            actor: declared,
            version,
          });
          conclusion.effective_status = "DRAFT";
        }
        const projectPatch =
          input.decision === "APPROVE" && transition !== null
            ? transition.kind === "REOPEN"
              ? {
                  version,
                  status: "IN_PROGRESS" as const,
                  currentNextStep: transition.next_step,
                  completedAt: null,
                  completionKind: null,
                }
              : {
                  version,
                  status: "COMPLETED" as const,
                  currentNextStep: null,
                  completedAt: transition.recorded_at,
                  completionKind: transition.kind as
                    "COMPLETE" | "STOP" | "TRANSFER",
                }
            : { version };
        const updated = await this.updateProject(
          client,
          project.id,
          projectPatch,
        );
        const decided = await client.query<ConfirmationRow>(
          `
            UPDATE human_confirmations SET
              decision=$1,decided_actor_type=$2,decided_actor_role=$3,
              decided_actor_display_name=$4,decided_actor_client=$5,
              decided_on_behalf_of_role=$6,decided_at=clock_timestamp(),
              decision_note=$7,decision_idempotency_key=$8,
              resulting_project_version=$9
            WHERE id=$10 AND decision='PENDING'
            RETURNING *
          `,
          [
            input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
            declared.actor_type,
            declared.actor_role,
            declared.actor_display_name,
            declared.actor_client,
            declared.on_behalf_of_role,
            trim(input.decisionNote),
            context.idempotencyKey,
            version,
            confirmationId,
          ],
        );
        const decidedRow = decided.rows[0];
        if (decidedRow === undefined) {
          throw new DomainError(
            "CONFIRMATION_ALREADY_DECIDED",
            "The confirmation was consumed concurrently.",
            {
              confirmationId,
              recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
            },
          );
        }
        const eventType =
          input.decision === "REJECT"
            ? "CONFIRMATION_REJECTED"
            : confirmation.operation === "CONFIRM_CONCLUSION"
              ? "CONCLUSION_CONFIRMED"
              : confirmation.operation === "COMPLETE_PROJECT"
                ? "PROJECT_COMPLETED"
                : confirmation.operation === "STOP_PROJECT"
                  ? "PROJECT_STOPPED"
                  : confirmation.operation === "TRANSFER_PROJECT"
                    ? "PROJECT_TRANSFERRED"
                    : "PROJECT_REOPENED";
        await this.audit(client, {
          project,
          updated,
          eventType,
          actor: declared,
          reason: input.reason,
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          relatedEventId: confirmationId,
        });
        if (conclusion !== null) {
          conclusion.evidence_ids = await this.conclusionEvidenceIds(
            client,
            conclusion.id,
          );
        }
        return {
          project: projectDto(updated),
          confirmation: confirmationDto(
            decidedRow,
            updated.version,
            this.now(),
          ),
          conclusion: conclusion === null ? null : conclusionDto(conclusion),
          transition: transition === null ? null : transitionDto(transition),
        };
      },
    );
  }

  async getConfirmation(
    confirmationId: string,
  ): Promise<HumanConfirmationSummaryDto | null> {
    const result = await this.pool.query<
      ConfirmationRow & { current_project_version: number }
    >(
      `
        SELECT hc.*,p.version AS current_project_version
        FROM human_confirmations hc
        JOIN validation_projects p ON p.id=hc.project_id
        WHERE hc.id=$1
      `,
      [confirmationId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : confirmationDto(row, row.current_project_version, this.now());
  }

  async validateConfirmationCapability(
    confirmationId: string,
    capability: string,
  ): Promise<boolean> {
    if (capability === "") return false;
    const result = await this.pool.query<{
      capability_hash: string;
      expires_at: Date;
    }>(
      "SELECT capability_hash,expires_at FROM human_confirmations WHERE id=$1",
      [confirmationId],
    );
    const row = result.rows[0];
    return (
      row !== undefined &&
      row.expires_at.getTime() > this.now().getTime() &&
      secureHashEqual(capabilityHash(capability), row.capability_hash)
    );
  }

  private async lockProject(
    client: PoolClient,
    projectId: string,
  ): Promise<ProjectRow> {
    const result = await client.query<ProjectRow>(
      "SELECT * FROM validation_projects WHERE id=$1 FOR UPDATE",
      [projectId],
    );
    const project = result.rows[0];
    if (project === undefined) {
      throw notFound("PROJECT_NOT_FOUND", "PROJECT", projectId);
    }
    return project;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const result = await this.pool.query(
      "SELECT 1 FROM validation_projects WHERE id=$1",
      [projectId],
    );
    if (result.rowCount !== 1) {
      throw notFound("PROJECT_NOT_FOUND", "PROJECT", projectId);
    }
  }

  private assertNonTerminal(project: ProjectRow): void {
    if (project.status === "COMPLETED") {
      throw new DomainError(
        "PROJECT_STATE_CONFLICT",
        "The project is completed and must be reopened before execution writes.",
        {
          projectId: project.id,
          currentStatus: project.status,
          allowedTransitions: ["REOPEN"],
          recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
        },
      );
    }
  }

  private async updateProject(
    client: PoolClient,
    projectId: string,
    patch: {
      version: number;
      status?: ProjectRow["status"];
      phase?: ProjectRow["phase"];
      currentNextStep?: string | null;
      latestProgressUpdateId?: string;
      activeConclusionId?: string;
      completedAt?: Date | null;
      completionKind?: "COMPLETE" | "STOP" | "TRANSFER" | null;
    },
  ): Promise<ProjectRow> {
    const result = await client.query<ProjectRow>(
      `
        UPDATE validation_projects SET
          version=$2,
          status=coalesce($3,status),
          phase=coalesce($4,phase),
          current_next_step=CASE WHEN $5::boolean THEN $6 ELSE current_next_step END,
          latest_progress_update_id=coalesce($7,latest_progress_update_id),
          active_conclusion_id=coalesce($8,active_conclusion_id),
          completed_at=CASE WHEN $9::boolean THEN $10 ELSE completed_at END,
          completion_kind=CASE WHEN $11::boolean THEN $12 ELSE completion_kind END,
          updated_at=clock_timestamp()
        WHERE id=$1 RETURNING *
      `,
      [
        projectId,
        patch.version,
        patch.status ?? null,
        patch.phase ?? null,
        "currentNextStep" in patch,
        patch.currentNextStep ?? null,
        patch.latestProgressUpdateId ?? null,
        patch.activeConclusionId ?? null,
        "completedAt" in patch,
        patch.completedAt ?? null,
        "completionKind" in patch,
        patch.completionKind ?? null,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("PROJECT_UPDATE_EMPTY");
    return row;
  }

  private async insertEvidence(
    client: PoolClient,
    projectId: string,
    input: CreateEvidenceRequest,
    version: number,
    replacesEvidenceId: string | null = null,
  ): Promise<EvidenceRow> {
    const declared = actorColumns(input.actor);
    const result = await client.query<EvidenceRow>(
      `
        INSERT INTO evidence_items (
          id,workspace_id,project_id,kind,title,summary,locator,metric_name,
          metric_value,metric_unit,captured_at,actor_type,actor_role,
          actor_display_name,actor_client,on_behalf_of_role,
          replaces_evidence_id,resulting_project_version
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
        ) RETURNING *
      `,
      [
        ids.evidence(),
        WORKSPACE_ID,
        projectId,
        input.kind,
        trim(input.title),
        trim(input.summary),
        "locator" in input ? trim(input.locator) : null,
        "metricName" in input ? trim(input.metricName) : null,
        "metricValue" in input ? trim(input.metricValue) : null,
        "metricUnit" in input && input.metricUnit !== undefined
          ? trim(input.metricUnit)
          : null,
        input.capturedAt,
        declared.actor_type,
        declared.actor_role,
        declared.actor_display_name,
        declared.actor_client,
        declared.on_behalf_of_role,
        replacesEvidenceId,
        version,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("EVIDENCE_RETURNING_EMPTY");
    return row;
  }

  private async lockActiveEvidence(
    client: PoolClient,
    projectId: string,
    evidenceId: string,
  ): Promise<EvidenceRow> {
    const result = await client.query<EvidenceRow>(
      `
        SELECT e.* FROM evidence_items e
        WHERE e.id=$1 AND e.project_id=$2
          AND NOT EXISTS (SELECT 1 FROM evidence_events x WHERE x.evidence_id=e.id)
        FOR UPDATE
      `,
      [evidenceId, projectId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      const exists = await client.query(
        "SELECT 1 FROM evidence_items WHERE id=$1",
        [evidenceId],
      );
      if (exists.rowCount === 0) {
        throw notFound("EVIDENCE_NOT_FOUND", "EVIDENCE", evidenceId);
      }
      throw new DomainError(
        "REFERENCE_NOT_ACTIVE",
        "The Evidence is not the active chain leaf.",
        {
          resourceType: "EVIDENCE",
          resourceId: evidenceId,
          recovery: "USE_ACTIVE_REPLACEMENT",
        },
      );
    }
    return row;
  }

  private async assertActiveEvidence(
    client: PoolClient,
    projectId: string,
    evidenceIds: readonly string[],
  ): Promise<void> {
    if (evidenceIds.length === 0) return;
    const result = await client.query<{ id: string }>(
      `
        SELECT e.id FROM evidence_items e
        WHERE e.project_id=$1 AND e.id=ANY($2::varchar[])
          AND NOT EXISTS (SELECT 1 FROM evidence_events x WHERE x.evidence_id=e.id)
      `,
      [projectId, evidenceIds],
    );
    if (result.rowCount !== evidenceIds.length) {
      const active = new Set(result.rows.map((row) => row.id));
      const invalidId = evidenceIds.find((id) => !active.has(id));
      if (invalidId === undefined) throw new Error("EVIDENCE_SET_INVARIANT");
      const existing = await client.query<{
        project_id: string;
        retracted: boolean;
      }>(
        `
          SELECT e.project_id,
            EXISTS (
              SELECT 1 FROM evidence_events event WHERE event.evidence_id=e.id
            ) AS retracted
          FROM evidence_items e WHERE e.id=$1
        `,
        [invalidId],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw notFound("EVIDENCE_NOT_FOUND", "EVIDENCE", invalidId);
      }
      if (row.project_id !== projectId) {
        throw new DomainError(
          "CROSS_PROJECT_REFERENCE",
          "The Evidence reference belongs to another project.",
          {
            resourceType: "EVIDENCE",
            resourceId: invalidId,
            projectId,
            recovery: "USE_SAME_PROJECT_REFERENCE",
          },
        );
      }
      if (row.retracted) {
        throw new DomainError(
          "REFERENCE_NOT_ACTIVE",
          "The Evidence reference is no longer active.",
          {
            resourceType: "EVIDENCE",
            resourceId: invalidId,
            recovery: "USE_ACTIVE_REPLACEMENT",
          },
        );
      }
      throw new Error("EVIDENCE_ACTIVITY_INVARIANT");
    }
  }

  private assertResolveShape(
    item: AttentionRow,
    input: AttentionEventRequest,
    values: {
      resolution: string | null;
      selectedOption: string | null;
      decisionText: string | null;
      supportSummary: string | null;
    },
  ): void {
    if (input.kind !== "RESOLVE") return;
    const valid =
      (item.type === "BLOCKER" && values.resolution !== null) ||
      (item.type === "DECISION_REQUEST" &&
        (values.selectedOption !== null) !== (values.decisionText !== null)) ||
      (item.type === "SUPPORT_REQUEST" && values.supportSummary !== null);
    if (!valid) {
      throw new DomainError(
        "PROJECT_PRECONDITION_FAILED",
        "The resolve payload does not match the attention item type.",
        {
          missing: ["TYPE_SPECIFIC_RESOLUTION"],
          recovery: "FIX_REQUEST_AND_USE_NEW_KEY",
        },
      );
    }
  }

  private assertCorrectionShape(
    itemType: AttentionRow["type"],
    input: Extract<AttentionEventRequest, { kind: "CORRECT_RESPONSE" }>,
  ): void {
    const replacement = input.replacement;
    const valid =
      input.correctedKind !== "RESOLVE" ||
      (itemType === "BLOCKER" &&
        "resolution" in replacement &&
        !("selectedOption" in replacement) &&
        !("decisionText" in replacement) &&
        !("supportSummary" in replacement)) ||
      (itemType === "DECISION_REQUEST" &&
        "selectedOption" in replacement !== "decisionText" in replacement &&
        !("resolution" in replacement) &&
        !("supportSummary" in replacement)) ||
      (itemType === "SUPPORT_REQUEST" &&
        "supportSummary" in replacement &&
        !("resolution" in replacement) &&
        !("selectedOption" in replacement) &&
        !("decisionText" in replacement));
    if (!valid) {
      throw new DomainError(
        "PROJECT_PRECONDITION_FAILED",
        "The correction replacement does not match the root response kind.",
        {
          missing: ["TYPE_SPECIFIC_CORRECTION"],
          recovery: "FIX_REQUEST_AND_USE_NEW_KEY",
        },
      );
    }
  }

  private async insertConclusionState(
    client: PoolClient,
    value: {
      projectId: string;
      conclusionId: string;
      status: "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SUPERSEDED";
      confirmationId: string | null;
      reason: string;
      actor: ActorColumns;
      version: number;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO conclusion_state_events (
          id,workspace_id,project_id,conclusion_id,status,confirmation_id,
          reason,actor_type,actor_role,actor_display_name,actor_client,
          on_behalf_of_role,resulting_project_version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        ids.event(),
        WORKSPACE_ID,
        value.projectId,
        value.conclusionId,
        value.status,
        value.confirmationId,
        trim(value.reason),
        value.actor.actor_type,
        value.actor.actor_role,
        value.actor.actor_display_name,
        value.actor.actor_client,
        value.actor.on_behalf_of_role,
        value.version,
      ],
    );
  }

  private async loadConclusion(
    client: PoolClient,
    projectId: string,
    conclusionId: string,
  ): Promise<ConclusionRow> {
    const result = await client.query<ConclusionRow>(
      "SELECT * FROM validation_conclusions WHERE id=$1 AND project_id=$2",
      [conclusionId, projectId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw notFound("CONCLUSION_NOT_FOUND", "CONCLUSION", conclusionId);
    }
    row.evidence_ids = await this.conclusionEvidenceIds(client, conclusionId);
    return row;
  }

  private async conclusionEvidenceIds(
    client: PoolClient,
    conclusionId: string,
  ): Promise<string[]> {
    const result = await client.query<{ evidence_id: string }>(
      "SELECT evidence_id FROM conclusion_evidence WHERE conclusion_id=$1 ORDER BY position",
      [conclusionId],
    );
    return result.rows.map((row) => row.evidence_id);
  }

  private async effectiveConclusionStatus(
    client: PoolClient,
    project: ProjectRow,
    conclusionId: string,
  ): Promise<"DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SUPERSEDED"> {
    if (project.active_conclusion_id !== conclusionId) return "SUPERSEDED";
    const result = await client.query<{
      status: "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SUPERSEDED";
      decision: "PENDING" | "APPROVED" | "REJECTED" | null;
      expires_at: Date | null;
      expected_project_version: number | null;
    }>(
      `
        SELECT s.status,h.decision,h.expires_at,h.expected_project_version
        FROM conclusion_state_events s
        LEFT JOIN human_confirmations h ON h.id=s.confirmation_id
        WHERE s.conclusion_id=$1
        ORDER BY s.recorded_at DESC,s.id DESC LIMIT 1
      `,
      [conclusionId],
    );
    const row = result.rows[0];
    if (row === undefined) return "DRAFT";
    if (
      row.status === "PENDING_CONFIRMATION" &&
      (row.decision !== "PENDING" ||
        row.expires_at === null ||
        row.expires_at.getTime() <= this.now().getTime() ||
        row.expected_project_version !== project.version)
    ) {
      return "DRAFT";
    }
    return row.status;
  }

  private async confirmationFacts(
    client: PoolClient,
    project: ProjectRow,
    input: CreateConfirmationRequest,
  ): Promise<{
    conclusion: {
      row: ConclusionRow;
      status: "DRAFT" | "CONFIRMED";
    } | null;
    transition: TransitionRow | null;
  }> {
    if (input.operation === "REOPEN_PROJECT") {
      if (project.status !== "COMPLETED") {
        throw new DomainError(
          "PROJECT_STATE_CONFLICT",
          "Only a completed project can be reopened.",
          {
            projectId: project.id,
            currentStatus: project.status,
            allowedTransitions: [],
            recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
          },
        );
      }
      const result = await client.query<TransitionRow>(
        `
          SELECT * FROM project_transitions
          WHERE id=$1 AND project_id=$2 AND kind IN ('COMPLETE','STOP','TRANSFER')
          ORDER BY resulting_project_version DESC LIMIT 1
        `,
        [input.terminalTransitionId, project.id],
      );
      const latest = await client.query<{ id: string }>(
        `
          SELECT id FROM project_transitions
          WHERE project_id=$1 AND kind IN ('COMPLETE','STOP','TRANSFER')
          ORDER BY resulting_project_version DESC,id DESC LIMIT 1
        `,
        [project.id],
      );
      const row = result.rows[0];
      if (row === undefined || latest.rows[0]?.id !== row.id) {
        throw new DomainError(
          "CROSS_PROJECT_REFERENCE",
          "REOPEN must reference the latest terminal transition.",
          {
            resourceType: "TRANSITION",
            resourceId: input.terminalTransitionId,
            projectId: project.id,
            recovery: "USE_SAME_PROJECT_REFERENCE",
          },
        );
      }
      return { conclusion: null, transition: row };
    }
    if (
      project.active_conclusion_id === null ||
      input.conclusionId !== project.active_conclusion_id
    ) {
      throw new DomainError(
        "CONCLUSION_STATE_CONFLICT",
        "The confirmation must use the current conclusion.",
        {
          conclusionId: input.conclusionId,
          currentStatus: "NOT_CURRENT",
          recovery: "CREATE_OR_SELECT_CURRENT_CONCLUSION",
        },
      );
    }
    const row = await this.loadConclusion(
      client,
      project.id,
      input.conclusionId,
    );
    const status = await this.effectiveConclusionStatus(
      client,
      project,
      row.id,
    );
    if (
      !["DRAFT", "CONFIRMED"].includes(status) ||
      (input.operation === "CONFIRM_CONCLUSION" && status !== "DRAFT")
    ) {
      throw new DomainError(
        "CONCLUSION_STATE_CONFLICT",
        "The conclusion state does not permit this confirmation.",
        {
          conclusionId: row.id,
          currentStatus: status,
          recovery: "CREATE_OR_SELECT_CURRENT_CONCLUSION",
        },
      );
    }
    assertRecommendationMatchesOperation(input.operation, row.recommendation);
    return {
      conclusion: {
        row,
        status: status as "DRAFT" | "CONFIRMED",
      },
      transition: null,
    };
  }

  private payloadSummary(
    project: ProjectRow,
    version: number,
    input: CreateConfirmationRequest,
    facts: {
      conclusion: {
        row: ConclusionRow;
        status: "DRAFT" | "CONFIRMED";
      } | null;
      transition: TransitionRow | null;
    },
  ): ConfirmationPayloadSummary {
    const common = {
      schemaVersion: 1 as const,
      projectId: project.id,
      projectVersion: version,
      projectStatus: project.status,
      projectPhase: project.phase,
    };
    if (input.operation === "REOPEN_PROJECT") {
      if (facts.transition === null || project.completed_at === null) {
        throw new Error("REOPEN_PAYLOAD_FACTS_REQUIRED");
      }
      if (
        facts.transition.kind !== "COMPLETE" &&
        facts.transition.kind !== "STOP" &&
        facts.transition.kind !== "TRANSFER"
      ) {
        throw new Error("REOPEN_TERMINAL_KIND_REQUIRED");
      }
      if (
        facts.transition.conclusion_id === null ||
        facts.transition.confirmation_id === null
      ) {
        throw new Error("REOPEN_TERMINAL_AUTHORITY_REQUIRED");
      }
      return {
        ...common,
        operation: "REOPEN_PROJECT",
        terminalTransition: {
          id: facts.transition.id,
          kind: facts.transition.kind,
          conclusionId: facts.transition.conclusion_id,
          confirmationId: facts.transition.confirmation_id,
          resultingProjectVersion: facts.transition.resulting_project_version,
          recordedAt: toIso(facts.transition.recorded_at),
        },
        completedAt: toIso(project.completed_at),
        reopenReason: trim(input.reopenReason),
        nextStep: trim(input.nextStep),
        targetProjectStatus: "IN_PROGRESS",
        targetProjectPhase: project.phase,
      };
    }
    if (facts.conclusion === null) {
      throw new Error("CONCLUSION_PAYLOAD_FACTS_REQUIRED");
    }
    const conclusion = {
      id: facts.conclusion.row.id,
      sequence: facts.conclusion.row.sequence,
      statusAtRequest: facts.conclusion.status,
      evidenceSummary: facts.conclusion.row.evidence_summary,
      evidenceIds: facts.conclusion.row.evidence_ids ?? [],
      limitations: facts.conclusion.row.limitations,
      uncertainties: facts.conclusion.row.uncertainties,
      recommendation: facts.conclusion.row.recommendation,
      recommendationNote: facts.conclusion.row.recommendation_note,
      supplementalNote: facts.conclusion.row.supplemental_note,
    };
    if (input.operation === "CONFIRM_CONCLUSION") {
      return {
        ...common,
        operation: input.operation,
        conclusion,
        targetConclusionStatus: "CONFIRMED",
      };
    }
    const terminal = {
      ...common,
      conclusion,
      targetConclusionStatus: "CONFIRMED" as const,
      completionSummary: trim(input.completionSummary),
      targetProjectStatus: "COMPLETED" as const,
    };
    switch (input.operation) {
      case "COMPLETE_PROJECT":
        return {
          ...terminal,
          operation: input.operation,
          completionKind: "COMPLETE",
        };
      case "STOP_PROJECT":
        return {
          ...terminal,
          operation: input.operation,
          completionKind: "STOP",
        };
      case "TRANSFER_PROJECT":
        return {
          ...terminal,
          operation: input.operation,
          completionKind: "TRANSFER",
        };
    }
  }

  private async rebuildConfirmationPayload(
    client: PoolClient,
    project: ProjectRow,
    confirmation: ConfirmationRow,
  ): Promise<ConfirmationPayloadSummary> {
    const request =
      confirmation.operation === "REOPEN_PROJECT"
        ? ({
            expectedVersion: project.version,
            actor: {
              actorType: "HUMAN",
              role: "MAINTAINER",
              displayName: "rebuild",
            },
            reason: "rebuild",
            operation: "REOPEN_PROJECT",
            terminalTransitionId: confirmation.terminal_transition_id ?? "",
            reopenReason: confirmation.reopen_reason ?? "",
            nextStep: confirmation.next_step ?? "",
          } satisfies CreateConfirmationRequest)
        : ({
            expectedVersion: project.version,
            actor: {
              actorType: "HUMAN",
              role: "MAINTAINER",
              displayName: "rebuild",
            },
            reason: "rebuild",
            operation: confirmation.operation,
            conclusionId: confirmation.conclusion_id ?? "",
            ...(confirmation.operation === "CONFIRM_CONCLUSION"
              ? {}
              : {
                  completionSummary: confirmation.completion_summary ?? "",
                }),
          } as CreateConfirmationRequest);
    let facts: {
      conclusion: {
        row: ConclusionRow;
        status: "DRAFT" | "CONFIRMED";
      } | null;
      transition: TransitionRow | null;
    };
    if (confirmation.operation === "REOPEN_PROJECT") {
      const transition = await client.query<TransitionRow>(
        `
          SELECT * FROM project_transitions
          WHERE id=$1 AND project_id=$2 AND kind IN ('COMPLETE','STOP','TRANSFER')
        `,
        [confirmation.terminal_transition_id, project.id],
      );
      const row = transition.rows[0];
      if (row === undefined) {
        throw new DomainError(
          "CONFIRMATION_STALE",
          "The bound terminal transition is no longer authoritative.",
          {
            confirmationId: confirmation.id,
            recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
          },
        );
      }
      facts = { conclusion: null, transition: row };
    } else {
      if (
        confirmation.conclusion_id === null ||
        project.active_conclusion_id !== confirmation.conclusion_id
      ) {
        throw new DomainError(
          "CONFIRMATION_STALE",
          "The bound conclusion is no longer current.",
          {
            confirmationId: confirmation.id,
            recovery: "CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE",
          },
        );
      }
      const row = await this.loadConclusion(
        client,
        project.id,
        confirmation.conclusion_id,
      );
      const pendingState = await client.query(
        `
          SELECT 1 FROM conclusion_state_events
          WHERE conclusion_id=$1 AND confirmation_id=$2
            AND status='PENDING_CONFIRMATION'
        `,
        [row.id, confirmation.id],
      );
      const status = pendingState.rowCount === 1 ? "DRAFT" : "CONFIRMED";
      assertRecommendationMatchesOperation(
        confirmation.operation,
        row.recommendation,
      );
      facts = { conclusion: { row, status }, transition: null };
    }
    return this.payloadSummary(
      project,
      confirmation.expected_project_version,
      request,
      facts,
    );
  }

  private async insertDecisionTransition(
    client: PoolClient,
    project: ProjectRow,
    confirmation: ConfirmationRow,
    actor: ActorColumns,
    reason: string,
    version: number,
  ): Promise<TransitionRow> {
    const isReopen = confirmation.operation === "REOPEN_PROJECT";
    const kind = isReopen
      ? "REOPEN"
      : confirmation.operation === "COMPLETE_PROJECT"
        ? "COMPLETE"
        : confirmation.operation === "STOP_PROJECT"
          ? "STOP"
          : "TRANSFER";
    const result = await client.query<TransitionRow>(
      `
        INSERT INTO project_transitions (
          id,workspace_id,project_id,kind,from_status,to_status,from_phase,
          to_phase,explanation,next_step,conclusion_id,confirmation_id,
          related_transition_id,resulting_project_version,actor_type,actor_role,
          actor_display_name,actor_client,on_behalf_of_role
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        ) RETURNING *
      `,
      [
        ids.transition(),
        WORKSPACE_ID,
        project.id,
        kind,
        project.status,
        isReopen ? "IN_PROGRESS" : "COMPLETED",
        project.phase,
        project.phase,
        isReopen
          ? trim(confirmation.reopen_reason ?? reason)
          : trim(confirmation.completion_summary ?? reason),
        isReopen ? trim(confirmation.next_step ?? "") : null,
        confirmation.conclusion_id,
        confirmation.id,
        confirmation.terminal_transition_id,
        version,
        actor.actor_type,
        actor.actor_role,
        actor.actor_display_name,
        actor.actor_client,
        actor.on_behalf_of_role,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("DECISION_TRANSITION_EMPTY");
    return row;
  }

  private async audit(
    client: PoolClient,
    value: {
      project: ProjectRow;
      updated: ProjectRow;
      eventType: string;
      actor: ActorColumns;
      reason: string;
      requestId: string;
      idempotencyKey: string;
      relatedEventId: string | null;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id,workspace_id,aggregate_type,aggregate_id,aggregate_version,
          event_type,actor_type,actor_role,actor_display_name,actor_client,
          on_behalf_of_role,reason,request_id,idempotency_key,before_summary,
          after_summary
        ) VALUES (
          $1,$2,'PROJECT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
        )
      `,
      [
        ids.event(),
        WORKSPACE_ID,
        value.updated.id,
        value.updated.version,
        value.eventType,
        value.actor.actor_type,
        value.actor.actor_role,
        value.actor.actor_display_name,
        value.actor.actor_client,
        value.actor.on_behalf_of_role,
        trim(value.reason),
        value.requestId,
        value.idempotencyKey,
        JSON.stringify({
          status: value.project.status,
          phase: value.project.phase,
          version: value.project.version,
        }),
        JSON.stringify({
          status: value.updated.status,
          phase: value.updated.phase,
          version: value.updated.version,
          relatedAuthorityId: value.relatedEventId,
        }),
      ],
    );
  }

  private async runWrite<T>(
    operation: string,
    routeTemplate: string,
    successStatus: number,
    context: CommandContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<WriteResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const inserted = await client.query(
        `
          INSERT INTO idempotency_records (
            workspace_id,idempotency_key,operation,route_template,
            request_digest,first_request_id,status
          ) VALUES ($1,$2,$3,$4,$5,$6,'IN_PROGRESS')
          ON CONFLICT DO NOTHING RETURNING idempotency_key
        `,
        [
          WORKSPACE_ID,
          context.idempotencyKey,
          operation,
          routeTemplate,
          context.requestDigest,
          context.requestId,
        ],
      );
      if (inserted.rowCount !== 1) {
        const existingResult = await client.query<IdempotencyRow>(
          `
            SELECT operation,request_digest,first_request_id,status,
              response_status,response_payload
            FROM idempotency_records
            WHERE workspace_id=$1 AND idempotency_key=$2
          `,
          [WORKSPACE_ID, context.idempotencyKey],
        );
        const existing = existingResult.rows[0];
        await client.query("ROLLBACK");
        if (existing === undefined || existing.status === "IN_PROGRESS") {
          return {
            ok: false,
            status: 409,
            error: {
              code: "IDEMPOTENCY_IN_PROGRESS",
              message: "The original request is still in progress.",
              retryable: true,
              details: { retryAfterMs: 250, recovery: "RETRY_SAME_KEY" },
            },
            requestId: context.requestId,
          };
        }
        if (existing.request_digest !== context.requestDigest) {
          return {
            ok: false,
            status: 409,
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message:
                "The idempotency key is already bound to a different intent.",
              retryable: false,
              details: {
                originalOperation: existing.operation,
                recovery: "USE_NEW_KEY_OR_REPLAY_ORIGINAL",
              },
            },
            requestId: context.requestId,
          };
        }
        if (existing.response_status === null) {
          throw new Error("IDEMPOTENCY_TERMINAL_INVARIANT");
        }
        if (existing.status === "SUCCEEDED") {
          return {
            ok: true,
            status: existing.response_status,
            data: existing.response_payload as T,
            requestId: existing.first_request_id,
            idempotentReplay: true,
          };
        }
        return {
          ok: false,
          status: existing.response_status,
          error: existing.response_payload as ErrorPayload,
          requestId: existing.first_request_id,
        };
      }
      try {
        const data = await work(client);
        await client.query(
          `
            UPDATE idempotency_records SET status='SUCCEEDED',
              response_status=$1,response_payload=$2,
              completed_at=clock_timestamp()
            WHERE workspace_id=$3 AND idempotency_key=$4
          `,
          [
            successStatus,
            JSON.stringify(data),
            WORKSPACE_ID,
            context.idempotencyKey,
          ],
        );
        await client.query("COMMIT");
        return {
          ok: true,
          status: successStatus,
          data,
          requestId: context.requestId,
          idempotentReplay: false,
        };
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        const rejection = domainErrorPayload(error);
        await client.query(
          `
            UPDATE idempotency_records SET status='REJECTED',
              response_status=$1,response_payload=$2,
              completed_at=clock_timestamp()
            WHERE workspace_id=$3 AND idempotency_key=$4
          `,
          [
            rejection.status,
            JSON.stringify(rejection.error),
            WORKSPACE_ID,
            context.idempotencyKey,
          ],
        );
        await client.query("COMMIT");
        return {
          ok: false,
          status: rejection.status,
          error: rejection.error,
          requestId: context.requestId,
        };
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "55P03") {
        return this.inProgress(context.requestId);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private inProgress<T>(requestId: string): WriteResult<T> {
    return {
      ok: false,
      status: 409,
      error: {
        code: "IDEMPOTENCY_IN_PROGRESS",
        message: "The original request is still in progress.",
        retryable: true,
        details: { retryAfterMs: 250, recovery: "RETRY_SAME_KEY" },
      },
      requestId,
    };
  }

  private page<Row, Dto>(
    rows: Row[],
    limit: number,
    map: (row: Row) => Dto,
    version: (row: Row) => number,
  ): Page<Dto> {
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map(map),
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeHistoryCursor({
              v: 1,
              resultingProjectVersion: version(last),
              id: (last as { id: string }).id,
            })
          : null,
    };
  }
}
