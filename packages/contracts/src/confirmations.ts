import { Type } from "typebox";

import {
  ActorDtoSchema,
  ConclusionIdSchema,
  ConfirmationIdSchema,
  DateTimeSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
  TransitionIdSchema,
} from "./common.js";
import { RecommendationSchema } from "./conclusions.js";
import {
  ProjectCommandBaseSchema,
  ProjectPhaseSchema,
  ProjectStatusSchema,
} from "./project-execution.js";

const strict = { additionalProperties: false } as const;
const command = ProjectCommandBaseSchema.properties;

export const ConfirmationOperationSchema = Type.Union([
  Type.Literal("CONFIRM_CONCLUSION"),
  Type.Literal("COMPLETE_PROJECT"),
  Type.Literal("STOP_PROJECT"),
  Type.Literal("TRANSFER_PROJECT"),
  Type.Literal("REOPEN_PROJECT"),
]);
export const ConfirmationDecisionSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("APPROVED"),
  Type.Literal("REJECTED"),
]);
export const ConfirmationUsabilitySchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("EXPIRED"),
  Type.Literal("STALE"),
  Type.Literal("CONSUMED"),
]);

export const CreateConfirmationRequestSchema = Type.Union([
  Type.Object(
    {
      ...command,
      operation: Type.Literal("CONFIRM_CONCLUSION"),
      conclusionId: ConclusionIdSchema,
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      operation: Type.Literal("COMPLETE_PROJECT"),
      conclusionId: ConclusionIdSchema,
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      operation: Type.Literal("STOP_PROJECT"),
      conclusionId: ConclusionIdSchema,
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      operation: Type.Literal("TRANSFER_PROJECT"),
      conclusionId: ConclusionIdSchema,
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      operation: Type.Literal("REOPEN_PROJECT"),
      terminalTransitionId: TransitionIdSchema,
      reopenReason: Type.String({ minLength: 1, maxLength: 2000 }),
      nextStep: Type.String({ minLength: 1, maxLength: 2000 }),
    },
    strict,
  ),
]);

export const ConfirmationDecisionRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 1 }),
    decision: Type.Union([Type.Literal("APPROVE"), Type.Literal("REJECT")]),
    decisionNote: Type.String({ minLength: 1, maxLength: 2000 }),
    actor: command.actor,
    reason: command.reason,
  },
  strict,
);

export const ConclusionApprovalSnapshotSchema = Type.Object(
  {
    id: ConclusionIdSchema,
    sequence: Type.Integer({ minimum: 1 }),
    statusAtRequest: Type.Union([
      Type.Literal("DRAFT"),
      Type.Literal("CONFIRMED"),
    ]),
    evidenceSummary: Type.String(),
    evidenceIds: Type.Array(EvidenceIdSchema),
    limitations: Type.Array(Type.String()),
    uncertainties: Type.Array(Type.String()),
    recommendation: RecommendationSchema,
    recommendationNote: Type.String(),
    supplementalNote: Type.Union([Type.String(), Type.Null()]),
  },
  strict,
);

export const TerminalTransitionSnapshotSchema = Type.Object(
  {
    id: TransitionIdSchema,
    kind: Type.Union([
      Type.Literal("COMPLETE"),
      Type.Literal("STOP"),
      Type.Literal("TRANSFER"),
    ]),
    conclusionId: ConclusionIdSchema,
    confirmationId: ConfirmationIdSchema,
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
    recordedAt: DateTimeSchema,
  },
  strict,
);

const payloadCommon = {
  schemaVersion: Type.Literal(1),
  projectId: ProjectIdSchema,
  projectVersion: Type.Integer({ minimum: 2 }),
  projectStatus: ProjectStatusSchema,
  projectPhase: ProjectPhaseSchema,
};

export const ConfirmationPayloadSummarySchema = Type.Union([
  Type.Object(
    {
      ...payloadCommon,
      operation: Type.Literal("CONFIRM_CONCLUSION"),
      conclusion: ConclusionApprovalSnapshotSchema,
      targetConclusionStatus: Type.Literal("CONFIRMED"),
    },
    strict,
  ),
  Type.Object(
    {
      ...payloadCommon,
      operation: Type.Literal("COMPLETE_PROJECT"),
      conclusion: ConclusionApprovalSnapshotSchema,
      targetConclusionStatus: Type.Literal("CONFIRMED"),
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
      targetProjectStatus: Type.Literal("COMPLETED"),
      completionKind: Type.Literal("COMPLETE"),
    },
    strict,
  ),
  Type.Object(
    {
      ...payloadCommon,
      operation: Type.Literal("STOP_PROJECT"),
      conclusion: ConclusionApprovalSnapshotSchema,
      targetConclusionStatus: Type.Literal("CONFIRMED"),
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
      targetProjectStatus: Type.Literal("COMPLETED"),
      completionKind: Type.Literal("STOP"),
    },
    strict,
  ),
  Type.Object(
    {
      ...payloadCommon,
      operation: Type.Literal("TRANSFER_PROJECT"),
      conclusion: ConclusionApprovalSnapshotSchema,
      targetConclusionStatus: Type.Literal("CONFIRMED"),
      completionSummary: Type.String({ minLength: 1, maxLength: 2000 }),
      targetProjectStatus: Type.Literal("COMPLETED"),
      completionKind: Type.Literal("TRANSFER"),
    },
    strict,
  ),
  Type.Object(
    {
      ...payloadCommon,
      operation: Type.Literal("REOPEN_PROJECT"),
      terminalTransition: TerminalTransitionSnapshotSchema,
      completedAt: DateTimeSchema,
      reopenReason: Type.String({ minLength: 1, maxLength: 2000 }),
      nextStep: Type.String({ minLength: 1, maxLength: 2000 }),
      targetProjectStatus: Type.Literal("IN_PROGRESS"),
      targetProjectPhase: ProjectPhaseSchema,
    },
    strict,
  ),
]);

export const HumanConfirmationSummaryDtoSchema = Type.Object(
  {
    id: ConfirmationIdSchema,
    projectId: ProjectIdSchema,
    operation: ConfirmationOperationSchema,
    conclusionId: Type.Union([ConclusionIdSchema, Type.Null()]),
    terminalTransitionId: Type.Union([TransitionIdSchema, Type.Null()]),
    payloadSummary: ConfirmationPayloadSummarySchema,
    expectedProjectVersion: Type.Integer({ minimum: 1 }),
    expiresAt: DateTimeSchema,
    decision: ConfirmationDecisionSchema,
    usability: ConfirmationUsabilitySchema,
    decidedBy: Type.Union([ActorDtoSchema, Type.Null()]),
    decidedAt: Type.Union([DateTimeSchema, Type.Null()]),
    decisionNote: Type.Union([Type.String(), Type.Null()]),
    resultingProjectVersion: Type.Union([
      Type.Integer({ minimum: 1 }),
      Type.Null(),
    ]),
    createdAt: DateTimeSchema,
  },
  strict,
);

export type CreateConfirmationRequest = Type.Static<
  typeof CreateConfirmationRequestSchema
>;
export type ConfirmationDecisionRequest = Type.Static<
  typeof ConfirmationDecisionRequestSchema
>;
export type ConfirmationOperation = Type.Static<
  typeof ConfirmationOperationSchema
>;
export type ConfirmationPayloadSummary = Type.Static<
  typeof ConfirmationPayloadSummarySchema
>;
export type HumanConfirmationSummaryDto = Type.Static<
  typeof HumanConfirmationSummaryDtoSchema
>;
