import { Type, type TSchema } from "typebox";

import {
  AttentionIdSchema,
  ConfirmationIdSchema,
  ErrorEnvelopeSchema,
  EvidenceIdSchema,
  IdempotencyKeySchema,
  PageMetaSchema,
  ProjectIdSchema,
  readSuccess,
  writeSuccess,
} from "./common.js";
import {
  AttentionEventDtoSchema,
  AttentionEffectiveResponseSchema,
  AttentionEventRequestSchema,
  AttentionItemDtoSchema,
  AttentionItemHistoryDtoSchema,
  AttentionStatusSchema,
  AttentionTypeSchema,
  CreateAttentionItemRequestSchema,
} from "./attention.js";
import {
  ConfirmationDecisionRequestSchema,
  CreateConfirmationRequestSchema,
  HumanConfirmationSummaryDtoSchema,
} from "./confirmations.js";
import {
  ConclusionDtoSchema,
  CreateConclusionRequestSchema,
} from "./conclusions.js";
import {
  CreateEvidenceRequestSchema,
  EvidenceCorrectionRequestSchema,
  EvidenceDtoSchema,
  EvidenceEventDtoSchema,
  EvidenceHistoryDtoSchema,
} from "./evidence.js";
import {
  ProjectTransitionDtoSchema,
  ProjectTransitionRequestSchema,
} from "./project-execution.js";
import {
  CreateProgressUpdateRequestSchema,
  ProgressUpdateDtoSchema,
} from "./progress.js";
import { ProjectAuthorityDtoSchema } from "./projects.js";
import { ProjectHistoryItemDtoSchema } from "./history.js";

const strict = { additionalProperties: false } as const;
export const ProjectExecutionParamsSchema = Type.Object(
  { projectId: ProjectIdSchema },
  strict,
);
export const AttentionParamsSchema = Type.Object(
  { projectId: ProjectIdSchema, itemId: AttentionIdSchema },
  strict,
);
export const EvidenceParamsSchema = Type.Object(
  { projectId: ProjectIdSchema, evidenceId: EvidenceIdSchema },
  strict,
);
export const ConfirmationParamsSchema = Type.Object(
  { confirmationId: ConfirmationIdSchema },
  strict,
);

const commonErrors = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
  422: ErrorEnvelopeSchema,
  503: ErrorEnvelopeSchema,
  500: ErrorEnvelopeSchema,
} as const;
const CollectionPageQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  strict,
);

export const ProjectTransitionRouteSchema = {
  security: [{ aiWrite: [] }],
  params: ProjectExecutionParamsSchema,
  headers: Type.Object(
    {
      authorization: Type.Optional(Type.String()),
      "idempotency-key": IdempotencyKeySchema,
    },
    { additionalProperties: true },
  ),
  body: ProjectTransitionRequestSchema,
  response: {
    200: writeSuccess(
      Type.Object(
        {
          project: ProjectAuthorityDtoSchema,
          transition: ProjectTransitionDtoSchema,
        },
        strict,
      ),
    ),
    ...commonErrors,
  },
} as const;

const writeRoute = <
  TBody extends TSchema,
  TData extends TSchema,
  TParams extends TSchema = typeof ProjectExecutionParamsSchema,
>(
  body: TBody,
  data: TData,
  params: TParams = ProjectExecutionParamsSchema as unknown as TParams,
) => ({
  security: [{ aiWrite: [] }],
  params,
  headers: Type.Object(
    {
      authorization: Type.Optional(Type.String()),
      "idempotency-key": IdempotencyKeySchema,
    },
    { additionalProperties: true },
  ),
  body,
  response: {
    201: writeSuccess(data),
    ...commonErrors,
  },
});

