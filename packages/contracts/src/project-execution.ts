import { Type } from "typebox";

import {
  ActorDtoSchema,
  ActorInputSchema,
  ConclusionIdSchema,
  ConfirmationIdSchema,
  DateTimeSchema,
  ProjectIdSchema,
  TransitionIdSchema,
} from "./common.js";

const strict = { additionalProperties: false } as const;

export const ProjectPhaseSchema = Type.Union([
  Type.Literal("PLANNING"),
  Type.Literal("BUILDING"),
  Type.Literal("VALIDATING"),
  Type.Literal("CONCLUDING"),
]);
export const ProjectStatusSchema = Type.Union([
  Type.Literal("QUEUED"),
  Type.Literal("IN_PROGRESS"),
  Type.Literal("PAUSED"),
  Type.Literal("COMPLETED"),
]);
export const ProjectTransitionKindSchema = Type.Union([
  Type.Literal("START"),
  Type.Literal("PAUSE"),
  Type.Literal("RESUME"),
  Type.Literal("CHANGE_PHASE"),
  Type.Literal("COMPLETE"),
  Type.Literal("STOP"),
  Type.Literal("TRANSFER"),
  Type.Literal("REOPEN"),
]);

export const ProjectCommandBaseSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 1 }),
    actor: ActorInputSchema,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  strict,
);

const commandFields = ProjectCommandBaseSchema.properties;
const nextStep = Type.String({ minLength: 1, maxLength: 2000 });
const explanation = Type.String({ minLength: 1, maxLength: 2000 });

export const ProjectTransitionRequestSchema = Type.Union([
  Type.Object(
    { ...commandFields, transition: Type.Literal("START"), nextStep },
    strict,
  ),
  Type.Object(
    { ...commandFields, transition: Type.Literal("PAUSE"), explanation },
    strict,
  ),
  Type.Object(
    {
      ...commandFields,
      transition: Type.Literal("RESUME"),
      explanation,
      nextStep,
    },
    strict,
  ),
  Type.Object(
    {
      ...commandFields,
      transition: Type.Literal("CHANGE_PHASE"),
      targetPhase: ProjectPhaseSchema,
      nextStep,
    },
    strict,
  ),
]);

export const ProjectTransitionDtoSchema = Type.Object(
  {
    id: TransitionIdSchema,
    projectId: ProjectIdSchema,
    kind: ProjectTransitionKindSchema,
    fromStatus: ProjectStatusSchema,
    toStatus: ProjectStatusSchema,
    fromPhase: ProjectPhaseSchema,
    toPhase: ProjectPhaseSchema,
    explanation: Type.String(),
    nextStep: Type.Union([Type.String(), Type.Null()]),
    conclusionId: Type.Union([ConclusionIdSchema, Type.Null()]),
    confirmationId: Type.Union([ConfirmationIdSchema, Type.Null()]),
    relatedTransitionId: Type.Union([TransitionIdSchema, Type.Null()]),
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
    declaredActor: ActorDtoSchema,
    recordedAt: DateTimeSchema,
  },
  strict,
);

export type ProjectPhase = Type.Static<typeof ProjectPhaseSchema>;
export type ProjectStatus = Type.Static<typeof ProjectStatusSchema>;
export type ProjectTransitionKind = Type.Static<
  typeof ProjectTransitionKindSchema
>;
export type ProjectCommandBase = Type.Static<typeof ProjectCommandBaseSchema>;
export type ProjectTransitionRequest = Type.Static<
  typeof ProjectTransitionRequestSchema
>;
export type ProjectTransitionDto = Type.Static<
  typeof ProjectTransitionDtoSchema
>;
