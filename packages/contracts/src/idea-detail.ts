import { Type } from "typebox";

import { ErrorEnvelopeSchema, ReadMetaSchema, ViewSchema } from "./common.js";
import {
  AuditEventDtoSchema,
  IdeaAuthorityDtoSchema,
  IdeaFocusSchema,
  IdeaParamsSchema,
  QuestionDtoSchema,
  StatementDtoSchema,
} from "./ideas.js";
import { ProjectSummaryDtoSchema } from "./projects.js";

const strict = { additionalProperties: false } as const;

export const IdeaDetailDtoSchema = Type.Object(
  {
    authority: IdeaAuthorityDtoSchema,
    currentStatements: Type.Array(StatementDtoSchema),
    statementHistory: Type.Array(StatementDtoSchema),
    clarificationQuestions: Type.Array(QuestionDtoSchema),
    project: Type.Union([ProjectSummaryDtoSchema, Type.Null()]),
    history: Type.Array(AuditEventDtoSchema),
    focus: IdeaFocusSchema,
  },
  strict,
);

export const IdeaDetailDataSchema = Type.Object(
  { idea: IdeaDetailDtoSchema, view: ViewSchema },
  strict,
);
export const IdeaDetailSuccessSchema = Type.Object(
  { ok: Type.Literal(true), data: IdeaDetailDataSchema, meta: ReadMetaSchema },
  strict,
);

export const IdeaDetailRouteSchema = {
  params: IdeaParamsSchema,
  querystring: Type.Object({ view: Type.Optional(ViewSchema) }, strict),
  response: {
    200: IdeaDetailSuccessSchema,
    400: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export type IdeaDetailDto = Type.Static<typeof IdeaDetailDtoSchema>;
