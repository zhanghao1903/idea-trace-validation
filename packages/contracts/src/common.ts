import { Type, type TSchema } from "typebox";

export const ULID_PATTERN = "[0-9A-HJKMNP-TV-Z]{26}";
export const REQUEST_ID_PATTERN = `^req_${ULID_PATTERN}$`;
export const IDEA_ID_PATTERN = `^idea_${ULID_PATTERN}$`;
export const PROJECT_ID_PATTERN = `^proj_${ULID_PATTERN}$`;
export const STATEMENT_ID_PATTERN = `^stmt_${ULID_PATTERN}$`;
export const QUESTION_ID_PATTERN = `^ques_${ULID_PATTERN}$`;
export const ANSWER_ID_PATTERN = `^ans_${ULID_PATTERN}$`;
export const HYPOTHESIS_ID_PATTERN = `^hyp_${ULID_PATTERN}$`;
export const EVENT_ID_PATTERN = `^evt_${ULID_PATTERN}$`;
export const TRANSITION_ID_PATTERN = `^trn_${ULID_PATTERN}$`;
export const PROGRESS_ID_PATTERN = `^prog_${ULID_PATTERN}$`;
export const ATTENTION_ID_PATTERN = `^attn_${ULID_PATTERN}$`;
export const ATTENTION_EVENT_ID_PATTERN = `^atnevt_${ULID_PATTERN}$`;
export const EVIDENCE_ID_PATTERN = `^evd_${ULID_PATTERN}$`;
export const CONCLUSION_ID_PATTERN = `^conc_${ULID_PATTERN}$`;
export const CONFIRMATION_ID_PATTERN = `^confirm_${ULID_PATTERN}$`;
export const REPORT_ID_PATTERN = `^rpt_${ULID_PATTERN}$`;
export const ARTIFACT_ID_PATTERN = `^artifact_${ULID_PATTERN}$`;
export const RFC3339_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";

const strict = { additionalProperties: false } as const;

export const ActorTypeSchema = Type.Union([
  Type.Literal("HUMAN"),
  Type.Literal("AI"),
]);
export const ActorRoleSchema = Type.Union([
  Type.Literal("PROPOSER"),
  Type.Literal("EXECUTOR"),
  Type.Literal("MAINTAINER"),
]);

export const ActorInputSchema = Type.Object(
  {
    actorType: ActorTypeSchema,
    role: ActorRoleSchema,
    displayName: Type.String({ minLength: 1, maxLength: 120 }),
    client: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    onBehalfOfRole: Type.Optional(ActorRoleSchema),
  },
  strict,
);

// A proposer is declared directly. Delegation belongs to the command actor, not
// to the persisted proposer authority (TPR-008).
export const ProposerInputSchema = Type.Object(
  {
    actorType: ActorTypeSchema,
    role: Type.Literal("PROPOSER"),
    displayName: Type.String({ minLength: 1, maxLength: 120 }),
    client: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  strict,
);

export const ActorDtoSchema = Type.Object(
  {
    actorType: Type.Union([ActorTypeSchema, Type.Literal("SYSTEM")]),
    role: Type.Union([ActorRoleSchema, Type.Literal("SYSTEM")]),
    displayName: Type.String({ minLength: 1, maxLength: 120 }),
    client: Type.Union([
      Type.String({ minLength: 1, maxLength: 120 }),
      Type.Null(),
    ]),
    onBehalfOfRole: Type.Union([ActorRoleSchema, Type.Null()]),
  },
  strict,
);

export const RequestIdSchema = Type.String({ pattern: REQUEST_ID_PATTERN });
export const IdeaIdSchema = Type.String({ pattern: IDEA_ID_PATTERN });
export const ProjectIdSchema = Type.String({ pattern: PROJECT_ID_PATTERN });
export const StatementIdSchema = Type.String({ pattern: STATEMENT_ID_PATTERN });
export const QuestionIdSchema = Type.String({ pattern: QUESTION_ID_PATTERN });
export const AnswerIdSchema = Type.String({ pattern: ANSWER_ID_PATTERN });
export const HypothesisIdSchema = Type.String({
  pattern: HYPOTHESIS_ID_PATTERN,
});
export const EventIdSchema = Type.String({ pattern: EVENT_ID_PATTERN });
export const TransitionIdSchema = Type.String({
  pattern: TRANSITION_ID_PATTERN,
});
export const ProgressIdSchema = Type.String({ pattern: PROGRESS_ID_PATTERN });
export const AttentionIdSchema = Type.String({ pattern: ATTENTION_ID_PATTERN });
export const AttentionEventIdSchema = Type.String({
  pattern: ATTENTION_EVENT_ID_PATTERN,
});
export const EvidenceIdSchema = Type.String({ pattern: EVIDENCE_ID_PATTERN });
export const ConclusionIdSchema = Type.String({
  pattern: CONCLUSION_ID_PATTERN,
});
export const ConfirmationIdSchema = Type.String({
  pattern: CONFIRMATION_ID_PATTERN,
});
export const ReportIdSchema = Type.String({ pattern: REPORT_ID_PATTERN });
export const ArtifactIdSchema = Type.String({ pattern: ARTIFACT_ID_PATTERN });
export const DateTimeSchema = Type.String({ pattern: RFC3339_PATTERN });
export const IdempotencyKeySchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9._~:+/-]+$",
});

