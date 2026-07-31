import { Type } from "typebox";

import {
  ActorDtoSchema,
  AttentionEventIdSchema,
  AttentionIdSchema,
  DateTimeSchema,
  ProjectIdSchema,
} from "./common.js";
import { ProjectCommandBaseSchema } from "./project-execution.js";

const strict = { additionalProperties: false } as const;
const command = ProjectCommandBaseSchema.properties;

export const AttentionTypeSchema = Type.Union([
  Type.Literal("BLOCKER"),
  Type.Literal("DECISION_REQUEST"),
  Type.Literal("SUPPORT_REQUEST"),
]);
export const AttentionStatusSchema = Type.Union([
  Type.Literal("OPEN"),
  Type.Literal("NEEDS_INFO"),
  Type.Literal("RESOLVED"),
  Type.Literal("CLOSED"),
]);
export const AttentionEventKindSchema = Type.Union([
  Type.Literal("COMMENT"),
  Type.Literal("REQUEST_INFO"),
  Type.Literal("PROVIDE_INFO"),
  Type.Literal("RESOLVE"),
  Type.Literal("CLOSE"),
  Type.Literal("CORRECT_RESPONSE"),
]);
const CorrectedAttentionEventKindSchema = Type.Union([
  Type.Literal("COMMENT"),
  Type.Literal("REQUEST_INFO"),
  Type.Literal("PROVIDE_INFO"),
  Type.Literal("RESOLVE"),
  Type.Literal("CLOSE"),
]);
const SimpleAttentionEventKindSchema = Type.Union([
  Type.Literal("COMMENT"),
  Type.Literal("REQUEST_INFO"),
  Type.Literal("PROVIDE_INFO"),
  Type.Literal("CLOSE"),
]);
const responderRole = Type.Union([
  Type.Literal("PROPOSER"),
  Type.Literal("EXECUTOR"),
  Type.Literal("MAINTAINER"),
]);
const message = Type.String({ minLength: 1, maxLength: 2000 });

export const CreateAttentionItemRequestSchema = Type.Union([
  Type.Object(
    {
      ...command,
      type: Type.Literal("BLOCKER"),
      title: Type.String({ minLength: 1, maxLength: 300 }),
      background: message,
      impact: message,
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      type: Type.Literal("DECISION_REQUEST"),
      title: Type.String({ minLength: 1, maxLength: 300 }),
      background: message,
      decisionImpact: message,
      waitingForRole: responderRole,
      options: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
        maxItems: 10,
        uniqueItems: true,
      }),
      recommendation: Type.Union([
        Type.String({ minLength: 1, maxLength: 1000 }),
        Type.Null(),
      ]),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      type: Type.Literal("SUPPORT_REQUEST"),
      title: Type.String({ minLength: 1, maxLength: 300 }),
      supportNeeded: message,
      requestReason: message,
      impact: message,
      expectedResponderRole: responderRole,
    },
    strict,
  ),
]);

const simpleEvent = (
  kind: "COMMENT" | "REQUEST_INFO" | "PROVIDE_INFO" | "CLOSE",
) => Type.Object({ ...command, kind: Type.Literal(kind), message }, strict);

export const AttentionEventRequestSchema = Type.Union([
  simpleEvent("COMMENT"),
  simpleEvent("REQUEST_INFO"),
  simpleEvent("PROVIDE_INFO"),
  simpleEvent("CLOSE"),
  Type.Object(
    { ...command, kind: Type.Literal("RESOLVE"), message, resolution: message },
    strict,
  ),
  Type.Object(
    {
      ...command,
      kind: Type.Literal("RESOLVE"),
      message,
      selectedOption: Type.String({ minLength: 1, maxLength: 500 }),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      kind: Type.Literal("RESOLVE"),
      message,
      decisionText: message,
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      kind: Type.Literal("RESOLVE"),
      message,
      supportSummary: message,
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      kind: Type.Literal("CORRECT_RESPONSE"),
      correctsEventId: AttentionEventIdSchema,
      correctedKind: SimpleAttentionEventKindSchema,
      replacement: Type.Object(
        {
          message,
        },
        strict,
      ),
    },
    strict,
  ),
  Type.Object(
    {
      ...command,
      kind: Type.Literal("CORRECT_RESPONSE"),
      correctsEventId: AttentionEventIdSchema,
      correctedKind: Type.Literal("RESOLVE"),
      replacement: Type.Union([
        Type.Object({ message, resolution: message }, strict),
        Type.Object(
          {
            message,
            selectedOption: Type.String({ minLength: 1, maxLength: 500 }),
          },
          strict,
        ),
        Type.Object({ message, decisionText: message }, strict),
        Type.Object({ message, supportSummary: message }, strict),
      ]),
    },
    strict,
  ),
]);

