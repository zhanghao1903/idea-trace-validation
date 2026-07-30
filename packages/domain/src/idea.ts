import { DomainError } from "./errors.js";
import type {
  CurrentStatement,
  IdeaIntakeStatus,
  IdeaState,
  OpenQuestion,
} from "./types.js";

export const calculateIntakeStatus = (
  desiredOutcome: string | null,
  statements: readonly CurrentStatement[],
  openQuestions: readonly OpenQuestion[],
): IdeaIntakeStatus => {
  const hasHypothesis = statements.some(
    (statement) => statement.kind === "HYPOTHESIS",
  );
  return desiredOutcome !== null && hasHypothesis && openQuestions.length === 0
    ? "IDEA"
    : "NEEDS_CLARIFICATION";
};

export const assertMutableIdea = (idea: IdeaState): void => {
  if (idea.projectId !== null) {
    throw new DomainError(
      "IDEA_ALREADY_PROMOTED",
      "A promoted Idea is read-only in LP-01.",
      {
        ideaId: idea.id,
        projectId: idea.projectId,
        recovery: "READ_ONLY_IN_LP01",
      },
    );
  }
};

export const assertExpectedVersion = (
  idea: IdeaState,
  expectedVersion: number,
): void => {
  if (idea.version !== expectedVersion) {
    throw new DomainError(
      "VERSION_CONFLICT",
      "Idea changed since the supplied version.",
      {
        resourceId: idea.id,
        expectedVersion,
        currentVersion: idea.version,
        recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
      },
    );
  }
};