export const ViewSchema = Type.Union([
  Type.Literal("proposer"),
  Type.Literal("executor"),
]);
export const PageQuerySchema = Type.Object(
  {
    view: Type.Optional(ViewSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  strict,
);

export const PageMetaSchema = Type.Object(
  {
    limit: Type.Integer({ minimum: 1, maximum: 100 }),
    nextCursor: Type.Union([
      Type.String({ minLength: 1, maxLength: 512 }),
      Type.Null(),
    ]),
  },
  strict,
);

export const WriteMetaSchema = Type.Object(
  {
    requestId: RequestIdSchema,
    idempotentReplay: Type.Boolean(),
  },
  strict,
);

export const ReadMetaSchema = Type.Object(
  { requestId: RequestIdSchema },
  strict,
);

const RecoverySchema = <const T extends string>(recovery: T) =>
  Type.Object({ recovery: Type.Literal(recovery) }, strict);

export const ValidationErrorSchema = Type.Object(
  {
    code: Type.Literal("VALIDATION_FAILED"),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        issues: Type.Array(
          Type.Object(
            {
              path: Type.String(),
              keyword: Type.String(),
              message: Type.String(),
            },
            strict,
          ),
        ),
        recovery: Type.Literal("FIX_REQUEST"),
      },
      strict,
    ),
  },
  strict,
);

export const WriteCredentialErrorSchema = Type.Object(
  {
    code: Type.Literal("WRITE_CREDENTIAL_REQUIRED"),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: RecoverySchema("PROVIDE_VALID_WRITE_CREDENTIAL"),
  },
  strict,
);

export const NotFoundErrorSchema = Type.Object(
  {
    code: Type.Union([
      Type.Literal("IDEA_NOT_FOUND"),
      Type.Literal("QUESTION_NOT_FOUND"),
      Type.Literal("PROJECT_NOT_FOUND"),
    ]),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        resourceType: Type.Union([
          Type.Literal("IDEA"),
          Type.Literal("QUESTION"),
          Type.Literal("PROJECT"),
        ]),
        resourceId: Type.String(),
        recovery: Type.Literal("VERIFY_ID_AND_REFETCH"),
      },
      strict,
    ),
  },
  strict,
);

export const VersionConflictErrorSchema = Type.Object(
  {
    code: Type.Literal("VERSION_CONFLICT"),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        resourceId: Type.Union([IdeaIdSchema, ProjectIdSchema]),
        expectedVersion: Type.Integer({ minimum: 1 }),
        currentVersion: Type.Integer({ minimum: 1 }),
        recovery: Type.Literal("REFETCH_AND_RETRY_WITH_NEW_KEY"),
      },
      strict,
    ),
  },
  strict,
);

export const IdempotencyConflictErrorSchema = Type.Object(
  {
    code: Type.Literal("IDEMPOTENCY_CONFLICT"),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        originalOperation: Type.String({ minLength: 1, maxLength: 64 }),
        recovery: Type.Literal("USE_NEW_KEY_OR_REPLAY_ORIGINAL"),
      },
      strict,
    ),
  },
  strict,
);

export const IdempotencyInProgressErrorSchema = Type.Object(
  {
    code: Type.Literal("IDEMPOTENCY_IN_PROGRESS"),
    message: Type.String(),
    retryable: Type.Literal(true),
    details: Type.Object(
      {
        retryAfterMs: Type.Literal(250),
        recovery: Type.Literal("RETRY_SAME_KEY"),
      },
      strict,
    ),
  },
  strict,
);

export const AlreadyPromotedErrorSchema = Type.Object(
  {
    code: Type.Union([
      Type.Literal("ALREADY_PROMOTED"),
      Type.Literal("IDEA_ALREADY_PROMOTED"),
    ]),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        ideaId: IdeaIdSchema,
        projectId: ProjectIdSchema,
        recovery: Type.Union([
          Type.Literal("READ_EXISTING_PROJECT"),
          Type.Literal("READ_ONLY_IN_LP01"),
        ]),
      },
      strict,
    ),
  },
  strict,
);

export const PromotionPreconditionErrorSchema = Type.Object(
  {
    code: Type.Literal("PROMOTION_PRECONDITION_FAILED"),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        missing: Type.Array(
          Type.Union([
            Type.Literal("DESIRED_OUTCOME"),
            Type.Literal("HYPOTHESIS"),
            Type.Literal("EXPLICIT_INTENT"),
            Type.Literal("PROPOSER_INTENT"),
          ]),
        ),
        recovery: Type.Literal("CLARIFY_AND_RETRY_WITH_NEW_KEY"),
      },
      strict,
    ),
  },
  strict,
);