export const ProgressUpdateRouteSchema = writeRoute(
  CreateProgressUpdateRequestSchema,
  Type.Object(
    {
      project: ProjectAuthorityDtoSchema,
      progressUpdate: ProgressUpdateDtoSchema,
    },
    strict,
  ),
);
export const AttentionCreateRouteSchema = writeRoute(
  CreateAttentionItemRequestSchema,
  Type.Object(
    {
      project: ProjectAuthorityDtoSchema,
      attentionItem: AttentionItemDtoSchema,
    },
    strict,
  ),
);
export const AttentionEventRouteSchema = writeRoute(
  AttentionEventRequestSchema,
  Type.Object(
    {
      project: ProjectAuthorityDtoSchema,
      attentionItem: AttentionItemDtoSchema,
      event: AttentionEventDtoSchema,
      effectiveResponse: Type.Union([
        AttentionEffectiveResponseSchema,
        Type.Null(),
      ]),
    },
    strict,
  ),
  AttentionParamsSchema,
);
export const EvidenceCreateRouteSchema = writeRoute(
  CreateEvidenceRequestSchema,
  Type.Object(
    { project: ProjectAuthorityDtoSchema, evidence: EvidenceDtoSchema },
    strict,
  ),
);
export const EvidenceCorrectionRouteSchema = writeRoute(
  EvidenceCorrectionRequestSchema,
  Type.Object(
    {
      project: ProjectAuthorityDtoSchema,
      evidence: EvidenceDtoSchema,
      event: EvidenceEventDtoSchema,
    },
    strict,
  ),
  EvidenceParamsSchema,
);
export const ConclusionCreateRouteSchema = writeRoute(
  CreateConclusionRequestSchema,
  Type.Object(
    { project: ProjectAuthorityDtoSchema, conclusion: ConclusionDtoSchema },
    strict,
  ),
);

export const ConfirmationCreateRouteSchema = {
  security: [{ humanControl: [] }],
  params: ProjectExecutionParamsSchema,
  headers: Type.Object(
    {
      "x-human-control-token": Type.Optional(Type.String()),
      "idempotency-key": IdempotencyKeySchema,
    },
    { additionalProperties: true },
  ),
  body: CreateConfirmationRequestSchema,
  response: {
    201: writeSuccess(
      Type.Object(
        {
          project: ProjectAuthorityDtoSchema,
          confirmation: HumanConfirmationSummaryDtoSchema,
        },
        strict,
      ),
    ),
    ...commonErrors,
  },
} as const;
export const ConfirmationDecisionRouteSchema = {
  security: [{ confirmationCapability: [] }],
  params: ConfirmationParamsSchema,
  headers: Type.Object(
    {
      cookie: Type.Optional(Type.String()),
      "idempotency-key": IdempotencyKeySchema,
    },
    { additionalProperties: true },
  ),
  body: ConfirmationDecisionRequestSchema,
  response: {
    200: writeSuccess(
      Type.Object(
        {
          project: ProjectAuthorityDtoSchema,
          confirmation: HumanConfirmationSummaryDtoSchema,
          conclusion: Type.Union([ConclusionDtoSchema, Type.Null()]),
          transition: Type.Union([ProjectTransitionDtoSchema, Type.Null()]),
        },
        strict,
      ),
    ),
    ...commonErrors,
  },
} as const;

const collection = <T extends TSchema>(item: T) =>
  readSuccess(
    Type.Object({ items: Type.Array(item), page: PageMetaSchema }, strict),
  );
export const ProgressCollectionRouteSchema = {
  params: ProjectExecutionParamsSchema,
  querystring: CollectionPageQuerySchema,
  response: { 200: collection(ProgressUpdateDtoSchema), ...commonErrors },
} as const;
export const EvidenceCollectionRouteSchema = {
  params: ProjectExecutionParamsSchema,
  querystring: CollectionPageQuerySchema,
  response: { 200: collection(EvidenceHistoryDtoSchema), ...commonErrors },
} as const;
export const ConclusionCollectionRouteSchema = {
  params: ProjectExecutionParamsSchema,
  querystring: CollectionPageQuerySchema,
  response: { 200: collection(ConclusionDtoSchema), ...commonErrors },
} as const;
export const AttentionCollectionRouteSchema = {
  params: ProjectExecutionParamsSchema,
  querystring: Type.Object(
    {
      ...CollectionPageQuerySchema.properties,
      type: Type.Optional(AttentionTypeSchema),
      status: Type.Optional(AttentionStatusSchema),
    },
    strict,
  ),
  response: { 200: collection(AttentionItemHistoryDtoSchema), ...commonErrors },
} as const;
export const ProjectHistoryCollectionRouteSchema = {
  params: ProjectExecutionParamsSchema,
  querystring: CollectionPageQuerySchema,
  response: { 200: collection(ProjectHistoryItemDtoSchema), ...commonErrors },
} as const;

export const ConfirmationGetRouteSchema = {
  security: [{ humanControl: [] }, { confirmationCapability: [] }],
  params: ConfirmationParamsSchema,
  headers: Type.Object({}, { additionalProperties: true }),
  response: {
    200: readSuccess(
      Type.Object({ confirmation: HumanConfirmationSummaryDtoSchema }, strict),
    ),
    ...commonErrors,
  },
} as const;
