import { DomainError } from "../errors.js";
import type { CurrentStatement, DeclaredActor, IdeaState } from "../types.js";

export const assertPromotionAllowed = (
  idea: IdeaState,
  statements: readonly CurrentStatement[],
  explicitIntent: string,
  actor: DeclaredActor,
): void => {
  if (idea.projectId !== null) {
    throw new DomainError(
      "ALREADY_PROMOTED",
      "This Idea already has a validation project.",
      {
        ideaId: idea.id,
        projectId: idea.projectId,
        recovery: "READ_EXISTING_PROJECT",
      },
    );
  }

  const missing: string[] = [];
  if (idea.desiredOutcome === null) missing.push("DESIRED_OUTCOME");
  if (!statements.some((statement) => statement.kind === "HYPOTHESIS")) {
    missing.push("HYPOTHESIS");
  }
  if (explicitIntent !== "PROMOTE") missing.push("EXPLICIT_INTENT");
  const proposerIntent =
    (actor.actorType === "HUMAN" && actor.role === "PROPOSER") ||
    (actor.actorType === "AI" && actor.onBehalfOfRole === "PROPOSER");
  if (!proposerIntent) missing.push("PROPOSER_INTENT");

  if (missing.length > 0) {
    throw new DomainError(
      "PROMOTION_PRECONDITION_FAILED",
      "The Idea does not satisfy the explicit promotion preconditions.",
      {
        missing,
        recovery: "CLARIFY_AND_RETRY_WITH_NEW_KEY",
      },
    );
  }
};
