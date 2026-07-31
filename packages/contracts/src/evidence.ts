import { Type } from "typebox";

import {
  ActorDtoSchema,
  ArtifactIdSchema,
  DateTimeSchema,
  EventIdSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
} from "./common.js";
import { ProjectCommandBaseSchema } from "./project-execution.js";

const strict = { additionalProperties: false } as const;
const base = ProjectCommandBaseSchema.properties;
const common = {
  title: Type.String({ minLength: 1, maxLength: 300 }),
  summary: Type.String({ minLength: 1, maxLength: 2000 }),
  capturedAt: DateTimeSchema,
};

export const EvidenceKindSchema = Type.Union([
  Type.Literal("LINK"),
  Type.Literal("ARTIFACT"),
  Type.Literal("METRIC"),
  Type.Literal("NOTE"),
]);
export const EvidenceStateSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("RETRACTED"),
]);

export const EvidencePayloadSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("LINK"),
      ...common,
      locator: Type.String({
        minLength: 1,
        maxLength: 2048,
        format: "uri",
        pattern: "^https://",
      }),
    },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("ARTIFACT"),
      ...common,
      locator: ArtifactIdSchema,
    },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("METRIC"),
      ...common,
      metricName: Type.String({ minLength: 1, maxLength: 200 }),
      metricValue: Type.String({ minLength: 1, maxLength: 200 }),
      metricUnit: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    },
    strict,
  ),
  Type.Object({ kind: Type.Literal("NOTE"), ...common }, strict),
]);

export const CreateEvidenceRequestSchema = Type.Union([
  Type.Object(
    {
      ...base,
      kind: Type.Literal("LINK"),
      ...common,
      locator: Type.String({
        minLength: 1,
        maxLength: 2048,
        format: "uri",
        pattern: "^https://",
      }),
    },
    strict,
  ),
  Type.Object(
    {
      ...base,
      kind: Type.Literal("ARTIFACT"),
      ...common,
      locator: ArtifactIdSchema,
    },
    strict,
  ),
  Type.Object(
    {
      ...base,
      kind: Type.Literal("METRIC"),
      ...common,
      metricName: Type.String({ minLength: 1, maxLength: 200 }),
      metricValue: Type.String({ minLength: 1, maxLength: 200 }),
      metricUnit: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    },
    strict,
  ),
  Type.Object({ ...base, kind: Type.Literal("NOTE"), ...common }, strict),
]);

export const EvidenceCorrectionRequestSchema = Type.Union([
  Type.Object(
    {
      ...base,
      action: Type.Literal("CORRECT"),
      replacement: EvidencePayloadSchema,
    },
    strict,
  ),
  Type.Object({ ...base, action: Type.Literal("RETRACT") }, strict),
]);

export const EvidenceDtoSchema = Type.Object(
  {
    id: EvidenceIdSchema,
    projectId: ProjectIdSchema,
    kind: EvidenceKindSchema,
    title: Type.String(),
    summary: Type.String(),
    locator: Type.Union([Type.String(), Type.Null()]),
    metricName: Type.Union([Type.String(), Type.Null()]),
    metricValue: Type.Union([Type.String(), Type.Null()]),
    metricUnit: Type.Union([Type.String(), Type.Null()]),
    capturedAt: DateTimeSchema,
    recordedAt: DateTimeSchema,
    recordedBy: ActorDtoSchema,
    state: EvidenceStateSchema,
    replacesEvidenceId: Type.Union([EvidenceIdSchema, Type.Null()]),
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
  },
  strict,
);

export const EvidenceEventDtoSchema = Type.Object(
  {
    id: EventIdSchema,
    projectId: ProjectIdSchema,
    evidenceId: EvidenceIdSchema,
    kind: Type.Union([Type.Literal("CORRECT"), Type.Literal("RETRACT")]),
    replacementEvidenceId: Type.Union([EvidenceIdSchema, Type.Null()]),
    reason: Type.String(),
    declaredActor: ActorDtoSchema,
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
    recordedAt: DateTimeSchema,
  },
  strict,
);

export const EvidenceHistoryDtoSchema = Type.Object(
  {
    evidence: EvidenceDtoSchema,
    lifecycleEvent: Type.Union([EvidenceEventDtoSchema, Type.Null()]),
  },
  strict,
);

export type EvidencePayload = Type.Static<typeof EvidencePayloadSchema>;
export type CreateEvidenceRequest = Type.Static<
  typeof CreateEvidenceRequestSchema
>;
export type EvidenceCorrectionRequest = Type.Static<
  typeof EvidenceCorrectionRequestSchema
>;
export type EvidenceDto = Type.Static<typeof EvidenceDtoSchema>;
export type EvidenceEventDto = Type.Static<typeof EvidenceEventDtoSchema>;
export type EvidenceHistoryDto = Type.Static<typeof EvidenceHistoryDtoSchema>;
