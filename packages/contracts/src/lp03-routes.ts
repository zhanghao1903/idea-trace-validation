import { Type } from "typebox";

import {
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  PageMetaSchema,
  ProjectIdSchema,
  readSuccess,
  writeSuccess,
} from "./common.js";
import {
  ExecutorProjectGroupSchema,
  ExecutorProjectPageDtoSchema,
  ExperienceProjectDetailDtoSchema,
  ExperienceViewSchema,
  ProposerIdeaCategorySchema,
  ProposerIdeaPageDtoSchema,
} from "./experience.js";
import {
  ReportCurrentDtoSchema,
  ReportRevisionDtoSchema,
  ReportRevisionSummaryDtoSchema,
  ReportSubmissionResultDtoSchema,
  StructuredReportV1Schema,
} from "./reports.js";

const strict = { additionalProperties: false } as const;
const errors = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
  413: ErrorEnvelopeSchema,
  500: ErrorEnvelopeSchema,
  503: ErrorEnvelopeSchema,
} as const;

export const ReportProjectParamsSchema = Type.Object(
  { projectId: ProjectIdSchema },
  strict,
);
export const ReportRevisionParamsSchema = Type.Object(
  {
    projectId: ProjectIdSchema,
    revision: Type.Integer({ minimum: 1 }),
  },
  strict,
);
export const Lp03PageQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  strict,
);

export const ReportSubmissionRouteSchema = {
  security: [{ aiWrite: [] }],
  params: ReportProjectParamsSchema,
  headers: Type.Object(
    {
      authorization: Type.Optional(Type.String()),
      "idempotency-key": IdempotencyKeySchema,
    },
    { additionalProperties: true },
  ),
  body: StructuredReportV1Schema,
  response: {
    201: writeSuccess(ReportSubmissionResultDtoSchema),
    ...errors,
  },
} as const;
export const ReportCurrentRouteSchema = {
  params: ReportProjectParamsSchema,
  response: { 200: readSuccess(ReportCurrentDtoSchema), ...errors },
} as const;
export const ReportHistoryRouteSchema = {
  params: ReportProjectParamsSchema,
  querystring: Lp03PageQuerySchema,
  response: {
    200: readSuccess(
      Type.Object(
        {
          items: Type.Array(ReportRevisionSummaryDtoSchema),
          page: PageMetaSchema,
        },
        strict,
      ),
    ),
    ...errors,
  },
} as const;
export const ReportRevisionRouteSchema = {
  params: ReportRevisionParamsSchema,
  response: { 200: readSuccess(ReportRevisionDtoSchema), ...errors },
} as const;

export const ProposerExperienceQuerySchema = Type.Object(
  {
    category: Type.Optional(ProposerIdeaCategorySchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  strict,
);
export const ExecutorExperienceQuerySchema = Type.Object(
  {
    group: Type.Optional(ExecutorProjectGroupSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  strict,
);
export const ExperienceProjectQuerySchema = Type.Object(
  { view: ExperienceViewSchema },
  strict,
);
export const ProposerExperienceRouteSchema = {
  querystring: ProposerExperienceQuerySchema,
  response: { 200: readSuccess(ProposerIdeaPageDtoSchema), ...errors },
} as const;
export const ExecutorExperienceRouteSchema = {
  querystring: ExecutorExperienceQuerySchema,
  response: { 200: readSuccess(ExecutorProjectPageDtoSchema), ...errors },
} as const;
export const ExperienceProjectRouteSchema = {
  params: ReportProjectParamsSchema,
  querystring: ExperienceProjectQuerySchema,
  response: { 200: readSuccess(ExperienceProjectDetailDtoSchema), ...errors },
} as const;
