import { Type, type TSchema } from "typebox";

import {
  ActorDtoSchema,
  AttentionIdSchema,
  DateTimeSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
  ReportIdSchema,
} from "./common.js";
import {
  structuredReportV1Schema,
  type StructuredReportV1,
} from "./generated/structured-report.v1.js";

const strict = { additionalProperties: false } as const;

export const StructuredReportV1Schema = Type.Unsafe<StructuredReportV1>(
  structuredReportV1Schema as unknown as TSchema,
);

export const ReportDisplayModeSchema = Type.Union([
  Type.Literal("EMPTY"),
  Type.Literal("CURRENT"),
  Type.Literal("FALLBACK"),
  Type.Literal("UNSUPPORTED"),
]);
export const ReportCompatibilityCodeSchema = Type.Union([
  Type.Literal("REPORT_SCHEMA_UNSUPPORTED"),
  Type.Literal("REPORT_COMPILER_UNSUPPORTED"),
  Type.Literal("REPORT_RENDER_UNAVAILABLE"),
]);

export const SafeInlineTokenSchema = Type.Cyclic(
  {
    token: Type.Union([
      Type.Object({ type: Type.Literal("text"), value: Type.String() }, strict),
      Type.Object(
        {
          type: Type.Literal("strong"),
          children: Type.Array(Type.Ref("token")),
        },
        strict,
      ),
      Type.Object(
        {
          type: Type.Literal("emphasis"),
          children: Type.Array(Type.Ref("token")),
        },
        strict,
      ),
      Type.Object(
        { type: Type.Literal("inline_code"), value: Type.String() },
        strict,
      ),
      Type.Object(
        {
          type: Type.Literal("link"),
          href: Type.String({ pattern: "^https://" }),
          children: Type.Array(Type.Ref("token")),
        },
        strict,
      ),
      Type.Object({ type: Type.Literal("break") }, strict),
    ]),
  },
  "token",
);

export const SafeMarkdownBlockSchema = Type.Cyclic(
  {
    block: Type.Union([
      Type.Object(
        {
          type: Type.Literal("paragraph"),
          children: Type.Array(SafeInlineTokenSchema),
        },
        strict,
      ),
      Type.Object(
        {
          type: Type.Literal("list"),
          ordered: Type.Boolean(),
          items: Type.Array(Type.Array(Type.Ref("block"))),
        },
        strict,
      ),
    ]),
  },
  "block",
);

