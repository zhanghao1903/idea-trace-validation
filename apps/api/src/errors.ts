import type { ErrorPayload } from "@idea/application";

export const errorEnvelope = (requestId: string, error: ErrorPayload) => ({
  ok: false as const,
  error,
  meta: { requestId },
});

export const notFoundError = (
  resourceType: "IDEA" | "PROJECT",
  resourceId: string,
): ErrorPayload => ({
  code: resourceType === "IDEA" ? "IDEA_NOT_FOUND" : "PROJECT_NOT_FOUND",
  message: `${resourceType} was not found.`,
  retryable: false,
  details: {
    resourceType,
    resourceId,
    recovery: "VERIFY_ID_AND_REFETCH",
  },
});

export const validationError = (
  issues: { path: string; keyword: string; message: string }[],
): ErrorPayload => ({
  code: "VALIDATION_FAILED",
  message: "The request does not match the API contract.",
  retryable: false,
  details: { issues, recovery: "FIX_REQUEST" },
});
