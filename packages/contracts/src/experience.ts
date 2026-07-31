import { Type } from "typebox";

import {
  AttentionIdSchema,
  ConclusionIdSchema,
  DateTimeSchema,
  IdeaIdSchema,
  PageMetaSchema,
  ProjectIdSchema,
  ProgressIdSchema,
} from "./common.js";
import { IntakeStatusSchema } from "./ideas.js";
import {
  ProjectPhaseSchema,
  ProjectStatusSchema,
} from "./project-execution.js";
import { ProjectAuthorityDtoSchema } from "./projects.js";

const strict = { additionalProperties: false } as const;

export const ProposerIdeaCategorySchema = Type.Union([
  Type.Literal("IDEA"),
  Type.Literal("NEEDS_CLARIFICATION"),
  Type.Literal("AWAITING_EXECUTION"),
  Type.Literal("IN_PROGRESS"),
  Type.Literal("PAUSED"),
  Type.Literal("COMPLETED"),
]);
export const ExecutorProjectGroupSchema = Type.Union([
  Type.Literal("OPEN"),
  Type.Literal("COMPLETED"),
]);
export const ExperienceViewSchema = Type.Union([
  Type.Literal("PROPOSER"),
  Type.Literal("EXECUTOR"),
]);

export const ExperienceProgressPreviewSchema = Type.Object(
  {
    id: ProgressIdSchema,
    summary: Type.String(),
    nextStep: Type.String(),
    recordedAt: DateTimeSchema,
  },
  strict,
);
export const ExperienceAttentionPreviewSchema = Type.Object(
  {
    id: AttentionIdSchema,
    type: Type.Union([
      Type.Literal("BLOCKER"),
      Type.Literal("DECISION_REQUEST"),
      Type.Literal("SUPPORT_REQUEST"),
    ]),
    title: Type.String(),
    status: Type.Union([
      Type.Literal("OPEN"),
      Type.Literal("NEEDS_INFO"),
      Type.Literal("RESOLVED"),
      Type.Literal("CLOSED"),
    ]),
    waitingForRole: Type.Union([
      Type.Literal("PROPOSER"),
      Type.Literal("EXECUTOR"),
      Type.Literal("MAINTAINER"),
      Type.Null(),
    ]),
    detailPath: Type.String({ pattern: "^/" }),
  },
  strict,
);
export const ExperienceConclusionPreviewSchema = Type.Object(
  {
    id: ConclusionIdSchema,
    summary: Type.String(),
    recommendation: Type.Union([
      Type.Literal("CONTINUE"),
      Type.Literal("ADJUST"),
      Type.Literal("PAUSE"),
      Type.Literal("STOP"),
      Type.Literal("TRANSFER"),
    ]),
    confirmedAt: DateTimeSchema,
  },
  strict,
);
export const ExperienceCollectionPathsSchema = Type.Object(
  {
    project: Type.String({ pattern: "^/" }),
    progressUpdates: Type.String({ pattern: "^/" }),
    attentionItems: Type.String({ pattern: "^/" }),
    evidence: Type.String({ pattern: "^/" }),
    conclusions: Type.String({ pattern: "^/" }),
    confirmations: Type.String({ pattern: "^/" }),
    history: Type.String({ pattern: "^/" }),
  },
  strict,
);

export const ProposerIdeaCardDtoSchema = Type.Object(
  {
    ideaId: IdeaIdSchema,
    ideaVersion: Type.Integer({ minimum: 1 }),
    intentSummary: Type.String(),
    intakeStatus: IntakeStatusSchema,
    category: ProposerIdeaCategorySchema,
    updatedAt: DateTimeSchema,
    project: Type.Union([
      Type.Object(
        {
          id: ProjectIdSchema,
          version: Type.Integer({ minimum: 1 }),
          status: ProjectStatusSchema,
          phase: ProjectPhaseSchema,
          updatedAt: DateTimeSchema,
        },
        strict,
      ),
      Type.Null(),
    ]),
    latestProgress: Type.Union([ExperienceProgressPreviewSchema, Type.Null()]),
    currentNextStep: Type.Union([Type.String(), Type.Null()]),
    waitingForProposer: Type.Array(ExperienceAttentionPreviewSchema),
    latestConfirmedConclusion: Type.Union([
      ExperienceConclusionPreviewSchema,
      Type.Null(),
    ]),
    collectionPaths: Type.Union([ExperienceCollectionPathsSchema, Type.Null()]),
  },
  strict,
);

