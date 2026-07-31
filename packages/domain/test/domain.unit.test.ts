import { describe, expect, it } from "vitest";

import {
  DomainError,
  assertAnswerMatchesQuestion,
  assertDistinctTrimmedValues,
  assertPromotionAllowed,
  calculateIntakeStatus,
} from "../src/index.js";

describe("LP-01 domain policies", () => {
  it("keeps completeness separate from promotion", () => {
    expect(
      calculateIntakeStatus(
        "Learn whether founders need evidence traceability",
        [{ id: "stmt_1", kind: "HYPOTHESIS", text: "Founders lose context" }],
        [],
      ),
    ).toBe("IDEA");
  });

  it("requires explicit proposer intent to promote", () => {
    expect(() =>
      assertPromotionAllowed(
        {
          id: "idea_1",
          desiredOutcome: "Validate the need",
          intakeStatus: "IDEA",
          version: 1,
          projectId: null,
        },
        [{ id: "stmt_1", kind: "HYPOTHESIS", text: "There is demand" }],
        "PROMOTE",
        {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "automation",
          client: "test",
          onBehalfOfRole: null,
        },
      ),
    ).toThrowError(DomainError);
  });

  it("requires explicit structured facts for a fact question", () => {
    expect(() =>
      assertAnswerMatchesQuestion("FACT", null, {
        answerText: "It is in the free text.",
        newFacts: [],
        newHypotheses: [],
      }),
    ).toThrowError(DomainError);
  });

  it("rejects duplicates after trimming", () => {
    expect(() =>
      assertDistinctTrimmedValues("/facts", ["alpha", " alpha "]),
    ).toThrowError(DomainError);
  });
});
