export type DomainErrorCode =
  | "IDEA_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "ALREADY_PROMOTED"
  | "IDEA_ALREADY_PROMOTED"
  | "PROMOTION_PRECONDITION_FAILED"
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
    "Idea changed since the supplied version.",
    {
      resourceId,
      expectedVersion,
      currentVersion,
      recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
    },
  );
