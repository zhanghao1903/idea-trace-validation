import { Type } from "typebox";

import {
  ActorDtoSchema,
  DateTimeSchema,
  EvidenceIdSchema,
  ProgressIdSchema,
  ProjectIdSchema,
} from "./common.js";
import {
  ProjectCommandBaseSchema,
  ProjectPhaseSchema,
  ProjectStatusSchema,
} from "./project-execution.js";

const strict = { additionalProperties: false } as const;

export const CreateProgressUpdateRequestSchema = Type.Object(
  {
    ...ProjectCommandBaseSchema.properties,
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    completedWork: Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), {
      minItems: 1,
      maxItems: 20,
    }),
    nextStep: Type.String({ minLength: 1, maxLength: 2000 }),
    evidenceIds: Type.Array(EvidenceIdSchema, {
      minItems: 0,
      maxItems: 20,
      uniqueItems: true,
    }),
    occurredAt: DateTimeSchema,
    correctsProgressId: Type.Optional(ProgressIdSchema),
  },
  strict,
);

export const ProgressUpdateDtoSchema = Type.Object(
  {
    id: ProgressIdSchema,
    projectId: ProjectIdSchema,
    sequence: Type.Integer({ minimum: 1 }),
    summary: Type.String(),
    completedWork: Type.Array(Type.String()),
    nextStep: Type.String(),
    projectStatusAtSubmission: ProjectStatusSchema,
    phaseAtSubmission: ProjectPhaseSchema,
    evidenceIds: Type.Array(EvidenceIdSchema),
    occurredAt: DateTimeSchema,
    submittedAt: DateTimeSchema,
    submittedBy: ActorDtoSchema,
    correctsProgressId: Type.Union([ProgressIdSchema, Type.Null()]),
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
  },
  strict,
);

export type CreateProgressUpdateRequest = Type.Static<
  typeof CreateProgressUpdateRequestSchema
>;
export type ProgressUpdateDto = Type.Static<typeof ProgressUpdateDtoSchema>;
