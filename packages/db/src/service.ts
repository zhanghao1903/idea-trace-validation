import type {
  AnswerClarificationRequest,
  AnswerDto,
  AuditEventDto,
  CreateIdeaRequest,
  IdeaAuthorityDto,
  IdeaDetailDto,
  IdeaSummaryDto,
  ProjectAuthorityDto,
  ProjectDetailDto,
  ProjectHypothesisDto,
  ProjectMutationDto,
  ProjectSummaryDto,
  PromoteIdeaRequest,
  QuestionDto,
  StatementDto,
} from "@idea/contracts";
import {
  auditSummary,
  createIdFactory,
  decodeCursor,
  encodeCursor,
  type CommandContext,
  type ErrorPayload,
  type IdeaService,
  type Page,
  type WriteResult,
} from "@idea/application";
import {
  DomainError,
  WORKSPACE_ID,
  assertAnswerMatchesQuestion,
  assertDistinctTrimmedValues,
  assertExpectedVersion,
  assertMutableIdea,
  assertPromotionAllowed,
  calculateIntakeStatus,
  createValidationProject,
  type CurrentStatement,
  type DeclaredActor,
  type IdeaState,
} from "@idea/domain";
import type { Pool, PoolClient } from "pg";

interface IdeaRow {
  id: string;
  intent_summary: string;
  proposer_actor_type: "HUMAN" | "AI";
  proposer_role: "PROPOSER";
  proposer_display_name: string;
  proposer_client: string | null;
  desired_outcome: string | null;
  intake_status: "IDEA" | "NEEDS_CLARIFICATION";
  version: number;
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface StatementRow {
  id: string;
  kind: "FACT" | "HYPOTHESIS";
  text: string;
  source_type: "CREATE_REQUEST" | "CLARIFICATION_ANSWER" | "CORRECTION";
  source_ref: string;
  supersedes_statement_id: string | null;
  recorded_at: Date;
}

interface QuestionRow {
  id: string;
  idea_id: string;
  prompt: string;
  target_field: "DESIRED_OUTCOME" | "HYPOTHESIS" | "FACT" | "OTHER";
  source: "CALLER" | "SYSTEM";
  status: "OPEN" | "ANSWERED";
  current_answer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AnswerRow {
  id: string;
  answer_text: string;
  desired_outcome_revision: string | null;
  actor_type: "HUMAN" | "AI";
  actor_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER";
  actor_display_name: string;
  actor_client: string | null;
  on_behalf_of_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  reason: string;
  supersedes_answer_id: string | null;
  resulting_idea_version: number;
  created_at: Date;
}

interface ProjectRow {
  id: string;
  idea_id: string;
  goal: string;
  phase: "PLANNING";
  status: "QUEUED";
  source_idea_version: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface HypothesisRow {
  id: string;
  source_statement_id: string;
  text: string;
  position: number;
  created_at: Date;
}

interface AuditRow {
  id: string;
  aggregate_type: "IDEA" | "PROJECT";
  aggregate_id: string;
  aggregate_version: number;
  event_type:
    "IDEA_CREATED" | "IDEA_CLARIFIED" | "IDEA_PROMOTED" | "CORRECTION_RECORDED";
  occurred_at: Date;
  actor_type: "HUMAN" | "AI" | "SYSTEM";
  actor_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | "SYSTEM";
  actor_display_name: string;
  actor_client: string | null;
  on_behalf_of_role: "PROPOSER" | "EXECUTOR" | "MAINTAINER" | null;
  reason: string;
  request_id: string;
  before_summary: Readonly<Record<string, unknown>> | null;
  after_summary: Readonly<Record<string, unknown>>;
  related_event_id: string | null;
}

interface IdempotencyRow {
  operation: string;
  request_digest: string;
  first_request_id: string;
  status: "IN_PROGRESS" | "SUCCEEDED" | "REJECTED";
  response_status: number | null;
  response_payload: unknown;
}

const ids = createIdFactory();
const toIso = (value: Date): string => value.toISOString();
const trim = (value: string): string => value.trim();
const actor = (value: {
  actorType: "HUMAN" | "AI";
  role: "PROPOSER" | "EXECUTOR" | "MAINTAINER";
  displayName: string;
  client?: string;
  onBehalfOfRole?: "PROPOSER" | "EXECUTOR" | "MAINTAINER";
}): DeclaredActor => ({
  actorType: value.actorType,
  role: value.role,
  displayName: trim(value.displayName),
  client: value.client === undefined ? null : trim(value.client),
  onBehalfOfRole: value.onBehalfOfRole ?? null,
});

const ideaAuthority = (row: IdeaRow): IdeaAuthorityDto => ({
  id: row.id,
  intentSummary: row.intent_summary,
  proposer: {
    actorType: row.proposer_actor_type,
    role: row.proposer_role,
    displayName: row.proposer_display_name,
    client: row.proposer_client,
    onBehalfOfRole: null,
  },
  desiredOutcome: row.desired_outcome,
  intakeStatus: row.intake_status,
  version: row.version,
  projectId: row.project_id,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const statementDto = (row: StatementRow): StatementDto => ({
  id: row.id,
  kind: row.kind,
  text: row.text,
  sourceType: row.source_type,
  sourceRef: row.source_ref,
  supersedesStatementId: row.supersedes_statement_id,
  recordedAt: toIso(row.recorded_at),
});

const answerDto = (row: AnswerRow): AnswerDto => ({
  id: row.id,
  answerText: row.answer_text,
  desiredOutcomeRevision: row.desired_outcome_revision,
  declaredActor: {
    actorType: row.actor_type,
    role: row.actor_role,
    displayName: row.actor_display_name,
    client: row.actor_client,
    onBehalfOfRole: row.on_behalf_of_role,
  },
  reason: row.reason,
  supersedesAnswerId: row.supersedes_answer_id,
  resultingIdeaVersion: row.resulting_idea_version,
  createdAt: toIso(row.created_at),
});

const projectAuthority = (row: ProjectRow): ProjectAuthorityDto => ({
  id: row.id,
  ideaId: row.idea_id,
  goal: row.goal,
  phase: row.phase,
  status: row.status,
  sourceIdeaVersion: row.source_idea_version,
  version: row.version,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const hypothesisDto = (row: HypothesisRow): ProjectHypothesisDto => ({
  id: row.id,
  sourceStatementId: row.source_statement_id,
  text: row.text,
  position: row.position,
  createdAt: toIso(row.created_at),
});

const auditDto = (row: AuditRow): AuditEventDto => ({
  id: row.id,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  aggregateVersion: row.aggregate_version,
  eventType: row.event_type,
  occurredAt: toIso(row.occurred_at),
  declaredActor: {
    actorType: row.actor_type,
    role: row.actor_role,
    displayName: row.actor_display_name,
    client: row.actor_client,
    onBehalfOfRole: row.on_behalf_of_role,
  },
  reason: row.reason,
  requestId: row.request_id,
  beforeSummary: row.before_summary ?? null,
  afterSummary: row.after_summary,
  relatedEventId: row.related_event_id,
});

const domainErrorPayload = (
  error: DomainError,
): { status: number; error: ErrorPayload } => {
  const statusByCode: Readonly<Record<string, number>> = {
    VALIDATION_FAILED: 400,
    IDEA_NOT_FOUND: 404,
    QUESTION_NOT_FOUND: 404,
    PROJECT_NOT_FOUND: 404,
    VERSION_CONFLICT: 409,
    ALREADY_PROMOTED: 409,
    IDEA_ALREADY_PROMOTED: 409,
    PROMOTION_PRECONDITION_FAILED: 422,
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

const notFound = (
  code: "IDEA_NOT_FOUND" | "QUESTION_NOT_FOUND" | "PROJECT_NOT_FOUND",
  resourceType: "IDEA" | "QUESTION" | "PROJECT",
  resourceId: string,
) =>
  new DomainError(code, `${resourceType} was not found.`, {
    resourceType,
    resourceId,
    recovery: "VERIFY_ID_AND_REFETCH",
  });

const stateFrom = (row: IdeaRow): IdeaState => ({
  id: row.id,
  desiredOutcome: row.desired_outcome,
  intakeStatus: row.intake_status,
  version: row.version,
  projectId: row.project_id,
});

export class PostgresIdeaService implements IdeaService {
  constructor(private readonly pool: Pool) {}

  async createIdea(
    input: CreateIdeaRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      created: { statementIds: string[]; questionIds: string[] };
    }>
  > {
    return this.runWrite(
      {
        operation: "CREATE_IDEA",
        routeTemplate: "/api/v1/ideas",
        successStatus: 201,
        context,
      },
      async (client) => {
        assertDistinctTrimmedValues(
          "/facts",
          input.facts.map((entry) => entry.text),
        );
        assertDistinctTrimmedValues(
          "/hypotheses",
          input.hypotheses.map((entry) => entry.text),
        );
        assertDistinctTrimmedValues(
          "/clarificationQuestions",
          input.clarificationQuestions.map((entry) => entry.prompt),
        );

        const ideaId = ids.idea();
        const statementInputs = [
          ...input.facts.map((entry) => ({
            kind: "FACT" as const,
            text: trim(entry.text),
          })),
          ...input.hypotheses.map((entry) => ({
            kind: "HYPOTHESIS" as const,
            text: trim(entry.text),
          })),
        ];
        const questions: {
          prompt: string;
          targetField: "DESIRED_OUTCOME" | "HYPOTHESIS" | "FACT" | "OTHER";
          source: "CALLER" | "SYSTEM";
        }[] = input.clarificationQuestions.map((question) => ({
          prompt: trim(question.prompt),
          targetField: question.targetField,
          source: "CALLER",
        }));
        if (
          input.desiredOutcome === undefined &&
          !questions.some(
            (question) => question.targetField === "DESIRED_OUTCOME",
          )
        ) {
          questions.push({
            prompt: "What outcome should this validation achieve?",
            targetField: "DESIRED_OUTCOME",
            source: "SYSTEM",
          });
        }
        if (
          input.hypotheses.length === 0 &&
          !questions.some((question) => question.targetField === "HYPOTHESIS")
        ) {
          questions.push({
            prompt: "What hypothesis should the validation test?",
            targetField: "HYPOTHESIS",
            source: "SYSTEM",
          });
        }

        const statementIds = statementInputs.map(() => ids.statement());
        const questionIds = questions.map(() => ids.question());
        const desiredOutcome =
          input.desiredOutcome === undefined
            ? null
            : trim(input.desiredOutcome);
        const intakeStatus = calculateIntakeStatus(
          desiredOutcome,
          statementInputs.map((entry, index) => ({
            id: statementIds[index] ?? "",
            kind: entry.kind,
            text: entry.text,
          })),
          questions.map((question, index) => ({
            id: questionIds[index] ?? "",
            targetField: question.targetField,
          })),
        );
        const proposer = input.proposer;
        const insertedIdea = await client.query<IdeaRow>(
          `
            INSERT INTO ideas (
              id, workspace_id, intent_summary, proposer_actor_type, proposer_role,
              proposer_display_name, proposer_client, desired_outcome, intake_status
            ) VALUES ($1, $2, $3, $4, 'PROPOSER', $5, $6, $7, $8)
            RETURNING *
          `,
          [
            ideaId,
            WORKSPACE_ID,
            trim(input.intentSummary),
            proposer.actorType,
            trim(proposer.displayName),
            proposer.client === undefined ? null : trim(proposer.client),
            desiredOutcome,
            intakeStatus,
          ],
        );
        for (const [index, entry] of statementInputs.entries()) {
          await client.query(
            `
              INSERT INTO idea_statements
                (id, workspace_id, idea_id, kind, text, source_type, source_ref)
              VALUES ($1, $2, $3, $4, $5, 'CREATE_REQUEST', $6)
            `,
            [
              statementIds[index],
              WORKSPACE_ID,
              ideaId,
              entry.kind,
              entry.text,
              context.requestId,
            ],
          );
        }
        for (const [index, question] of questions.entries()) {
          await client.query(
            `
              INSERT INTO clarification_questions
                (id, workspace_id, idea_id, prompt, target_field, source)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              questionIds[index],
              WORKSPACE_ID,
              ideaId,
              question.prompt,
              question.targetField,
              question.source,
            ],
          );
        }
        await this.insertAudit(client, {
          aggregateType: "IDEA",
          aggregateId: ideaId,
          aggregateVersion: 1,
          eventType: "IDEA_CREATED",
          actor: actor(input.actor),
          reason: trim(input.reason),
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          beforeSummary: null,
          afterSummary: auditSummary({
            status: intakeStatus,
            version: 1,
            statementIds,
            changedFieldNames: [
              "intentSummary",
              "proposer",
              ...(desiredOutcome === null ? [] : ["desiredOutcome"]),
            ],
          }),
        });
        const row = insertedIdea.rows[0];
        if (row === undefined) throw new Error("CREATE_IDEA_RETURNING_EMPTY");
        return {
          idea: ideaAuthority(row),
          created: { statementIds, questionIds },
        };
      },
    );
  }

  async answerClarification(
    ideaId: string,
    questionId: string,
    input: AnswerClarificationRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      answer: AnswerDto;
      createdStatementIds: string[];
      openQuestionCount: number;
    }>
  > {
    return this.runWrite(
      {
        operation: "ANSWER_CLARIFICATION",
        routeTemplate:
          "/api/v1/ideas/:ideaId/clarifications/:questionId/answers",
        successStatus: 200,
        context,
      },
      async (client) => {
        const idea = await this.lockIdea(client, ideaId);
        assertMutableIdea(stateFrom(idea));
        assertExpectedVersion(stateFrom(idea), input.expectedVersion);
        const questionResult = await client.query<QuestionRow>(
          "SELECT * FROM clarification_questions WHERE id = $1 AND idea_id = $2 FOR UPDATE",
          [questionId, ideaId],
        );
        const question = questionResult.rows[0];
        if (question === undefined)
          throw notFound("QUESTION_NOT_FOUND", "QUESTION", questionId);

        assertDistinctTrimmedValues(
          "/newFacts",
          input.newFacts.map((entry) => entry.text),
        );
        assertDistinctTrimmedValues(
          "/newHypotheses",
          input.newHypotheses.map((entry) => entry.text),
        );
        assertAnswerMatchesQuestion(
          question.target_field,
          question.current_answer_id,
          input,
        );

        const correctionTargets = [
          ...input.newFacts.map((entry) => ({
            kind: "FACT" as const,
            id: entry.supersedesStatementId,
          })),
          ...input.newHypotheses.map((entry) => ({
            kind: "HYPOTHESIS" as const,
            id: entry.supersedesStatementId,
          })),
        ].filter(
          (target): target is { kind: "FACT" | "HYPOTHESIS"; id: string } =>
            target.id !== undefined,
        );
        if (
          new Set(correctionTargets.map((target) => target.id)).size !==
          correctionTargets.length
        ) {
          throw new DomainError(
            "VALIDATION_FAILED",
            "A current statement can be corrected only once per command.",
            {
              issues: [
                {
                  path: "/supersedesStatementId",
                  keyword: "uniqueCorrectionTarget",
                  message: "must not be repeated in the same command",
                },
              ],
              recovery: "FIX_REQUEST",
            },
          );
        }
        for (const target of correctionTargets) {
          const current = await client.query<{ id: string }>(
            `
              SELECT target.id
              FROM idea_statements target
              WHERE target.id = $1 AND target.idea_id = $2 AND target.kind = $3
                AND NOT EXISTS (
                  SELECT 1 FROM idea_statements newer
                  WHERE newer.supersedes_statement_id = target.id
                )
              FOR UPDATE
            `,
            [target.id, ideaId, target.kind],
          );
          if (current.rowCount !== 1) {
            throw new DomainError(
              "VALIDATION_FAILED",
              "A statement correction must target a current statement of the same kind.",
              {
                issues: [
                  {
                    path: "/supersedesStatementId",
                    keyword: "currentStatement",
                    message:
                      "must reference a current statement of the same Idea and kind",
                  },
                ],
                recovery: "FIX_REQUEST",
              },
            );
          }
        }

        const nextVersion = idea.version + 1;
        const answerId = ids.answer();
        const declaredActor = actor(input.actor);
        const answerResult = await client.query<AnswerRow>(
          `
            INSERT INTO clarification_answers (
              id, workspace_id, idea_id, question_id, answer_text,
              desired_outcome_revision, actor_type, actor_role, actor_display_name,
              actor_client, on_behalf_of_role, reason, supersedes_answer_id,
              resulting_idea_version
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            ) RETURNING *
          `,
          [
            answerId,
            WORKSPACE_ID,
            ideaId,
            questionId,
            trim(input.answerText),
            input.desiredOutcomeRevision === undefined
              ? null
              : trim(input.desiredOutcomeRevision),
            declaredActor.actorType,
            declaredActor.role,
            declaredActor.displayName,
            declaredActor.client,
            declaredActor.onBehalfOfRole,
            trim(input.reason),
            input.supersedesAnswerId ?? null,
            nextVersion,
          ],
        );
        await client.query(
          `
            UPDATE clarification_questions
            SET status = 'ANSWERED', current_answer_id = $1, updated_at = clock_timestamp()
            WHERE id = $2
          `,
          [answerId, questionId],
        );

        const createdStatementIds: string[] = [];
        for (const [kind, entries] of [
          ["FACT", input.newFacts],
          ["HYPOTHESIS", input.newHypotheses],
        ] as const) {
          for (const entry of entries) {
            const statementId = ids.statement();
            const correction = entry.supersedesStatementId !== undefined;
            await client.query(
              `
                INSERT INTO idea_statements (
                  id, workspace_id, idea_id, kind, text, source_type, source_ref,
                  supersedes_statement_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `,
              [
                statementId,
                WORKSPACE_ID,
                ideaId,
                kind,
                trim(entry.text),
                correction ? "CORRECTION" : "CLARIFICATION_ANSWER",
                answerId,
                entry.supersedesStatementId ?? null,
              ],
            );
            createdStatementIds.push(statementId);
          }
        }

        const currentStatements = await this.currentStatements(client, ideaId);
        const openQuestionResult = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
            FROM clarification_questions
            WHERE idea_id = $1 AND status = 'OPEN'
          `,
          [ideaId],
        );
        const openQuestionCount = Number(
          openQuestionResult.rows[0]?.count ?? "0",
        );
        const desiredOutcome =
          input.desiredOutcomeRevision === undefined
            ? idea.desired_outcome
            : trim(input.desiredOutcomeRevision);
        const intakeStatus = calculateIntakeStatus(
          desiredOutcome,
          currentStatements,
          Array.from({ length: openQuestionCount }, (_, index) => ({
            id: String(index),
            targetField: "OTHER" as const,
          })),
        );
        const updated = await client.query<IdeaRow>(
          `
            UPDATE ideas
            SET desired_outcome = $1, intake_status = $2, version = $3,
                updated_at = clock_timestamp()
            WHERE id = $4
            RETURNING *
          `,
          [desiredOutcome, intakeStatus, nextVersion, ideaId],
        );
        const correction =
          input.supersedesAnswerId !== undefined ||
          [...input.newFacts, ...input.newHypotheses].some(
            (entry) => entry.supersedesStatementId !== undefined,
          );
        await this.insertAudit(client, {
          aggregateType: "IDEA",
          aggregateId: ideaId,
          aggregateVersion: nextVersion,
          eventType: correction ? "CORRECTION_RECORDED" : "IDEA_CLARIFIED",
          actor: declaredActor,
          reason: trim(input.reason),
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          beforeSummary: auditSummary({
            status: idea.intake_status,
            version: idea.version,
          }),
          afterSummary: auditSummary({
            status: intakeStatus,
            version: nextVersion,
            questionId,
            answerId,
            statementIds: createdStatementIds,
            changedFieldNames: [
              "clarificationQuestions",
              ...(input.desiredOutcomeRevision === undefined
                ? []
                : ["desiredOutcome"]),
              ...(createdStatementIds.length === 0 ? [] : ["statements"]),
            ],
          }),
        });
        const updatedIdea = updated.rows[0];
        const answer = answerResult.rows[0];
        if (updatedIdea === undefined || answer === undefined) {
          throw new Error("ANSWER_RETURNING_EMPTY");
        }
        return {
          idea: ideaAuthority(updatedIdea),
          answer: answerDto(answer),
          createdStatementIds,
          openQuestionCount,
        };
      },
    );
  }

  async promoteIdea(
    ideaId: string,
    input: PromoteIdeaRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      project: ProjectMutationDto;
    }>
  > {
    return this.runWrite(
      {
        operation: "PROMOTE_IDEA",
        routeTemplate: "/api/v1/ideas/:ideaId/promotions",
        successStatus: 201,
        context,
      },
      async (client) => {
        const idea = await this.lockIdea(client, ideaId);
        const statements = await this.currentStatements(client, ideaId);
        const declaredActor = actor(input.actor);
        if (idea.project_id !== null) {
          assertPromotionAllowed(
            stateFrom(idea),
            statements,
            input.explicitIntent,
            declaredActor,
          );
        }
        assertExpectedVersion(stateFrom(idea), input.expectedVersion);
        assertPromotionAllowed(
          stateFrom(idea),
          statements,
          input.explicitIntent,
          declaredActor,
        );
        const goal = idea.desired_outcome;
        if (goal === null) throw new Error("PROMOTION_GOAL_INVARIANT");

        const nextIdeaVersion = idea.version + 1;
        const projectId = ids.project();
        const project = createValidationProject(
          projectId,
          ideaId,
          goal,
          idea.version,
        );
        const projectResult = await client.query<ProjectRow>(
          `
            INSERT INTO validation_projects (
              id, workspace_id, idea_id, goal, phase, status, source_idea_version, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            project.id,
            WORKSPACE_ID,
            project.ideaId,
            project.goal,
            project.phase,
            project.status,
            project.sourceIdeaVersion,
            project.version,
          ],
        );
        const hypotheses = statements.filter(
          (statement) => statement.kind === "HYPOTHESIS",
        );
        const projectHypotheses: ProjectHypothesisDto[] = [];
        for (const [position, hypothesis] of hypotheses.entries()) {
          const result = await client.query<HypothesisRow>(
            `
              INSERT INTO project_hypotheses (
                id, workspace_id, project_id, source_statement_id, text, position
              ) VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING *
            `,
            [
              ids.hypothesis(),
              WORKSPACE_ID,
              projectId,
              hypothesis.id,
              hypothesis.text,
              position,
            ],
          );
          const row = result.rows[0];
          if (row === undefined)
            throw new Error("PROJECT_HYPOTHESIS_RETURNING_EMPTY");
          projectHypotheses.push(hypothesisDto(row));
        }
        const updated = await client.query<IdeaRow>(
          `
            UPDATE ideas
            SET project_id = $1, version = $2, updated_at = clock_timestamp()
            WHERE id = $3
            RETURNING *
          `,
          [projectId, nextIdeaVersion, ideaId],
        );
        await this.insertAudit(client, {
          aggregateType: "IDEA",
          aggregateId: ideaId,
          aggregateVersion: nextIdeaVersion,
          eventType: "IDEA_PROMOTED",
          actor: declaredActor,
          reason: trim(input.reason),
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey,
          beforeSummary: auditSummary({
            status: idea.intake_status,
            version: idea.version,
          }),
          afterSummary: auditSummary({
            status: idea.intake_status,
            version: nextIdeaVersion,
            projectId,
            changedFieldNames: ["projectId"],
          }),
        });
        const projectRow = projectResult.rows[0];
        const updatedIdea = updated.rows[0];
        if (projectRow === undefined || updatedIdea === undefined) {
          throw new Error("PROMOTION_RETURNING_EMPTY");
        }
        return {
          idea: ideaAuthority(updatedIdea),
          project: {
            authority: projectAuthority(projectRow),
            hypotheses: projectHypotheses,
          },
        };
      },
    );
  }

  async listIdeas(
    view: "proposer" | "executor",
    limit: number,
    cursor?: string,
  ): Promise<Page<IdeaSummaryDto>> {
    const decoded =
      cursor === undefined ? undefined : decodeCursor(cursor, "idea");
    const result = await this.pool.query<
      IdeaRow & {
        open_question_count: number;
        current_fact_count: number;
        current_hypothesis_count: number;
      }
    >(
      `
        SELECT i.*,
          (SELECT count(*)::int FROM clarification_questions q
            WHERE q.idea_id = i.id AND q.status = 'OPEN') AS open_question_count,
          (SELECT count(*)::int FROM idea_statements s
            WHERE s.idea_id = i.id AND s.kind = 'FACT'
              AND NOT EXISTS (SELECT 1 FROM idea_statements n WHERE n.supersedes_statement_id = s.id)
          ) AS current_fact_count,
          (SELECT count(*)::int FROM idea_statements s
            WHERE s.idea_id = i.id AND s.kind = 'HYPOTHESIS'
              AND NOT EXISTS (SELECT 1 FROM idea_statements n WHERE n.supersedes_statement_id = s.id)
          ) AS current_hypothesis_count
        FROM ideas i
        WHERE i.workspace_id = $1
          AND ($2::timestamptz IS NULL OR (i.updated_at, i.id) < ($2::timestamptz, $3))
        ORDER BY i.updated_at DESC, i.id DESC
        LIMIT $4
      `,
      [
        WORKSPACE_ID,
        decoded?.updatedAt ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const items: IdeaSummaryDto[] = [];
    for (const row of rows) {
      const client = await this.pool.connect();
      try {
        const current = await this.currentStatements(client, row.id);
        const openQuestions = await client.query<{
          id: string;
          prompt: string;
          target_field: "DESIRED_OUTCOME" | "HYPOTHESIS" | "FACT" | "OTHER";
        }>(
          `
            SELECT id, prompt, target_field
            FROM clarification_questions
            WHERE idea_id = $1 AND status = 'OPEN'
            ORDER BY created_at, id
          `,
          [row.id],
        );
        items.push({
          authority: ideaAuthority(row),
          openQuestionCount: row.open_question_count,
          currentFactCount: row.current_fact_count,
          currentHypothesisCount: row.current_hypothesis_count,
          focus:
            view === "proposer"
              ? {
                  view,
                  intentSummary: row.intent_summary,
                  openQuestions: openQuestions.rows.map((question) => ({
                    id: question.id,
                    prompt: question.prompt,
                    targetField: question.target_field,
                  })),
                }
              : {
                  view,
                  desiredOutcome: row.desired_outcome,
                  hypotheses: current
                    .filter((statement) => statement.kind === "HYPOTHESIS")
                    .map((statement) => ({
                      id: statement.id,
                      text: statement.text,
                    })),
                  readyToPromote:
                    row.project_id === null &&
                    row.desired_outcome !== null &&
                    row.current_hypothesis_count > 0 &&
                    row.open_question_count === 0,
                },
        });
      } finally {
        client.release();
      }
    }
    const last = rows.at(-1);
    return {
      items,
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({
              v: 1,
              updatedAt: toIso(last.updated_at),
              id: last.id,
            })
          : null,
    };
  }

  async getIdea(
    ideaId: string,
    view: "proposer" | "executor",
  ): Promise<IdeaDetailDto | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<IdeaRow>(
        "SELECT * FROM ideas WHERE id = $1",
        [ideaId],
      );
      const idea = result.rows[0];
      if (idea === undefined) return null;
      const statementHistory = await client.query<StatementRow>(
        "SELECT * FROM idea_statements WHERE idea_id = $1 ORDER BY recorded_at, id",
        [ideaId],
      );
      const current = statementHistory.rows.filter(
        (statement) =>
          !statementHistory.rows.some(
            (candidate) => candidate.supersedes_statement_id === statement.id,
          ),
      );
      const questionResult = await client.query<QuestionRow>(
        "SELECT * FROM clarification_questions WHERE idea_id = $1 ORDER BY created_at, id",
        [ideaId],
      );
      const questions: QuestionDto[] = [];
      for (const question of questionResult.rows) {
        const answers = await client.query<AnswerRow>(
          "SELECT * FROM clarification_answers WHERE question_id = $1 ORDER BY created_at, id",
          [question.id],
        );
        questions.push({
          id: question.id,
          prompt: question.prompt,
          targetField: question.target_field,
          source: question.source,
          status: question.status,
          currentAnswerId: question.current_answer_id,
          createdAt: toIso(question.created_at),
          updatedAt: toIso(question.updated_at),
          answers: answers.rows.map(answerDto),
        });
      }
      const audit = await client.query<AuditRow>(
        `
          SELECT * FROM audit_events
          WHERE aggregate_type = 'IDEA' AND aggregate_id = $1
          ORDER BY occurred_at, id
        `,
        [ideaId],
      );
      const project =
        idea.project_id === null
          ? null
          : await this.getProjectSummary(client, idea.project_id, view);
      const openQuestions = questions.filter(
        (question) => question.status === "OPEN",
      );
      const hypotheses = current.filter(
        (statement) => statement.kind === "HYPOTHESIS",
      );
      return {
        authority: ideaAuthority(idea),
        currentStatements: current.map(statementDto),
        statementHistory: statementHistory.rows.map(statementDto),
        clarificationQuestions: questions,
        project,
        history: audit.rows.map(auditDto),
        focus:
          view === "proposer"
            ? {
                view,
                intentSummary: idea.intent_summary,
                openQuestions: openQuestions.map((question) => ({
                  id: question.id,
                  prompt: question.prompt,
                  targetField: question.targetField,
                })),
              }
            : {
                view,
                desiredOutcome: idea.desired_outcome,
                hypotheses: hypotheses.map((statement) => ({
                  id: statement.id,
                  text: statement.text,
                })),
                readyToPromote:
                  idea.project_id === null &&
                  idea.desired_outcome !== null &&
                  hypotheses.length > 0 &&
                  openQuestions.length === 0,
              },
      };
    } finally {
      client.release();
    }
  }

  async listProjects(
    view: "proposer" | "executor",
    limit: number,
    cursor?: string,
  ): Promise<Page<ProjectSummaryDto>> {
    const decoded =
      cursor === undefined ? undefined : decodeCursor(cursor, "project");
    const result = await this.pool.query<ProjectRow>(
      `
        SELECT * FROM validation_projects
        WHERE workspace_id = $1
          AND ($2::timestamptz IS NULL OR (updated_at, id) < ($2::timestamptz, $3))
        ORDER BY updated_at DESC, id DESC
        LIMIT $4
      `,
      [
        WORKSPACE_ID,
        decoded?.updatedAt ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const client = await this.pool.connect();
    try {
      const items = await Promise.all(
        rows.map(async (row) => {
          const item = await this.getProjectSummary(client, row.id, view);
          if (item === null) throw new Error("PROJECT_SUMMARY_INVARIANT");
          return item;
        }),
      );
      const last = rows.at(-1);
      return {
        items,
        limit,
        nextCursor:
          hasMore && last !== undefined
            ? encodeCursor({
                v: 1,
                updatedAt: toIso(last.updated_at),
                id: last.id,
              })
            : null,
      };
    } finally {
      client.release();
    }
  }

  async getProject(
    projectId: string,
    view: "proposer" | "executor",
  ): Promise<ProjectDetailDto | null> {
    const client = await this.pool.connect();
    try {
      const projectResult = await client.query<ProjectRow>(
        "SELECT * FROM validation_projects WHERE id = $1",
        [projectId],
      );
      const project = projectResult.rows[0];
      if (project === undefined) return null;
      const ideaResult = await client.query<IdeaRow>(
        "SELECT * FROM ideas WHERE id = $1",
        [project.idea_id],
      );
      const idea = ideaResult.rows[0];
      if (idea === undefined) throw new Error("PROJECT_IDEA_INVARIANT");
      const hypothesesResult = await client.query<HypothesisRow>(
        "SELECT * FROM project_hypotheses WHERE project_id = $1 ORDER BY position",
        [projectId],
      );
      const hypotheses = hypothesesResult.rows.map(hypothesisDto);
      const authority = projectAuthority(project);
      const sourceIdea = ideaAuthority(idea);
      const proposerFocus = {
        view: "proposer" as const,
        sourceIdea: {
          id: idea.id,
          intentSummary: idea.intent_summary,
          proposer: sourceIdea.proposer,
          desiredOutcome: project.goal,
        },
        projectOutcome: { goal: project.goal, status: "QUEUED" as const },
      };
      return {
        authority,
        hypotheses,
        sourceIdea,
        focus:
          view === "proposer"
            ? proposerFocus
            : {
                view,
                execution: {
                  goal: project.goal,
                  phase: project.phase,
                  status: project.status,
                  version: project.version,
                },
                hypotheses,
                sourceIdea: { id: idea.id, version: idea.version },
              },
      };
    } finally {
      client.release();
    }
  }

  private async runWrite<T>(
    spec: {
      operation: string;
      routeTemplate: string;
      successStatus: number;
      context: CommandContext;
    },
    work: (client: PoolClient) => Promise<T>,
  ): Promise<WriteResult<T>> {
    const client = await this.pool.connect();
    let ownsKey = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const inserted = await client.query(
        `
          INSERT INTO idempotency_records (
            workspace_id, idempotency_key, operation, route_template,
            request_digest, first_request_id, status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_PROGRESS')
          ON CONFLICT DO NOTHING
          RETURNING idempotency_key
        `,
        [
          WORKSPACE_ID,
          spec.context.idempotencyKey,
          spec.operation,
          spec.routeTemplate,
          spec.context.requestDigest,
          spec.context.requestId,
        ],
      );
      ownsKey = inserted.rowCount === 1;
      if (!ownsKey) {
        const existingResult = await client.query<IdempotencyRow>(
          `
            SELECT operation, request_digest, first_request_id, status,
                   response_status, response_payload
            FROM idempotency_records
            WHERE workspace_id = $1 AND idempotency_key = $2
          `,
          [WORKSPACE_ID, spec.context.idempotencyKey],
        );
        const existing = existingResult.rows[0];
        await client.query("ROLLBACK");
        if (existing === undefined || existing.status === "IN_PROGRESS") {
          return this.inProgress(spec.context.requestId);
        }
        if (existing.request_digest !== spec.context.requestDigest) {
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
            requestId: spec.context.requestId,
          };
        }
        if (existing.response_status === null)
          throw new Error("IDEMPOTENCY_TERMINAL_INVARIANT");
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
            UPDATE idempotency_records
            SET status = 'SUCCEEDED', response_status = $1, response_payload = $2,
                completed_at = clock_timestamp()
            WHERE workspace_id = $3 AND idempotency_key = $4
          `,
          [
            spec.successStatus,
            JSON.stringify(data),
            WORKSPACE_ID,
            spec.context.idempotencyKey,
          ],
        );
        await client.query("COMMIT");
        return {
          ok: true,
          status: spec.successStatus,
          data,
          requestId: spec.context.requestId,
          idempotentReplay: false,
        };
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        const rejection = domainErrorPayload(error);
        await client.query(
          `
            UPDATE idempotency_records
            SET status = 'REJECTED', response_status = $1, response_payload = $2,
                completed_at = clock_timestamp()
            WHERE workspace_id = $3 AND idempotency_key = $4
          `,
          [
            rejection.status,
            JSON.stringify(rejection.error),
            WORKSPACE_ID,
            spec.context.idempotencyKey,
          ],
        );
        await client.query("COMMIT");
        return {
          ok: false,
          status: rejection.status,
          error: rejection.error,
          requestId: spec.context.requestId,
        };
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "55P03") {
        return this.inProgress(spec.context.requestId);
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

  private async lockIdea(client: PoolClient, ideaId: string): Promise<IdeaRow> {
    const result = await client.query<IdeaRow>(
      "SELECT * FROM ideas WHERE id = $1 FOR UPDATE",
      [ideaId],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound("IDEA_NOT_FOUND", "IDEA", ideaId);
    return row;
  }

  private async currentStatements(
    client: PoolClient,
    ideaId: string,
  ): Promise<CurrentStatement[]> {
    const result = await client.query<StatementRow>(
      `
        SELECT current.*
        FROM idea_statements current
        WHERE current.idea_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM idea_statements newer
            WHERE newer.supersedes_statement_id = current.id
          )
        ORDER BY current.recorded_at, current.id
      `,
      [ideaId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
    }));
  }

  private async insertAudit(
    client: PoolClient,
    value: {
      aggregateType: "IDEA" | "PROJECT";
      aggregateId: string;
      aggregateVersion: number;
      eventType:
        | "IDEA_CREATED"
        | "IDEA_CLARIFIED"
        | "IDEA_PROMOTED"
        | "CORRECTION_RECORDED";
      actor: DeclaredActor;
      reason: string;
      requestId: string;
      idempotencyKey: string;
      beforeSummary: Readonly<Record<string, unknown>> | null;
      afterSummary: Readonly<Record<string, unknown>>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id, workspace_id, aggregate_type, aggregate_id, aggregate_version,
          event_type, actor_type, actor_role, actor_display_name, actor_client,
          on_behalf_of_role, reason, request_id, idempotency_key,
          before_summary, after_summary
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      `,
      [
        ids.event(),
        WORKSPACE_ID,
        value.aggregateType,
        value.aggregateId,
        value.aggregateVersion,
        value.eventType,
        value.actor.actorType,
        value.actor.role,
        value.actor.displayName,
        value.actor.client,
        value.actor.onBehalfOfRole,
        value.reason,
        value.requestId,
        value.idempotencyKey,
        value.beforeSummary === null
          ? null
          : JSON.stringify(value.beforeSummary),
        JSON.stringify(value.afterSummary),
      ],
    );
  }

  private async getProjectSummary(
    client: PoolClient,
    projectId: string,
    view: "proposer" | "executor",
  ): Promise<ProjectSummaryDto | null> {
    const result = await client.query<ProjectRow>(
      "SELECT * FROM validation_projects WHERE id = $1",
      [projectId],
    );
    const project = result.rows[0];
    if (project === undefined) return null;
    const ideaResult = await client.query<IdeaRow>(
      "SELECT * FROM ideas WHERE id = $1",
      [project.idea_id],
    );
    const idea = ideaResult.rows[0];
    if (idea === undefined) throw new Error("PROJECT_IDEA_INVARIANT");
    const authority = projectAuthority(project);
    if (view === "proposer") {
      return {
        authority,
        focus: {
          view,
          sourceIdea: {
            id: idea.id,
            intentSummary: idea.intent_summary,
            proposer: ideaAuthority(idea).proposer,
            desiredOutcome: project.goal,
          },
          projectOutcome: { goal: project.goal, status: "QUEUED" },
        },
      };
    }
    const countResult = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM project_hypotheses WHERE project_id = $1",
      [projectId],
    );
    return {
      authority,
      focus: {
        view,
        execution: {
          goal: project.goal,
          phase: project.phase,
          status: project.status,
          version: project.version,
        },
        hypothesisCount: countResult.rows[0]?.count ?? 0,
        sourceIdea: { id: idea.id, version: idea.version },
      },
    };
  }
}
