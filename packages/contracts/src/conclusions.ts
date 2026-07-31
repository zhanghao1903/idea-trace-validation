import { Type } from "typebox";

import {
  ActorDtoSchema,
  ConclusionIdSchema,
  DateTimeSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
} from "./common.js";
import { ProjectCommandBaseSchema } from "./project-execution.js";

const strict = { additionalProperties: false } as const;

export const RecommendationSchema = Type.Union([
  Type.Literal("CONTINUE"),
  Type.Literal("ADJUST"),
  Type.Literal("STOP"),
  Type.Literal("TRANSFER"),
]);
export const ConclusionStatusSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("PENDING_CONFIRMATION"),
  Type.Literal("CONFIRMED"),
  Type.Literal("SUPERSEDED"),
]);

export const CreateConclusionRequestSchema = Type.Object(
  {
    ...ProjectCommandBaseSchema.properties,
    evidenceSummary: Type.String({ minLength: 1, maxLength: 4000 }),
    evidenceIds: Type.Array(EvidenceIdSchema, {
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
    }),
    limitations: Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), {
      minItems: 1,
      maxItems: 20,
    }),
    uncertainties: Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), {
      minItems: 1,
      maxItems: 20,
    }),
    recommendation: RecommendationSchema,
    recommendationNote: Type.String({ minLength: 1, maxLength: 2000 }),
    supplementalNote: Type.Optional(
      Type.String({ minLength: 1, maxLength: 2000 }),
    ),
    supersedesConclusionId: Type.Optional(ConclusionIdSchema),
  },
  strict,
);

export const ConclusionDtoSchema = Type.Object(
  {
    id: ConclusionIdSchema,
    projectId: ProjectIdSchema,
    sequence: Type.Integer({ minimum: 1 }),
    evidenceSummary: Type.String(),
    evidenceIds: Type.Array(EvidenceIdSchema),
    limitations: Type.Array(Type.String()),
    uncertainties: Type.Array(Type.String()),
    recommendation: RecommendationSchema,
    recommendationNote: Type.String(),
    supplementalNote: Type.Union([Type.String(), Type.Null()]),
    supersedesConclusionId: Type.Union([ConclusionIdSchema, Type.Null()]),
    status: ConclusionStatusSchema,
    submittedBy: ActorDtoSchema,
    submittedAt: DateTimeSchema,
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
  },
  strict,
);

export type Recommendation = Type.Static<typeof RecommendationSchema>;
export type ConclusionStatus = Type.Static<typeof ConclusionStatusSchema>;
export type CreateConclusionRequest = Type.Static<
  typeof CreateConclusionRequestSchema
>;
export type ConclusionDto = Type.Static<typeof ConclusionDtoSchema>;
