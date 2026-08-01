# Structured Reports

Use the canonical
[`structured-report.v1.schema.json`](../../../packages/contracts/schemas/structured-report.v1.schema.json)
and the report routes in
[`openapi/lp03.v1.json`](../../../openapi/lp03.v1.json). Do not reproduce or
extend the schema here.

1. Read the current project, report current view, referenced Evidence, and
   attention items.
2. Keep facts, hypotheses, limitations, and uncertainties visibly distinct.
3. Build a `schemaVersion: "1.0"` document using only the seven controlled block
   families: text, metrics, list, table, timeline, Evidence references, and
   action references.
4. Set body `clientRequestId` equal to the `Idempotency-Key` header and bind
   `basedOnRevision` to the current read.
5. Submit through `POST /api/v1/projects/{projectId}/reports`.
6. On a structured path error, change only known invalid content and use a new
   identity. Prove the rejected attempt did not advance the current revision.
7. Re-read current report and referenced resources. Treat the server-safe render
   model as presentation; project authority remains separate.

Never send HTML, JavaScript, CSS, raw Markdown extensions, or arbitrary block
types. Preserve caller-supplied block and section order unless the user asks for
a changed report.
