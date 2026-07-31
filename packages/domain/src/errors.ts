export type DomainErrorCode =
  | "IDEA_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "ALREADY_PROMOTED"
  | "IDEA_ALREADY_PROMOTED"
  | "PROMOTION_PRECONDITION_FAILED"
  | "ATTENTION_ITEM_NOT_FOUND"
  | "EVIDENCE_NOT_FOUND"
  | "CONCLUSION_NOT_FOUND"
  | "CONFIRMATION_NOT_FOUND"
  | "PROJECT_STATE_CONFLICT"
  | "PHASE_TRANSITION_INVALID"
  | "ATTENTION_STATE_CONFLICT"
  | "CROSS_PROJECT_REFERENCE"
  | "REFERENCE_NOT_ACTIVE"
  | "CONCLUSION_STATE_CONFLICT"
  | "RECOMMENDATION_MISMATCH"
  | "CONFIRMATION_ALREADY_PENDING"
  | "CONFIRMATION_EXPIRED"
  | "CONFIRMATION_ALREADY_DECIDED"
  | "CONFIRMATION_STALE"
  | "PROJECT_PRECONDITION_FAILED"
  | "VALIDATION_FAILED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const versionConflict = (
  resourceId: string,
  expectedVersion: number,
  currentVersion: number,
) =>
  new DomainError(
    "VERSION_CONFLICT",
    "Resource changed since the supplied version.",
    {
      resourceId,
      expectedVersion,
      currentVersion,
      recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
    },
  );
