import { Type } from "typebox";

import {
  AttentionIdSchema,
  ConclusionIdSchema,
  DateTimeSchema,
  EvidenceIdSchema,
  ErrorEnvelopeSchema,
  HypothesisIdSchema,
  IdeaIdSchema,
  PageMetaSchema,
  PageQuerySchema,
  ProjectIdSchema,
  ProgressIdSchema,
  ReadMetaSchema,
  StatementIdSchema,
  ViewSchema,
  WriteMetaSchema,
} from "./common.js";
import { IdeaAuthorityDtoSchema } from "./ideas.js";
import {
  ProjectPhaseSchema,
  ProjectStatusSchema,
} from "./project-execution.js";
import { ProgressUpdateDtoSchema } from "./progress.js";
import { AttentionItemDtoSchema } from "./attention.js";
import { EvidenceDtoSchema } from "./evidence.js";
import { ConclusionDtoSchema, RecommendationSchema } from "./conclusions.js";

const strict = { additionalProperties: false } as const;

export const ProjectAuthorityDtoSchema = Type.Object(
  {
    id: ProjectIdSchema,
    ideaId: IdeaIdSchema,
    goal: Type.String(),
    phase: ProjectPhaseSchema,
    status: ProjectStatusSchema,
    currentNextStep: Type.Union([Type.String(), Type.Null()]),
    latestProgressUpdateId: Type.Union([ProgressIdSchema, Type.Null()]),
    activeConclusionId: Type.Union([ConclusionIdSchema, Type.Null()]),
    completedAt: Type.Union([DateTimeSchema, Type.Null()]),
    completionKind: Type.Union([
      Type.Literal("COMPLETE"),
      Type.Literal("STOP"),
      Type.Literal("TRANSFER"),
      Type.Null(),
    ]),
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
      {
        goal: Type.String(),
        status: ProjectStatusSchema,
        currentNextStep: Type.Union([Type.String(), Type.Null()]),
        latestProgressSummary: Type.Union([Type.String(), Type.Null()]),
        openAttentionCount: Type.Integer({ minimum: 0 }),
        latestRecommendation: Type.Union([RecommendationSchema, Type.Null()]),
      },
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
        phase: ProjectPhaseSchema,
        status: ProjectStatusSchema,
        version: Type.Integer({ minimum: 1 }),
        currentNextStep: Type.Union([Type.String(), Type.Null()]),
        latestProgressId: Type.Union([ProgressIdSchema, Type.Null()]),
        openAttentionCount: Type.Integer({ minimum: 0 }),
        evidenceCount: Type.Integer({ minimum: 0 }),
        latestConclusionId: Type.Union([ConclusionIdSchema, Type.Null()]),
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

export const ProjectAllowedCommandSchema = Type.Union([
  Type.Literal("START"),
  Type.Literal("PAUSE"),
  Type.Literal("RESUME"),
  Type.Literal("CHANGE_PHASE"),
  Type.Literal("CONFIRM_CONCLUSION"),
  Type.Literal("COMPLETE_PROJECT"),
  Type.Literal("STOP_PROJECT"),
  Type.Literal("TRANSFER_PROJECT"),
  Type.Literal("REOPEN_PROJECT"),
]);

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
    execution: Type.Object(
      {
        currentNextStep: Type.Union([Type.String(), Type.Null()]),
        latestProgress: Type.Union([ProgressUpdateDtoSchema, Type.Null()]),
        openAttentionPreview: Type.Array(AttentionItemDtoSchema, {
          maxItems: 10,
        }),
        openAttentionCount: Type.Integer({ minimum: 0 }),
        evidencePreview: Type.Array(EvidenceDtoSchema, { maxItems: 10 }),
        evidenceCount: Type.Integer({ minimum: 0 }),
        latestConclusion: Type.Union([ConclusionDtoSchema, Type.Null()]),
        allowedCommands: Type.Array(ProjectAllowedCommandSchema, {
          uniqueItems: true,
        }),
        collectionPaths: Type.Object(
          {
            progressUpdates: Type.String(),
            attentionItems: Type.String(),
            evidence: Type.String(),
            conclusions: Type.String(),
            history: Type.String(),
          },
          strict,
        ),
      },
      strict,
    ),
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
export type ProjectAllowedCommand = Type.Static<
  typeof ProjectAllowedCommandSchema
>;
export type ProjectSummaryDto = Type.Static<typeof ProjectSummaryDtoSchema>;
export type ProjectDetailDto = Type.Static<typeof ProjectDetailDtoSchema>;

void AttentionIdSchema;
void EvidenceIdSchema;
void WriteMetaSchema;