export const AttentionItemDtoSchema = Type.Object(
  {
    id: AttentionIdSchema,
    projectId: ProjectIdSchema,
    type: AttentionTypeSchema,
    title: Type.String(),
    status: AttentionStatusSchema,
    background: Type.Union([Type.String(), Type.Null()]),
    impact: Type.Union([Type.String(), Type.Null()]),
    options: Type.Array(Type.String()),
    recommendation: Type.Union([Type.String(), Type.Null()]),
    decisionImpact: Type.Union([Type.String(), Type.Null()]),
    waitingForRole: Type.Union([responderRole, Type.Null()]),
    supportNeeded: Type.Union([Type.String(), Type.Null()]),
    requestReason: Type.Union([Type.String(), Type.Null()]),
    expectedResponderRole: Type.Union([responderRole, Type.Null()]),
    createdBy: ActorDtoSchema,
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    resolvedAt: Type.Union([DateTimeSchema, Type.Null()]),
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
  },
  strict,
);

export const AttentionEventDtoSchema = Type.Object(
  {
    id: AttentionEventIdSchema,
    attentionItemId: AttentionIdSchema,
    projectId: ProjectIdSchema,
    kind: AttentionEventKindSchema,
    message: Type.String(),
    fromStatus: AttentionStatusSchema,
    toStatus: AttentionStatusSchema,
    resolution: Type.Union([Type.String(), Type.Null()]),
    selectedOption: Type.Union([Type.String(), Type.Null()]),
    decisionText: Type.Union([Type.String(), Type.Null()]),
    supportSummary: Type.Union([Type.String(), Type.Null()]),
    correctsEventId: Type.Union([AttentionEventIdSchema, Type.Null()]),
    correctedKind: Type.Union([CorrectedAttentionEventKindSchema, Type.Null()]),
    declaredActor: ActorDtoSchema,
    recordedAt: DateTimeSchema,
    resultingProjectVersion: Type.Integer({ minimum: 2 }),
  },
  strict,
);

export const AttentionEffectiveResponseSchema = Type.Object(
  {
    message: Type.String(),
    resolution: Type.Union([Type.String(), Type.Null()]),
    selectedOption: Type.Union([Type.String(), Type.Null()]),
    decisionText: Type.Union([Type.String(), Type.Null()]),
    supportSummary: Type.Union([Type.String(), Type.Null()]),
  },
  strict,
);

export const AttentionEventHistoryDtoSchema = Type.Object(
  {
    original: AttentionEventDtoSchema,
    corrections: Type.Array(AttentionEventDtoSchema),
    effectiveResponse: AttentionEffectiveResponseSchema,
    stateEffect: Type.Object(
      {
        fromStatus: AttentionStatusSchema,
        toStatus: AttentionStatusSchema,
      },
      strict,
    ),
  },
  strict,
);

export const AttentionItemHistoryDtoSchema = Type.Object(
  {
    item: AttentionItemDtoSchema,
    eventHistory: Type.Array(AttentionEventHistoryDtoSchema),
  },
  strict,
);

export type CreateAttentionItemRequest = Type.Static<
  typeof CreateAttentionItemRequestSchema
>;
export type AttentionEventRequest = Type.Static<
  typeof AttentionEventRequestSchema
>;
export type AttentionItemDto = Type.Static<typeof AttentionItemDtoSchema>;
export type AttentionEventDto = Type.Static<typeof AttentionEventDtoSchema>;
export type AttentionEffectiveResponse = Type.Static<
  typeof AttentionEffectiveResponseSchema
>;
export type AttentionStatus = Type.Static<typeof AttentionStatusSchema>;
export type AttentionType = Type.Static<typeof AttentionTypeSchema>;
export type AttentionItemHistoryDto = Type.Static<
  typeof AttentionItemHistoryDtoSchema
>;