const ReportRecordSchema = Type.Record(Type.String(), Type.Unknown());
export const SafeReportBlockSchema = Type.Union([
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("text"),
      content: Type.Array(SafeMarkdownBlockSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("metrics"),
      items: Type.Array(ReportRecordSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("list"),
      ordered: Type.Boolean(),
      items: Type.Array(ReportRecordSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("table"),
      columns: Type.Array(ReportRecordSchema),
      rows: Type.Array(ReportRecordSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("timeline"),
      items: Type.Array(ReportRecordSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("evidence_refs"),
      evidenceIds: Type.Array(EvidenceIdSchema),
    },
    strict,
  ),
  Type.Object(
    {
      id: Type.String(),
      type: Type.Literal("action_refs"),
      attentionItemIds: Type.Array(AttentionIdSchema),
    },
    strict,
  ),
]);

export const SafeReportRenderModelSchema = Type.Object(
  {
    schemaVersion: Type.Literal("1.0"),
    locale: Type.String(),
    title: Type.String(),
    summary: Type.Union([Type.String(), Type.Null()]),
    sections: Type.Array(
      Type.Object(
        {
          id: Type.String(),
          title: Type.String(),
          description: Type.Union([Type.String(), Type.Null()]),
          blocks: Type.Array(SafeReportBlockSchema),
        },
        strict,
      ),
    ),
  },
  strict,
);

export const HydratedEvidenceRefSchema = Type.Object(
  {
    id: EvidenceIdSchema,
    kind: Type.Union([
      Type.Literal("LINK"),
      Type.Literal("ARTIFACT"),
      Type.Literal("METRIC"),
      Type.Literal("NOTE"),
    ]),
    title: Type.String(),
    summary: Type.String(),
    state: Type.Union([
      Type.Literal("ACTIVE"),
      Type.Literal("RETRACTED"),
      Type.Literal("UNAVAILABLE"),
    ]),
    detailPath: Type.String({ pattern: "^/" }),
    historyPath: Type.String({ pattern: "^/" }),
  },
  strict,
);
export const HydratedAttentionRefSchema = Type.Object(
  {
    id: AttentionIdSchema,
    type: Type.Union([
      Type.Literal("BLOCKER"),
      Type.Literal("DECISION_REQUEST"),
      Type.Literal("SUPPORT_REQUEST"),
      Type.Literal("UNAVAILABLE"),
    ]),
    title: Type.String(),
    status: Type.Union([
      Type.Literal("OPEN"),
      Type.Literal("NEEDS_INFO"),
      Type.Literal("RESOLVED"),
      Type.Literal("CLOSED"),
      Type.Literal("UNAVAILABLE"),
    ]),
    waitingForRole: Type.Union([
      Type.Literal("PROPOSER"),
      Type.Literal("EXECUTOR"),
      Type.Literal("MAINTAINER"),
      Type.Null(),
    ]),
    detailPath: Type.String({ pattern: "^/" }),
    historyPath: Type.String({ pattern: "^/" }),
  },
  strict,
);
export const HydratedReportRefsSchema = Type.Object(
  {
    evidence: Type.Array(HydratedEvidenceRefSchema),
    attentionItems: Type.Array(HydratedAttentionRefSchema),
  },
  strict,
);

export const AcceptedReportDtoSchema = Type.Object(
  {
    revision: Type.Integer({ minimum: 1 }),
    previousRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    schemaVersion: Type.String({ minLength: 1, maxLength: 32 }),
    contentSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    sourceDocument: StructuredReportV1Schema,
    submittedBy: ActorDtoSchema,
    acceptedAt: DateTimeSchema,
  },
  strict,
);
export const ReportRenderSlotDtoSchema = Type.Object(
  {
    revision: Type.Integer({ minimum: 1 }),
    schemaVersion: Type.String({ minLength: 1, maxLength: 32 }),
    compilerVersion: Type.String({ minLength: 1, maxLength: 64 }),
    contentSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    acceptedAt: DateTimeSchema,
    renderModel: SafeReportRenderModelSchema,
    hydratedRefs: HydratedReportRefsSchema,
  },
  strict,
);
export const ReportCurrentDtoSchema = Type.Object(
  {
    projectId: ProjectIdSchema,
    reportId: Type.Union([ReportIdSchema, Type.Null()]),
    displayMode: ReportDisplayModeSchema,
    accepted: Type.Union([AcceptedReportDtoSchema, Type.Null()]),
    primary: Type.Union([ReportRenderSlotDtoSchema, Type.Null()]),
    runtimeFallback: Type.Union([ReportRenderSlotDtoSchema, Type.Null()]),
    compatibilityCode: Type.Union([ReportCompatibilityCodeSchema, Type.Null()]),
  },
  strict,
);

export const ReportSubmissionResultDtoSchema = Type.Object(
  {
    reportId: ReportIdSchema,
    projectId: ProjectIdSchema,
    revision: Type.Integer({ minimum: 1 }),
    previousRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    contentSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    acceptedAt: DateTimeSchema,
  },
  strict,
);
export const ReportRevisionSummaryDtoSchema = Type.Object(
  {
    reportId: ReportIdSchema,
    projectId: ProjectIdSchema,
    revision: Type.Integer({ minimum: 1 }),
    previousRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    schemaVersion: Type.String({ minLength: 1, maxLength: 32 }),
    compilerVersion: Type.String({ minLength: 1, maxLength: 64 }),
    contentSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    renderable: Type.Boolean(),
    submittedBy: ActorDtoSchema,
    acceptedAt: DateTimeSchema,
  },
  strict,
);
export const ReportRevisionDtoSchema = Type.Object(
  {
    ...ReportRevisionSummaryDtoSchema.properties,
    sourceDocument: StructuredReportV1Schema,
    renderSlot: Type.Union([ReportRenderSlotDtoSchema, Type.Null()]),
    compatibilityCode: Type.Union([ReportCompatibilityCodeSchema, Type.Null()]),
  },
  strict,
);

export type ReportDisplayMode = Type.Static<typeof ReportDisplayModeSchema>;
export type SafeReportRenderModelDto = Type.Static<
  typeof SafeReportRenderModelSchema
>;
export type AcceptedReportDto = Type.Static<typeof AcceptedReportDtoSchema>;
export type ReportRenderSlotDto = Type.Static<typeof ReportRenderSlotDtoSchema>;
export type ReportCurrentDto = Type.Static<typeof ReportCurrentDtoSchema>;
export type ReportSubmissionResultDto = Type.Static<
  typeof ReportSubmissionResultDtoSchema
>;
export type ReportRevisionSummaryDto = Type.Static<
  typeof ReportRevisionSummaryDtoSchema
>;
export type ReportRevisionDto = Type.Static<typeof ReportRevisionDtoSchema>;
