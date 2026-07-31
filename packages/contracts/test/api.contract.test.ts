import {
  CreateIdeaRequestSchema,
  ERROR_ENVELOPE_EXAMPLES,
  ErrorEnvelopeSchema,
} from "../src/index.js";
import Schema from "typebox/schema";
import { describe, expect, it } from "vitest";

describe("LP-01 API contracts", () => {
  const create = Schema.Compile(CreateIdeaRequestSchema);
  const error = Schema.Compile(ErrorEnvelopeSchema);

  it("accepts a legal create request", () => {
    expect(
      create.Check({
        intentSummary: "Validate evidence traceability",
        proposer: {
          actorType: "HUMAN",
          role: "PROPOSER",
          displayName: "Founder",
        },
        facts: [],
        hypotheses: [{ text: "Teams lose decision context" }],
        clarificationQuestions: [],
        actor: {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "Codex",
          client: "codex",
          onBehalfOfRole: "PROPOSER",
        },
        reason: "Record the idea",
      }),
    ).toBe(true);
  });

  it("rejects delegated proposer authority and unknown fields", () => {
    expect(
      create.Check({
        intentSummary: "Validate evidence traceability",
        proposer: {
          actorType: "AI",
          role: "PROPOSER",
          displayName: "Founder agent",
          onBehalfOfRole: "PROPOSER",
        },
        facts: [],
        hypotheses: [],
        clarificationQuestions: [],
        actor: {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: "Codex",
        },
        reason: "Record the idea",
      }),
    ).toBe(false);
  });

  it("keeps error documentation examples synchronized with TypeBox", () => {
    expect(error.Check(ERROR_ENVELOPE_EXAMPLES.versionConflict)).toBe(true);
  });
});
