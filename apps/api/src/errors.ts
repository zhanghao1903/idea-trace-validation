import type { ErrorPayload } from "@idea/application";

const DOMAIN_ERROR_STATUS = {
  IDEA_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  ATTENTION_ITEM_NOT_FOUND: 404,
  EVIDENCE_NOT_FOUND: 404,
  CONCLUSION_NOT_FOUND: 404,
  CONFIRMATION_NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  VERSION_CONFLICT: 409,
  ALREADY_PROMOTED: 409,
  IDEA_ALREADY_PROMOTED: 409,
  PROMOTION_PRECONDITION_FAILED: 422,
  PROJECT_STATE_CONFLICT: 409,
  PHASE_TRANSITION_INVALID: 409,
  ATTENTION_STATE_CONFLICT: 409,
  CROSS_PROJECT_REFERENCE: 409,
  REFERENCE_NOT_ACTIVE: 409,
  CONCLUSION_STATE_CONFLICT: 409,
  RECOMMENDATION_MISMATCH: 409,
  CONFIRMATION_ALREADY_PENDING: 409,
  CONFIRMATION_EXPIRED: 409,
  CONFIRMATION_ALREADY_DECIDED: 409,
  CONFIRMATION_STALE: 409,
  PROJECT_PRECONDITION_FAILED: 422,
  REPORT_IDENTITY_MISMATCH: 400,
  REPORT_SCHEMA_UNSUPPORTED: 400,
  REPORT_VALIDATION_FAILED: 400,
  REPORT_UNSAFE_CONTENT: 400,
  REPORT_REFERENCE_INVALID: 400,
  REPORT_REVISION_NOT_FOUND: 404,
  REPORT_REVISION_CONFLICT: 409,
  PROJECT_REPORT_FROZEN: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_TOO_LARGE: 413,
} as const satisfies Record<string, number>;

type DomainErrorCode = keyof typeof DOMAIN_ERROR_STATUS;

export const domainErrorResponse = (candidate: {
  code?: string;
  message?: string;
  details?: Readonly<Record<string, unknown>>;
}): Readonly<{ status: number; error: ErrorPayload }> | undefined => {
  if (
    candidate.code === undefined ||
    !(candidate.code in DOMAIN_ERROR_STATUS) ||
    candidate.message === undefined ||
    candidate.details === undefined
  ) {
    return undefined;
  }
  const code = candidate.code as DomainErrorCode;
  return {
    status: DOMAIN_ERROR_STATUS[code],
    error: {
      code,
      message: candidate.message,
      retryable: false,
      details: candidate.details,
    } as ErrorPayload,
  };
};

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
