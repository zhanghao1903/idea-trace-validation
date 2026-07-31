import { Type } from "typebox";

import {
  ActorDtoSchema,
  ActorInputSchema,
  AnswerIdSchema,
  DateTimeSchema,
  ErrorEnvelopeSchema,
  EventIdSchema,
  IdeaIdSchema,
  PageMetaSchema,
  PageQuerySchema,
  ProjectIdSchema,
  ProposerInputSchema,
  QuestionIdSchema,
  ReadMetaSchema,
  RequestIdSchema,
  StatementIdSchema,
  ViewSchema,
  WriteMetaSchema,
} from "./common.js";

const strict = { additionalProperties: false } as const;
const nullable = <T extends ReturnType<typeof Type.String>>(schema: T) =>
  Type.Union([schema, Type.Null()]);

export const IntakeStatusSchema = Type.Union([
  Type.Literal("IDEA"),
  Type.Literal("NEEDS_CLARIFICATION"),
]);
export const StatementKindSchema = Type.Union([
  Type.Literal("FACT"),
  Type.Literal("HYPOTHESIS"),
]);
export const TargetFieldSchema = Type.Union([
  Type.Literal("DESIRED_OUTCOME"),
  Type.Literal("HYPOTHESIS"),
  Type.Literal("FACT"),
  Type.Literal("OTHER"),
]);

export const StatementTextInputSchema = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 2000 }) },
  strict,
);
export const ClarificationQuestionInputSchema = Type.Object(
  {
    prompt: Type.String({ minLength: 1, maxLength: 1000 }),
    targetField: TargetFieldSchema,
  },
  strict,
);

export const CreateIdeaRequestSchema = Type.Object(
  {
    intentSummary: Type.String({ minLength: 1, maxLength: 4000 }),
    proposer: ProposerInputSchema,
    desiredOutcome: Type.Optional(
      Type.String({ minLength: 1, maxLength: 2000 }),
    ),
    facts: Type.Array(StatementTextInputSchema, { maxItems: 20 }),
    hypotheses: Type.Array(StatementTextInputSchema, { maxItems: 20 }),
    clarificationQuestions: Type.Array(ClarificationQuestionInputSchema, {
      maxItems: 20,
    }),
    actor: ActorInputSchema,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  strict,
);

export const IdeaAuthorityDtoSchema = Type.Object(
  {
    id: IdeaIdSchema,
    intentSummary: Type.String(),
    proposer: ActorDtoSchema,
    desiredOutcome: nullable(Type.String()),
    intakeStatus: IntakeStatusSchema,
    version: Type.Integer({ minimum: 1 }),
    projectId: Type.Union([ProjectIdSchema, Type.Null()]),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  strict,
);

export const StatementDtoSchema = Type.Object(
  {
    id: StatementIdSchema,
    kind: StatementKindSchema,
    text: Type.String(),
    sourceType: Type.Union([
      Type.Literal("CREATE_REQUEST"),
      Type.Literal("CLARIFICATION_ANSWER"),
      Type.Literal("CORRECTION"),
    ]),
    sourceRef: Type.String(),
    supersedesStatementId: Type.Union([StatementIdSchema, Type.Null()]),
    recordedAt: DateTimeSchema,
  },
  strict,
);

export const AnswerDtoSchema = Type.Object(
  {
    id: AnswerIdSchema,
    answerText: Type.String(),
    desiredOutcomeRevision: nullable(Type.String()),
    declaredActor: ActorDtoSchema,
    reason: Type.String(),
    supersedesAnswerId: Type.Union([AnswerIdSchema, Type.Null()]),
    resultingIdeaVersion: Type.Integer({ minimum: 2 }),
    createdAt: DateTimeSchema,
  },
  strict,
);

export const QuestionDtoSchema = Type.Object(
  {
    id: QuestionIdSchema,
    prompt: Type.String(),
    targetField: TargetFieldSchema,
    source: Type.Union([Type.Literal("CALLER"), Type.Literal("SYSTEM")]),
    status: Type.Union([Type.Literal("OPEN"), Type.Literal("ANSWERED")]),
    currentAnswerId: Type.Union([AnswerIdSchema, Type.Null()]),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    answers: Type.Array(AnswerDtoSchema),
  },
  strict,
);

export const AuditSummarySchema = Type.Object(
  {
    status: Type.Optional(Type.String()),
    version: Type.Optional(Type.Integer({ minimum: 1 })),
    changedFieldNames: Type.Optional(Type.Array(Type.String())),
    statementIds: Type.Optional(Type.Array(StatementIdSchema)),
    questionId: Type.Optional(QuestionIdSchema),
    answerId: Type.Optional(AnswerIdSchema),
    projectId: Type.Optional(ProjectIdSchema),
  },
  strict,
);

export const AuditEventDtoSchema = Type.Object(
  {
    id: EventIdSchema,
    aggregateType: Type.Union([Type.Literal("IDEA"), Type.Literal("PROJECT")]),
    aggregateId: Type.Union([IdeaIdSchema, ProjectIdSchema]),
    aggregateVersion: Type.Integer({ minimum: 1 }),
    eventType: Type.Union([
      Type.Literal("IDEA_CREATED"),
      Type.Literal("IDEA_CLARIFIED"),
      Type.Literal("IDEA_PROMOTED"),
      Type.Literal("CORRECTION_RECORDED"),
    ]),
    occurredAt: DateTimeSchema,
    declaredActor: ActorDtoSchema,
    reason: Type.String(),
    requestId: RequestIdSchema,
    beforeSummary: Type.Union([AuditSummarySchema, Type.Null()]),
    afterSummary: AuditSummarySchema,
    relatedEventId: Type.Union([EventIdSchema, Type.Null()]),
  },
  strict,
);

export const OpenQuestionFocusSchema = Type.Object(
  {
    id: QuestionIdSchema,
    prompt: Type.String(),
    targetField: TargetFieldSchema,
  },
  strict,
);
export const HypothesisFocusSchema = Type.Object(
  { id: StatementIdSchema, text: Type.String() },
  strict,
);
export const IdeaProposerFocusSchema = Type.Object(
  {
    view: Type.Literal("proposer"),
    intentSummary: Type.String(),
    openQuestions: Type.Array(OpenQuestionFocusSchema),
  },
  strict,
);
export const IdeaExecutorFocusSchema = Type.Object(
  {
    view: Type.Literal("executor"),
    desiredOutcome: nullable(Type.String()),
    hypotheses: Type.Array(HypothesisFocusSchema),
    readyToPromote: Type.Boolean(),
  },
  strict,
);
export const IdeaFocusSchema = Type.Union([
  IdeaProposerFocusSchema,
  IdeaExecutorFocusSchema,
]);

export const IdeaSummaryDtoSchema = Type.Object(
  {
    authority: IdeaAuthorityDtoSchema,
    openQuestionCount: Type.Integer({ minimum: 0 }),
    currentFactCount: Type.Integer({ minimum: 0 }),
    currentHypothesisCount: Type.Integer({ minimum: 0 }),
    focus: IdeaFocusSchema,
  },
  strict,
);

export const IdeaParamsSchema = Type.Object({ ideaId: IdeaIdSchema }, strict);
export const QuestionParamsSchema = Type.Object(
  { ideaId: IdeaIdSchema, questionId: QuestionIdSchema },
  strict,
);

export const CreateIdeaDataSchema = Type.Object(
  {
    idea: IdeaAuthorityDtoSchema,
    created: Type.Object(
      {
        statementIds: Type.Array(StatementIdSchema),
        questionIds: Type.Array(QuestionIdSchema),
      },
      strict,
    ),
  },
  strict,
);

export const CreateIdeaSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    data: CreateIdeaDataSchema,
    meta: WriteMetaSchema,
  },
  strict,
);