export const ServiceNotReadyErrorSchema = Type.Object(
  {
    code: Type.Literal("SERVICE_NOT_READY"),
    message: Type.String(),
    retryable: Type.Literal(true),
    details: Type.Object(
      {
        reason: Type.Union([
          Type.Literal("DATABASE_UNREACHABLE"),
          Type.Literal("MIGRATION_MISSING"),
          Type.Literal("MIGRATION_MISMATCH"),
        ]),
        recovery: Type.Literal("RETRY_LATER"),
      },
      strict,
    ),
  },
  strict,
);

export const HumanControlErrorSchema = Type.Object(
  {
    code: Type.Union([
      Type.Literal("HUMAN_CONTROL_REQUIRED"),
      Type.Literal("CONFIRMATION_CAPABILITY_REQUIRED"),
    ]),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Object(
      {
        recovery: Type.Union([
          Type.Literal("PROVIDE_VALID_HUMAN_CONTROL_CREDENTIAL"),
          Type.Literal("USE_SCOPED_CONFIRMATION_COOKIE"),
        ]),
      },
      strict,
    ),
  },
  strict,
);

export const ProjectExecutionErrorSchema = Type.Object(
  {
    code: Type.Union([
      Type.Literal("ATTENTION_ITEM_NOT_FOUND"),
      Type.Literal("EVIDENCE_NOT_FOUND"),
      Type.Literal("CONCLUSION_NOT_FOUND"),
      Type.Literal("CONFIRMATION_NOT_FOUND"),
      Type.Literal("PROJECT_STATE_CONFLICT"),
      Type.Literal("PHASE_TRANSITION_INVALID"),
      Type.Literal("ATTENTION_STATE_CONFLICT"),
      Type.Literal("CROSS_PROJECT_REFERENCE"),
      Type.Literal("REFERENCE_NOT_ACTIVE"),
      Type.Literal("CONCLUSION_STATE_CONFLICT"),
      Type.Literal("RECOMMENDATION_MISMATCH"),
      Type.Literal("CONFIRMATION_ALREADY_PENDING"),
      Type.Literal("CONFIRMATION_EXPIRED"),
      Type.Literal("CONFIRMATION_ALREADY_DECIDED"),
      Type.Literal("CONFIRMATION_STALE"),
      Type.Literal("PROJECT_PRECONDITION_FAILED"),
    ]),
    message: Type.String(),
    retryable: Type.Literal(false),
    details: Type.Record(Type.String(), Type.Unknown()),
  },
  strict,
);

export const InternalErrorSchema = Type.Object(
  {
    code: Type.Literal("INTERNAL_ERROR"),
    message: Type.String(),
    retryable: Type.Literal(true),
    details: RecoverySchema("RETRY_WITH_SAME_KEY_IF_RESULT_UNKNOWN"),
  },
  strict,
);

export const ApiErrorSchema = Type.Union([
  ValidationErrorSchema,
  WriteCredentialErrorSchema,
  NotFoundErrorSchema,
  VersionConflictErrorSchema,
  IdempotencyConflictErrorSchema,
  IdempotencyInProgressErrorSchema,
  AlreadyPromotedErrorSchema,
  PromotionPreconditionErrorSchema,
  HumanControlErrorSchema,
  ProjectExecutionErrorSchema,
  ServiceNotReadyErrorSchema,
  InternalErrorSchema,
]);

export const ErrorEnvelopeSchema = Type.Object(
  {
    ok: Type.Literal(false),
    error: ApiErrorSchema,
    meta: ReadMetaSchema,
  },
  strict,
);

export const writeSuccess = <T extends TSchema>(data: T) =>
  Type.Object({ ok: Type.Literal(true), data, meta: WriteMetaSchema }, strict);

export const readSuccess = <T extends TSchema>(data: T) =>
  Type.Object({ ok: Type.Literal(true), data, meta: ReadMetaSchema }, strict);

export type ActorInput = Type.Static<typeof ActorInputSchema>;
export type ProposerInput = Type.Static<typeof ProposerInputSchema>;
export type ActorDto = Type.Static<typeof ActorDtoSchema>;
export type ApiError = Type.Static<typeof ApiErrorSchema>;

// Examples are exported from the same contract module consumed by Fastify and
// contract tests, so documentation cannot drift from the authoritative shape
// (TPR-009).
export const ERROR_ENVELOPE_EXAMPLES = {
  versionConflict: {
    ok: false,
    error: {
      code: "VERSION_CONFLICT",
      message: "Idea changed since the supplied version.",
      retryable: false,
      details: {
        resourceId: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        expectedVersion: 3,
        currentVersion: 4,
        recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
      },
    },
    meta: { requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  },
} satisfies Record<string, Type.Static<typeof ErrorEnvelopeSchema>>;
