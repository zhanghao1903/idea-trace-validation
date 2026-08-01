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

const actorColumns = () => ({
  actorType: varchar("actor_type", { length: 16 }).notNull(),
  actorRole: varchar("actor_role", { length: 16 }).notNull(),
  actorDisplayName: varchar("actor_display_name", { length: 120 }).notNull(),
  actorClient: varchar("actor_client", { length: 120 }),
  onBehalfOfRole: varchar("on_behalf_of_role", { length: 16 }),
});

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
    currentNextStep: varchar("current_next_step", { length: 2000 }),
    latestProgressUpdateId: varchar("latest_progress_update_id", {
      length: 31,
    }),
    activeConclusionId: varchar("active_conclusion_id", { length: 31 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionKind: varchar("completion_kind", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("validation_projects_idea_unique").on(table.ideaId),
    check(
      "validation_projects_phase",
      sql`${table.phase} IN ('PLANNING', 'BUILDING', 'VALIDATING', 'CONCLUDING')`,
    ),
    check(
      "validation_projects_status",
      sql`${table.status} IN ('QUEUED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED')`,
    ),
    check("validation_projects_version", sql`${table.version} >= 1`),
    check(
      "validation_projects_completion_projection",
      sql`(
        ${table.status} = 'COMPLETED'
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completionKind} IS NOT NULL
      ) OR (
        ${table.status} <> 'COMPLETED'
        AND ${table.completedAt} IS NULL
        AND ${table.completionKind} IS NULL
      )`,
    ),
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

export const projectTransitions = pgTable(
  "project_transitions",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    kind: varchar("kind", { length: 24 }).notNull(),
    fromStatus: varchar("from_status", { length: 16 }).notNull(),
    toStatus: varchar("to_status", { length: 16 }).notNull(),
    fromPhase: varchar("from_phase", { length: 16 }).notNull(),
    toPhase: varchar("to_phase", { length: 16 }).notNull(),
    explanation: varchar("explanation", { length: 2000 }).notNull(),
    nextStep: varchar("next_step", { length: 2000 }),
    conclusionId: varchar("conclusion_id", { length: 31 }),
    confirmationId: varchar("confirmation_id", { length: 34 }),
    relatedTransitionId: varchar("related_transition_id", { length: 30 }),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
    ...actorColumns(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("project_transitions_project_version_unique").on(
      table.projectId,
      table.resultingProjectVersion,
    ),
    index("project_transitions_history_idx").on(
      table.projectId,
      table.resultingProjectVersion,
      table.id,
    ),
  ],
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    kind: varchar("kind", { length: 16 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    summary: varchar("summary", { length: 2000 }).notNull(),
    locator: varchar("locator", { length: 2048 }),
    metricName: varchar("metric_name", { length: 200 }),
    metricValue: varchar("metric_value", { length: 200 }),
    metricUnit: varchar("metric_unit", { length: 80 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...actorColumns(),
    replacesEvidenceId: varchar("replaces_evidence_id", { length: 30 }),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
  },
  (table) => [
    uniqueIndex("evidence_items_project_version_unique").on(
      table.projectId,
      table.resultingProjectVersion,
    ),
    uniqueIndex("evidence_items_replacement_unique").on(
      table.replacesEvidenceId,
    ),
    index("evidence_project_history_idx").on(
      table.projectId,
      table.resultingProjectVersion,
      table.id,
    ),
  ],
);

export const evidenceEvents = pgTable(
  "evidence_events",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    evidenceId: varchar("evidence_id", { length: 30 })
      .notNull()
      .references(() => evidenceItems.id),
    kind: varchar("kind", { length: 16 }).notNull(),
    replacementEvidenceId: varchar("replacement_evidence_id", { length: 30 }),
    reason: varchar("reason", { length: 500 }).notNull(),
    ...actorColumns(),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("evidence_events_evidence_unique").on(table.evidenceId),
  ],
);

export const progressUpdates = pgTable(
  "progress_updates",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    sequence: integer("sequence").notNull(),
    summary: varchar("summary", { length: 2000 }).notNull(),
    completedWork: jsonb("completed_work").$type<string[]>().notNull(),
    nextStep: varchar("next_step", { length: 2000 }).notNull(),
    projectStatusAtSubmission: varchar("project_status_at_submission", {
      length: 16,
    }).notNull(),
    phaseAtSubmission: varchar("phase_at_submission", {
      length: 16,
    }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...actorColumns(),
    correctsProgressId: varchar("corrects_progress_id", { length: 31 }),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
  },
  (table) => [
    uniqueIndex("progress_updates_project_sequence_unique").on(
      table.projectId,
      table.sequence,
    ),
    uniqueIndex("progress_updates_project_version_unique").on(
      table.projectId,
      table.resultingProjectVersion,
    ),
    uniqueIndex("progress_updates_correction_unique").on(
      table.correctsProgressId,
    ),
  ],
);

export const progressUpdateEvidence = pgTable(
  "progress_update_evidence",
  {
    progressUpdateId: varchar("progress_update_id", { length: 31 })
      .notNull()
      .references(() => progressUpdates.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    evidenceId: varchar("evidence_id", { length: 30 })
      .notNull()
      .references(() => evidenceItems.id),
    position: smallint("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.progressUpdateId, table.evidenceId] }),
    uniqueIndex("progress_update_evidence_position_unique").on(
      table.progressUpdateId,
      table.position,
    ),
  ],
);

export const attentionItems = pgTable(
  "attention_items",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    type: varchar("type", { length: 24 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("OPEN"),
    background: varchar("background", { length: 2000 }),
    impact: varchar("impact", { length: 2000 }),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    recommendation: varchar("recommendation", { length: 1000 }),
    decisionImpact: varchar("decision_impact", { length: 2000 }),
    waitingForRole: varchar("waiting_for_role", { length: 16 }),
    supportNeeded: varchar("support_needed", { length: 2000 }),
    requestReason: varchar("request_reason", { length: 2000 }),
    expectedResponderRole: varchar("expected_responder_role", { length: 16 }),
    ...actorColumns(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
  },
  (table) => [
    uniqueIndex("attention_items_project_version_unique").on(
      table.projectId,
      table.resultingProjectVersion,
    ),
    index("attention_open_idx").on(
      table.projectId,
      table.status,
      table.resultingProjectVersion,
    ),
  ],
);

export const attentionEvents = pgTable(
  "attention_events",
  {
    id: varchar("id", { length: 33 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    attentionItemId: varchar("attention_item_id", { length: 31 })
      .notNull()
      .references(() => attentionItems.id),
    kind: varchar("kind", { length: 24 }).notNull(),
    message: varchar("message", { length: 2000 }).notNull(),
    fromStatus: varchar("from_status", { length: 16 }).notNull(),
    toStatus: varchar("to_status", { length: 16 }).notNull(),
    resolution: varchar("resolution", { length: 2000 }),
    selectedOption: varchar("selected_option", { length: 500 }),
    decisionText: varchar("decision_text", { length: 2000 }),
    supportSummary: varchar("support_summary", { length: 2000 }),
    correctsEventId: varchar("corrects_event_id", { length: 33 }),
    correctedKind: varchar("corrected_kind", { length: 24 }),
    ...actorColumns(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
  },
  (table) => [
    uniqueIndex("attention_events_project_version_unique").on(
      table.projectId,
      table.resultingProjectVersion,
    ),
    uniqueIndex("attention_events_correction_unique").on(table.correctsEventId),
  ],
);

export const validationConclusions = pgTable(
  "validation_conclusions",
  {
    id: varchar("id", { length: 31 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    sequence: integer("sequence").notNull(),
    evidenceSummary: varchar("evidence_summary", { length: 4000 }).notNull(),
    limitations: jsonb("limitations").$type<string[]>().notNull(),
    uncertainties: jsonb("uncertainties").$type<string[]>().notNull(),
    recommendation: varchar("recommendation", { length: 16 }).notNull(),
    recommendationNote: varchar("recommendation_note", {
      length: 2000,
    }).notNull(),
    supplementalNote: varchar("supplemental_note", { length: 2000 }),
    supersedesConclusionId: varchar("supersedes_conclusion_id", { length: 31 }),
    ...actorColumns(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resultingProjectVersion: integer("resulting_project_version").notNull(),
  },
  (table) => [
    uniqueIndex("validation_conclusions_project_sequence_unique").on(
      table.projectId,
      table.sequence,
    ),
    uniqueIndex("validation_conclusions_supersession_unique").on(
      table.supersedesConclusionId,
    ),
  ],
);

export const conclusionEvidence = pgTable(
  "conclusion_evidence",
  {
    conclusionId: varchar("conclusion_id", { length: 31 })
      .notNull()
      .references(() => validationConclusions.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    evidenceId: varchar("evidence_id", { length: 30 })
      .notNull()
      .references(() => evidenceItems.id),
    position: smallint("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conclusionId, table.evidenceId] }),
    uniqueIndex("conclusion_evidence_position_unique").on(
      table.conclusionId,
      table.position,
    ),
  ],
);

export const conclusionStateEvents = pgTable("conclusion_state_events", {
  id: varchar("id", { length: 30 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 })
    .notNull()
    .references(() => workspaces.id),
  projectId: varchar("project_id", { length: 31 })
    .notNull()
    .references(() => validationProjects.id),
  conclusionId: varchar("conclusion_id", { length: 31 })
    .notNull()
    .references(() => validationConclusions.id),
  status: varchar("status", { length: 24 }).notNull(),
  confirmationId: varchar("confirmation_id", { length: 34 }),
  reason: varchar("reason", { length: 500 }).notNull(),
  ...actorColumns(),
  resultingProjectVersion: integer("resulting_project_version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const humanConfirmations = pgTable(
  "human_confirmations",
  {
    id: varchar("id", { length: 34 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    operation: varchar("operation", { length: 32 }).notNull(),
    conclusionId: varchar("conclusion_id", { length: 31 }),
    terminalTransitionId: varchar("terminal_transition_id", { length: 30 }),
    completionSummary: varchar("completion_summary", { length: 2000 }),
    reopenReason: varchar("reopen_reason", { length: 2000 }),
    nextStep: varchar("next_step", { length: 2000 }),
    payloadDigest: char("payload_digest", { length: 64 }).notNull(),
    payloadSummary: jsonb("payload_summary")
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    expectedProjectVersion: integer("expected_project_version").notNull(),
    capabilityHash: char("capability_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decision: varchar("decision", { length: 16 }).notNull().default("PENDING"),
    decidedActorType: varchar("decided_actor_type", { length: 16 }),
    decidedActorRole: varchar("decided_actor_role", { length: 16 }),
    decidedActorDisplayName: varchar("decided_actor_display_name", {
      length: 120,
    }),
    decidedActorClient: varchar("decided_actor_client", { length: 120 }),
    decidedOnBehalfOfRole: varchar("decided_on_behalf_of_role", { length: 16 }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: varchar("decision_note", { length: 2000 }),
    decisionIdempotencyKey: varchar("decision_idempotency_key", {
      length: 128,
    }),
    resultingProjectVersion: integer("resulting_project_version"),
    confirmationRequestIdempotencyKey: varchar(
      "confirmation_request_idempotency_key",
      { length: 128 },
    ).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("human_confirmations_project_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    index("human_confirmations_expiry_idx").on(table.decision, table.expiresAt),
  ],
);

export const projectReports = pgTable(
  "project_reports",
  {
    id: varchar("id", { length: 30 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    currentAcceptedRevision: integer("current_accepted_revision")
      .notNull()
      .default(0),
    currentRenderableRevision: integer("current_renderable_revision"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("project_reports_workspace_project_unique").on(
      table.workspaceId,
      table.projectId,
    ),
    uniqueIndex("project_reports_authority_unique").on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
  ],
);

export const reportRevisions = pgTable(
  "report_revisions",
  {
    reportId: varchar("report_id", { length: 30 })
      .notNull()
      .references(() => projectReports.id),
    revision: integer("revision").notNull(),
    projectId: varchar("project_id", { length: 31 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
    previousRevision: integer("previous_revision"),
    schemaVersion: varchar("schema_version", { length: 32 }).notNull(),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    sourceDocument: jsonb("source_document")
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    renderModel: jsonb("render_model")
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    renderStatus: varchar("render_status", { length: 24 }).notNull(),
    compilerVersion: varchar("compiler_version", { length: 64 }).notNull(),
    submittedByType: varchar("submitted_by_type", { length: 16 }).notNull(),
    submittedByRole: varchar("submitted_by_role", { length: 16 }).notNull(),
    submittedByDisplayName: varchar("submitted_by_display_name", {
      length: 120,
    }).notNull(),
    submittedByClient: varchar("submitted_by_client", { length: 120 }),
    submittedOnBehalfOfRole: varchar("submitted_on_behalf_of_role", {
      length: 16,
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.revision] }),
    index("report_revisions_project_history_idx").on(
      table.projectId,
      table.revision,
      table.reportId,
    ),
  ],
);

export const reportSubmissionKeys = pgTable(
  "report_submission_keys",
  {
    workspaceId: varchar("workspace_id", { length: 64 })
      .notNull()
      .references(() => workspaces.id),
    projectId: varchar("project_id", { length: 31 })
      .notNull()
      .references(() => validationProjects.id),
    clientRequestId: varchar("client_request_id", { length: 128 }).notNull(),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).notNull(),
    responseStatus: smallint("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.projectId, table.clientRequestId],
    }),
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
      sql`${table.eventType} IN (
        'IDEA_CREATED', 'IDEA_CLARIFIED', 'IDEA_PROMOTED', 'CORRECTION_RECORDED',
        'PROJECT_TRANSITIONED', 'PROJECT_PROGRESS_RECORDED',
        'ATTENTION_ITEM_CREATED', 'ATTENTION_ITEM_UPDATED',
        'ATTENTION_RESPONSE_CORRECTED', 'EVIDENCE_RECORDED',
        'EVIDENCE_CORRECTED', 'EVIDENCE_RETRACTED', 'CONCLUSION_RECORDED',
        'CONFIRMATION_REQUESTED', 'CONFIRMATION_REJECTED',
        'CONCLUSION_CONFIRMED', 'PROJECT_COMPLETED', 'PROJECT_STOPPED',
        'PROJECT_TRANSFERRED', 'PROJECT_REOPENED'
      )`,
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

export const schemaFeatureMigrations = pgTable("schema_feature_migrations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  checksum: char("checksum", { length: 64 }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
