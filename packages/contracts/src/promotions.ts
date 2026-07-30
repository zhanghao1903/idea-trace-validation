import { Type } from "typebox";

import {
  ActorInputSchema,
  ErrorEnvelopeSchema,
  WriteMetaSchema,
} from "./common.js";
import { IdeaAuthorityDtoSchema, IdeaParamsSchema } from "./ideas.js";
import { ProjectMutationDtoSchema } from "./projects.js";

const strict = { additionalProperties: false } as const;

export const PromoteIdeaRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 1 }),
    explicitIntent: Type.Literal("PROMOTE"),
    actor: ActorInputSchema,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  strict,
);

export const PromoteIdeaDataSchema = Type.Object(
  {
    idea: IdeaAuthorityDtoSchema,
    project: ProjectMutationDtoSchema,
  },
  strict,
);

export const PromoteIdeaSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    data: PromoteIdeaDataSchema,
    meta: WriteMetaSchema,
  },
  strict,
);

export const PromoteIdeaRouteSchema = {
  security: [{ aiWrite: [] }],
  params: IdeaParamsSchema,
  body: PromoteIdeaRequestSchema,
  headers: Type.Object(
    {
      authorization: Type.Optional(Type.String()),
      "idempotency-key": Type.String({
        minLength: 1,
        maxLength: 128,
        pattern: "^[A-Za-z0-9._~:+/-]+$",
      }),
    },
    { additionalProperties: true },
  ),
  response: {
    201: PromoteIdeaSuccessSchema,
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    409: ErrorEnvelopeSchema,
    422: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
    500: ErrorEnvelopeSchema,
  },
} as const;

export type PromoteIdeaRequest = Type.Static<typeof PromoteIdeaRequestSchema>;
