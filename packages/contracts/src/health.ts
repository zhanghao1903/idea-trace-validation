import { Type } from "typebox";

import { ErrorEnvelopeSchema, ReadMetaSchema } from "./common.js";

const strict = { additionalProperties: false } as const;

export const LiveDataSchema = Type.Object(
  { status: Type.Literal("live") },
  strict,
);
export const ReadyDataSchema = Type.Object(
  { status: Type.Literal("ready") },
  strict,
);
export const LiveSuccessSchema = Type.Object(
  { ok: Type.Literal(true), data: LiveDataSchema, meta: ReadMetaSchema },
  strict,
);
export const ReadySuccessSchema = Type.Object(
  { ok: Type.Literal(true), data: ReadyDataSchema, meta: ReadMetaSchema },
  strict,
);

export const LiveRouteSchema = {
  response: { 200: LiveSuccessSchema },
} as const;
export const ReadyRouteSchema = {
  response: { 200: ReadySuccessSchema, 503: ErrorEnvelopeSchema },
} as const;
