const ALLOWED_SUMMARY_FIELDS = new Set([
  "status",
  "version",
  "changedFieldNames",
  "statementIds",
  "questionId",
  "answerId",
  "projectId",
]);

export const auditSummary = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => ALLOWED_SUMMARY_FIELDS.has(key)),
  );