export const IdeaListDataSchema = Type.Object(
  {
    items: Type.Array(IdeaSummaryDtoSchema),
    page: PageMetaSchema,
    view: ViewSchema,
  },
  strict,
);
export const IdeaListSuccessSchema = Type.Object(
  { ok: Type.Literal(true), data: IdeaListDataSchema, meta: ReadMetaSchema },
  strict,
);

export const CreateIdeaRouteSchema = {
  security: [{ aiWrite: [] }],
  body: CreateIdeaRequestSchema,
  headers: Type.Object(
    {
      authorization: Type.Optional(Type.String()),
      "idempotency-key": Type.String({
        minLength: 1,
        maxLength: 128,
        pattern: "^[A-Za-z0-9._~:+/-]+$",
      }),
    },
    { additionalProperties: true },
  ),
  response: {
    201: CreateIdeaSuccessSchema,
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    409: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export const IdeaListRouteSchema = {
  querystring: PageQuerySchema,
  response: {
    200: IdeaListSuccessSchema,
    400: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export type CreateIdeaRequest = Type.Static<typeof CreateIdeaRequestSchema>;
export type IdeaAuthorityDto = Type.Static<typeof IdeaAuthorityDtoSchema>;
export type StatementDto = Type.Static<typeof StatementDtoSchema>;
export type QuestionDto = Type.Static<typeof QuestionDtoSchema>;
export type AnswerDto = Type.Static<typeof AnswerDtoSchema>;
export type AuditEventDto = Type.Static<typeof AuditEventDtoSchema>;
export type IdeaSummaryDto = Type.Static<typeof IdeaSummaryDtoSchema>;
export type IdeaFocus = Type.Static<typeof IdeaFocusSchema>;
