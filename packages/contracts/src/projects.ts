import { Type } from "typebox";

import {
  DateTimeSchema,
  ErrorEnvelopeSchema,
  HypothesisIdSchema,
  IdeaIdSchema,
  PageMetaSchema,
  PageQuerySchema,
  ProjectIdSchema,
  ReadMetaSchema,
  StatementIdSchema,
  ViewSchema,
  WriteMetaSchema,
} from "./common.js";
import { IdeaAuthorityDtoSchema } from "./ideas.js";

const strict = { additionalProperties: false } as const;

export const ProjectAuthorityDtoSchema = Type.Object(
  {
    id: ProjectIdSchema,
    ideaId: IdeaIdSchema,
    goal: Type.String(),
    phase: Type.Literal("PLANNING"),
    status: Type.Literal("QUEUED"),
    sourceIdeaVersion: Type.Integer({ minimum: 1 }),
    version: Type.Integer({ minimum: 1 }),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  strict,
);

export const ProjectHypothesisDtoSchema = Type.Object(
  {
    id: HypothesisIdSchema,
    sourceStatementId: StatementIdSchema,
    text: Type.String(),
    position: Type.Integer({ minimum: 0, maximum: 19 }),
    createdAt: DateTimeSchema,
  },
  strict,
);

export const ProjectMutationDtoSchema = Type.Object(
  {
    authority: ProjectAuthorityDtoSchema,
    hypotheses: Type.Array(ProjectHypothesisDtoSchema, {
      minItems: 1,
      maxItems: 20,
    }),
  },
  strict,
);

export const ProjectProposerFocusSchema = Type.Object(
  {
    view: Type.Literal("proposer"),
    sourceIdea: Type.Object(
      {
        id: IdeaIdSchema,
        intentSummary: Type.String(),
        proposer: IdeaAuthorityDtoSchema.properties.proposer,
        desiredOutcome: Type.String(),
      },
      strict,
    ),
    projectOutcome: Type.Object(
      { goal: Type.String(), status: Type.Literal("QUEUED") },
      strict,
    ),
  },
  strict,
);

export const ProjectExecutorSummaryFocusSchema = Type.Object(
  {
    view: Type.Literal("executor"),
    execution: Type.Object(
      {
        goal: Type.String(),
        phase: Type.Literal("PLANNING"),
        status: Type.Literal("QUEUED"),
        version: Type.Integer({ minimum: 1 }),
      },
      strict,
    ),
    hypothesisCount: Type.Integer({ minimum: 1 }),
    sourceIdea: Type.Object(
      { id: IdeaIdSchema, version: Type.Integer({ minimum: 1 }) },
      strict,
    ),
  },
  strict,
);

export const ProjectExecutorDetailFocusSchema = Type.Object(
  {
    view: Type.Literal("executor"),
    execution: ProjectExecutorSummaryFocusSchema.properties.execution,
    hypotheses: Type.Array(ProjectHypothesisDtoSchema, {
      minItems: 1,
      maxItems: 20,
    }),
    sourceIdea: ProjectExecutorSummaryFocusSchema.properties.sourceIdea,
  },
  strict,
);

export const ProjectSummaryDtoSchema = Type.Object(
  {
    authority: ProjectAuthorityDtoSchema,
    focus: Type.Union([
      ProjectProposerFocusSchema,
      ProjectExecutorSummaryFocusSchema,
    ]),
  },
  strict,
);

export const ProjectDetailDtoSchema = Type.Object(
  {
    authority: ProjectAuthorityDtoSchema,
    hypotheses: Type.Array(ProjectHypothesisDtoSchema, {
      minItems: 1,
      maxItems: 20,
    }),
    sourceIdea: IdeaAuthorityDtoSchema,
    focus: Type.Union([
      ProjectProposerFocusSchema,
      ProjectExecutorDetailFocusSchema,
    ]),
  },
  strict,
);

export const ProjectParamsSchema = Type.Object(
  { projectId: ProjectIdSchema },
  strict,
);

export const ProjectListDataSchema = Type.Object(
  {
    items: Type.Array(ProjectSummaryDtoSchema),
    page: PageMetaSchema,
    view: ViewSchema,
  },
  strict,
);
export const ProjectListSuccessSchema = Type.Object(
  { ok: Type.Literal(true), data: ProjectListDataSchema, meta: ReadMetaSchema },
  strict,
);
export const ProjectDetailDataSchema = Type.Object(
  { project: ProjectDetailDtoSchema, view: ViewSchema },
  strict,
);
export const ProjectDetailSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    data: ProjectDetailDataSchema,
    meta: ReadMetaSchema,
  },
  strict,
);

export const ProjectListRouteSchema = {
  querystring: PageQuerySchema,
  response: {
    200: ProjectListSuccessSchema,
    400: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export const ProjectDetailRouteSchema = {
  params: ProjectParamsSchema,
  querystring: Type.Object({ view: Type.Optional(ViewSchema) }, strict),
  response: {
    200: ProjectDetailSuccessSchema,
    400: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export type ProjectAuthorityDto = Type.Static<typeof ProjectAuthorityDtoSchema>;
export type ProjectHypothesisDto = Type.Static<
  typeof ProjectHypothesisDtoSchema
>;
export type ProjectMutationDto = Type.Static<typeof ProjectMutationDtoSchema>;
export type ProjectSummaryDto = Type.Static<typeof ProjectSummaryDtoSchema>;
export type ProjectDetailDto = Type.Static<typeof ProjectDetailDtoSchema>;

void WriteMetaSchema;
