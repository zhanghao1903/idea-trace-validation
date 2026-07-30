import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ideas = pgTable(
  "ideas",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    intentSummary: varchar("intent_summary", { length: 4000 }).notNull(),
    proposerActorType: varchar("proposer_actor_type", { length: 16 }).notNull(),
    proposerRole: varchar("proposer_role", { length: 16 }).notNull(),
    proposerDisplayName: varchar("proposer_display_name", {
      length: 120,
    }).notNull(),
    proposerClient: varchar("proposer_client", { length: 120 }),
    desiredOutcome: varchar("desired_outcome", { length: 2000 }),
    intakeStatus: varchar("intake_status", { length: 32 }).notNull(),
    version: integer("version").notNull().default(1),
    projectId: varchar("project_id", { length: 31 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "ideas_id_format",
      sql`${table.id} ~ '^idea_[0-9A-HJKMNP-TV-Z]{26}$'`,
    ),
    check("ideas_version_positive", sql`${table.version} >= 1`),
    check(
      "ideas_status_valid",
      sql`${table.intakeStatus} IN ('IDEA', 'NEEDS_CLARIFICATION')`,
    ),
    uniqueIndex("ideas_project_unique").on(table.projectId),
    index("ideas_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const ideaStatements = pgTable(
  "idea_statements",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    ideaId: varchar("idea_id", { length: 31 })
      .notNull()
      .references(() => ideas.id),
    kind: varchar("kind", { length: 16 }).notNull(),
    text: varchar("text", { length: 2000 }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceRef: varchar("source_ref", { length: 128 }).notNull(),
    supersedesStatementId: varchar("supersedes_statement_id", { length: 31 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("idea_statements_kind", sql`${table.kind} IN ('FACT', 'HYPOTHESIS')`),
    check(
      "idea_statements_source",
      sql`${table.sourceType} IN ('CREATE_REQUEST', 'CLARIFICATION_ANSWER', 'CORRECTION')`,
    ),
    uniqueIndex("idea_statements_supersedes_unique").on(
      table.supersedesStatementId,
    ),
    index("idea_statements_idea_idx").on(
      table.ideaId,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const clarificationQuestions = pgTable(
  "clarification_questions",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    ideaId: varchar("idea_id", { length: 31 })
      .notNull()
      .references(() => ideas.id),
    prompt: varchar("prompt", { length: 1000 }).notNull(),
    targetField: varchar("target_field", { length: 32 }).notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("OPEN"),
    currentAnswerId: varchar("current_answer_id", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "clarification_questions_target",
      sql`${table.targetField} IN ('DESIRED_OUTCOME', 'HYPOTHESIS', 'FACT', 'OTHER')`,
    ),
    check(
      "clarification_questions_source",
      sql`${table.source} IN ('CALLER', 'SYSTEM')`,
    ),
    check(
      "clarification_questions_status",
      sql`${table.status} IN ('OPEN', 'ANSWERED')`,
    ),
    index("clarification_questions_idea_idx").on(
      table.ideaId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const clarificationAnswers = pgTable(
  "clarification_answers",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    ideaId: varchar("idea_id", { length: 31 })
      .notNull()
      .references(() => ideas.id),
    questionId: varchar("question_id", { length: 31 })
      .notNull()
      .references(() => clarificationQuestions.id),
    answerText: varchar("answer_text", { length: 4000 }).notNull(),
    desiredOutcomeRevision: varchar("desired_outcome_revision", {
      length: 2000,
    }),
    actorType: varchar("actor_type", { length: 16 }).notNull(),
    actorRole: varchar("actor_role", { length: 16 }).notNull(),
    actorDisplayName: varchar("actor_display_name", { length: 120 }).notNull(),
    actorClient: varchar("actor_client", { length: 120 }),
    onBehalfOfRole: varchar("on_behalf_of_role", { length: 16 }),
    reason: varchar("reason", { length: 500 }).notNull(),
    supersedesAnswerId: varchar("supersedes_answer_id", { length: 30 }),
    resultingIdeaVersion: integer("resulting_idea_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("clarification_answers_supersedes_unique").on(
      table.supersedesAnswerId,
    ),
    index("clarification_answers_question_idx").on(
      table.questionId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const validationProjects = pgTable(
  "validation_projects",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    ideaId: varchar("idea_id", { length: 31 })
      .notNull()
      .references(() => ideas.id),
    goal: varchar("goal", { length: 2000 }).notNull(),
    phase: varchar("phase", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    sourceIdeaVersion: integer("source_idea_version").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("validation_projects_idea_unique").on(table.ideaId),
    check("validation_projects_phase", sql`${table.phase} = 'PLANNING'`),
    check("validation_projects_status", sql`${table.status} = 'QUEUED'`),
    check("validation_projects_version", sql`${table.version} = 1`),
    index("validation_projects_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const projectHypotheses = pgTable(
  "project_hypotheses",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    sourceStatementId: varchar("source_statement_id", { length: 31 })
      .notNull()
      .references(() => ideaStatements.id),
    text: varchar("text", { length: 2000 }).notNull(),
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("project_hypotheses_source_unique").on(
      table.projectId,
      table.sourceStatementId,
    ),
    uniqueIndex("project_hypotheses_position_unique").on(
      table.projectId,
      table.position,
    ),
    check(
      "project_hypotheses_position",
      sql`${table.position} BETWEEN 0 AND 19`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    operation: varchar("operation", { length: 64 }).notNull(),
    routeTemplate: varchar("route_template", { length: 160 }).notNull(),
    requestDigest: char("request_digest", { length: 64 }).notNull(),
    firstRequestId: varchar("first_request_id", { length: 30 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    responseStatus: smallint("response_status"),
    responsePayload: jsonb("response_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.idempotencyKey] }),
    check(
      "idempotency_key_format",
      sql`${table.idempotencyKey} ~ '^[A-Za-z0-9._~:+/-]+$'`,
    ),
    check(
      "idempotency_status",
      sql`${table.status} IN ('IN_PROGRESS', 'SUCCEEDED', 'REJECTED')`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    aggregateType: varchar("aggregate_type", { length: 16 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 31 }).notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorType: varchar("actor_type", { length: 16 }).notNull(),
    actorRole: varchar("actor_role", { length: 16 }).notNull(),
    actorDisplayName: varchar("actor_display_name", { length: 120 }).notNull(),
    actorClient: varchar("actor_client", { length: 120 }),
    onBehalfOfRole: varchar("on_behalf_of_role", { length: 16 }),
    reason: varchar("reason", { length: 500 }).notNull(),
    requestId: varchar("request_id", { length: 30 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    beforeSummary: jsonb("before_summary"),
    afterSummary: jsonb("after_summary").notNull(),
    relatedEventId: varchar("related_event_id", { length: 30 }),
  },
  (table) => [
    check("audit_events_version", sql`${table.aggregateVersion} >= 1`),
    check(
      "audit_events_aggregate_type",
      sql`${table.aggregateType} IN ('IDEA', 'PROJECT')`,
    ),
    check(
      "audit_events_event_type",
      sql`${table.eventType} IN ('IDEA_CREATED', 'IDEA_CLARIFIED', 'IDEA_PROMOTED', 'CORRECTION_RECORDED')`,
    ),
    index("audit_events_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.occurredAt,
      table.id,
    ),
    index("audit_events_request_idx").on(table.requestId),
  ],
);

export const schemaMigrations = pgTable("schema_migrations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  checksum: char("checksum", { length: 64 }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