export const ExecutorProjectCardDtoSchema = Type.Object(
  {
    projectId: ProjectIdSchema,
    ideaId: IdeaIdSchema,
    version: Type.Integer({ minimum: 1 }),
    status: ProjectStatusSchema,
    phase: ProjectPhaseSchema,
    group: ExecutorProjectGroupSchema,
    goal: Type.String(),
    currentNextStep: Type.Union([Type.String(), Type.Null()]),
    updatedAt: DateTimeSchema,
    latestProgress: Type.Union([ExperienceProgressPreviewSchema, Type.Null()]),
    blockers: Type.Array(ExperienceAttentionPreviewSchema),
    pendingConfirmations: Type.Integer({ minimum: 0 }),
    supportRequests: Type.Array(ExperienceAttentionPreviewSchema),
    latestConclusion: Type.Union([
      ExperienceConclusionPreviewSchema,
      Type.Null(),
    ]),
    collectionPaths: ExperienceCollectionPathsSchema,
  },
  strict,
);

export const ExperienceProjectDetailDtoSchema = Type.Object(
  {
    view: ExperienceViewSchema,
    authority: ProjectAuthorityDtoSchema,
    roleSummary: Type.Object(
      {
        headline: Type.String(),
        nextAction: Type.Union([Type.String(), Type.Null()]),
        attentionLabel: Type.String(),
      },
      strict,
    ),
    previewCounts: Type.Object(
      {
        progressUpdates: Type.Integer({ minimum: 0 }),
        attentionItems: Type.Integer({ minimum: 0 }),
        evidence: Type.Integer({ minimum: 0 }),
        conclusions: Type.Integer({ minimum: 0 }),
        confirmations: Type.Integer({ minimum: 0 }),
      },
      strict,
    ),
    latestProgress: Type.Union([ExperienceProgressPreviewSchema, Type.Null()]),
    attentionPreview: Type.Array(ExperienceAttentionPreviewSchema),
    latestConclusion: Type.Union([
      ExperienceConclusionPreviewSchema,
      Type.Null(),
    ]),
    collectionPaths: ExperienceCollectionPathsSchema,
    reportPath: Type.String({ pattern: "^/" }),
  },
  strict,
);

export const ProposerIdeaPageDtoSchema = Type.Object(
  {
    items: Type.Array(ProposerIdeaCardDtoSchema),
    page: PageMetaSchema,
  },
  strict,
);
export const ExecutorProjectPageDtoSchema = Type.Object(
  {
    items: Type.Array(ExecutorProjectCardDtoSchema),
    page: PageMetaSchema,
  },
  strict,
);

export type ProposerIdeaCategory = Type.Static<
  typeof ProposerIdeaCategorySchema
>;
export type ExecutorProjectGroup = Type.Static<
  typeof ExecutorProjectGroupSchema
>;
export type ExperienceView = Type.Static<typeof ExperienceViewSchema>;
export type ExperienceProgressPreview = Type.Static<
  typeof ExperienceProgressPreviewSchema
>;
export type ExperienceAttentionPreview = Type.Static<
  typeof ExperienceAttentionPreviewSchema
>;
export type ExperienceConclusionPreview = Type.Static<
  typeof ExperienceConclusionPreviewSchema
>;
export type ProposerIdeaCardDto = Type.Static<typeof ProposerIdeaCardDtoSchema>;
export type ExecutorProjectCardDto = Type.Static<
  typeof ExecutorProjectCardDtoSchema
>;
export type ExperienceProjectDetailDto = Type.Static<
  typeof ExperienceProjectDetailDtoSchema
>;
