import { DomainError } from "./errors.js";
import type { ClarificationTarget } from "./types.js";

export interface AnswerShape {
  answerText: string;
  desiredOutcomeRevision?: string;
  newFacts: readonly { text: string; supersedesStatementId?: string }[];
  newHypotheses: readonly { text: string; supersedesStatementId?: string }[];
  supersedesAnswerId?: string;
}

export const assertAnswerMatchesQuestion = (
  target: ClarificationTarget,
  currentAnswerId: string | null,
  answer: AnswerShape,
): void => {
  if (
    currentAnswerId !== null &&
    answer.supersedesAnswerId !== currentAnswerId
  ) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "A correction must supersede the current answer.",
      {
        issues: [
          {
            path: "/supersedesAnswerId",
            keyword: "currentAnswer",
            message: "must equal the question current answer id",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
  if (currentAnswerId === null && answer.supersedesAnswerId !== undefined) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "A first answer cannot supersede an answer.",
      {
        issues: [
          {
            path: "/supersedesAnswerId",
            keyword: "absent",
            message: "must be omitted for a first answer",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
  if (
    target === "DESIRED_OUTCOME" &&
    answer.desiredOutcomeRevision === undefined
  ) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "A desired-outcome question requires an explicit outcome revision.",
      {
        issues: [
          {
            path: "/desiredOutcomeRevision",
            keyword: "required",
            message: "is required for DESIRED_OUTCOME",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
  if (target === "FACT" && answer.newFacts.length === 0) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "A fact question requires an explicit fact.",
      {
        issues: [
          {
            path: "/newFacts",
            keyword: "minItems",
            message: "must contain at least one fact",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
  if (target === "HYPOTHESIS" && answer.newHypotheses.length === 0) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "A hypothesis question requires an explicit hypothesis.",
      {
        issues: [
          {
            path: "/newHypotheses",
            keyword: "minItems",
            message: "must contain at least one hypothesis",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
};
