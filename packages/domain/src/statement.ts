import { DomainError } from "./errors.js";

export const assertDistinctTrimmedValues = (
  field: string,
  values: readonly string[],
): void => {
  const normalized = values.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Duplicate values are not allowed.",
      {
        issues: [
          {
            path: field,
            keyword: "uniqueTrimmedValues",
            message: "must not contain duplicates after trimming",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
};
