import { Type } from "typebox";

import { AuditEventDtoSchema } from "./ideas.js";
import { ProjectTransitionDtoSchema } from "./project-execution.js";

const strict = { additionalProperties: false } as const;

export const ProjectHistoryItemDtoSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("TRANSITION"),
      projectVersion: Type.Integer({ minimum: 2 }),
      transition: ProjectTransitionDtoSchema,
    },
    strict,
  ),
  Type.Object(
    {
      kind: Type.Literal("AUDIT"),
      projectVersion: Type.Integer({ minimum: 1 }),
      audit: AuditEventDtoSchema,
    },
    strict,
  ),
]);

export type ProjectHistoryItemDto = Type.Static<
  typeof ProjectHistoryItemDtoSchema
>;
