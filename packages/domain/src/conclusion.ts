import { DomainError } from "./errors.js";

export type Recommendation = "CONTINUE" | "ADJUST" | "STOP" | "TRANSFER";
export type ConfirmationOperation =
  | "CONFIRM_CONCLUSION"
  | "COMPLETE_PROJECT"
  | "STOP_PROJECT"
  | "TRANSFER_PROJECT"
  | "REOPEN_PROJECT";

export const assertRecommendationMatchesOperation = (
  operation: ConfirmationOperation,
  recommendation: Recommendation | null,
): void => {
  const allowed: Record<ConfirmationOperation, Recommendation[]> = {
    CONFIRM_CONCLUSION: ["CONTINUE", "ADJUST", "STOP", "TRANSFER"],
    COMPLETE_PROJECT: ["CONTINUE", "ADJUST"],
    STOP_PROJECT: ["STOP"],
    TRANSFER_PROJECT: ["TRANSFER"],
    REOPEN_PROJECT: ["CONTINUE", "ADJUST", "STOP", "TRANSFER"],
  };
  if (recommendation !== null && !allowed[operation].includes(recommendation)) {
    throw new DomainError(
      "RECOMMENDATION_MISMATCH",
      "The conclusion recommendation does not permit this operation.",
      {
        operation,
        recommendation,
        allowedRecommendations: allowed[operation],
        recovery: "REVISE_OPERATION_OR_CONCLUSION",
      },
    );
  }
};
