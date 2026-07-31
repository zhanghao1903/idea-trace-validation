import { Type } from "typebox";

import {
  ActorInputSchema,
  ErrorEnvelopeSchema,
  ReadMetaSchema,
  StatementIdSchema,
  WriteMetaSchema,
} from "./common.js";
import {
  AnswerDtoSchema,
  IdeaAuthorityDtoSchema,
  QuestionParamsSchema,
  StatementKindSchema,
} from "./ideas.js";

const strict = { additionalProperties: false } as const;

export const StatementInputSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 2000 }),
    supersedesStatementId: Type.Optional(StatementIdSchema),
  },
  strict,
);

export const AnswerClarificationRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 1 }),
    answerText: Type.String({ minLength: 1, maxLength: 4000 }),
    desiredOutcomeRevision: Type.Optional(
      Type.String({ minLength: 1, maxLength: 2000 }),
    ),
    newFacts: Type.Array(StatementInputSchema, { maxItems: 20 }),
    newHypotheses: Type.Array(StatementInputSchema, { maxItems: 20 }),
    supersedesAnswerId: Type.Optional(
      Type.String({ pattern: "^ans_[0-9A-HJKMNP-TV-Z]{26}$" }),
    ),
    actor: ActorInputSchema,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  strict,
);

export const AnswerClarificationDataSchema = Type.Object(
  {
    idea: IdeaAuthorityDtoSchema,
    answer: AnswerDtoSchema,
    createdStatementIds: Type.Array(StatementIdSchema),
    openQuestionCount: Type.Integer({ minimum: 0 }),
  },
  strict,
);

export const AnswerClarificationSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    data: AnswerClarificationDataSchema,
    meta: WriteMetaSchema,
  },
  strict,
);

export const AnswerClarificationRouteSchema = {
  security: [{ aiWrite: [] }],
  params: QuestionParamsSchema,
  body: AnswerClarificationRequestSchema,
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
    200: AnswerClarificationSuccessSchema,
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    409: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export type AnswerClarificationRequest = Type.Static<
  typeof AnswerClarificationRequestSchema
>;
export type StatementInput = Type.Static<typeof StatementInputSchema>;

void ReadMetaSchema;
void StatementKindSchema;
