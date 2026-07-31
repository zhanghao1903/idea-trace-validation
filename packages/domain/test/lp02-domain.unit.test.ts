import { describe, expect, it } from "vitest";

import {
  DomainError,
  applyExecutionTransition,
  assertEvidenceLocator,
  assertRecommendationMatchesOperation,
  nextAttentionStatus,
} from "../src/index.js";

describe("LP-02 domain policies", () => {
  it("enforces the project status and phase transition matrix", () => {
    expect(
      applyExecutionTransition(
        { id: "proj_test", status: "QUEUED", phase: "PLANNING", version: 1 },
        { transition: "START", nextStep: "Run the first experiment" },
      ),
    ).toMatchObject({
      status: "IN_PROGRESS",
      phase: "PLANNING",
      nextStep: "Run the first experiment",
    });
    expect(() =>
      applyExecutionTransition(
        {
          id: "proj_test",
          status: "QUEUED",
          phase: "PLANNING",
          version: 1,
        },
        { transition: "RESUME", explanation: "Resume", nextStep: "Continue" },
      ),
    ).toThrowError(DomainError);
    expect(() =>
      applyExecutionTransition(
        {
          id: "proj_test",
          status: "IN_PROGRESS",
          phase: "BUILDING",
          version: 3,
        },
        {
          transition: "CHANGE_PHASE",
          targetPhase: "BUILDING",
          nextStep: "No-op",
        },
      ),
    ).toThrowError(DomainError);
  });

  it("enforces every attention state transition without rewriting corrections", () => {
    expect(nextAttentionStatus("attn_test", "OPEN", "REQUEST_INFO")).toBe(
      "NEEDS_INFO",
    );
    expect(nextAttentionStatus("attn_test", "NEEDS_INFO", "PROVIDE_INFO")).toBe(
      "OPEN",
    );
    expect(nextAttentionStatus("attn_test", "OPEN", "RESOLVE")).toBe(
      "RESOLVED",
    );
    expect(nextAttentionStatus("attn_test", "RESOLVED", "CLOSE")).toBe(
      "CLOSED",
    );
    expect(nextAttentionStatus("attn_test", "CLOSED", "CORRECT_RESPONSE")).toBe(
      "CLOSED",
    );
    expect(() =>
      nextAttentionStatus("attn_test", "CLOSED", "RESOLVE"),
    ).toThrowError(DomainError);
  });

  it("matches terminal operations to conclusion recommendations", () => {
    expect(() =>
      assertRecommendationMatchesOperation("STOP_PROJECT", "CONTINUE"),
    ).toThrowError(DomainError);
    expect(() =>
      assertRecommendationMatchesOperation("TRANSFER_PROJECT", "STOP"),
    ).toThrowError(DomainError);
    expect(() =>
      assertRecommendationMatchesOperation("COMPLETE_PROJECT", "ADJUST"),
    ).not.toThrow();
    expect(() =>
      assertRecommendationMatchesOperation("STOP_PROJECT", "STOP"),
    ).not.toThrow();
  });

  it("accepts only safe HTTPS links and controlled artifact IDs", () => {
    expect(() =>
      assertEvidenceLocator("LINK", "https://example.test/evidence"),
    ).not.toThrow();
    expect(() =>
      assertEvidenceLocator("LINK", "https://user@example.test/evidence"),
    ).toThrowError(DomainError);
    expect(() =>
      assertEvidenceLocator("LINK", "http://example.test/evidence"),
    ).toThrowError(DomainError);
    expect(() =>
      assertEvidenceLocator("ARTIFACT", "artifact_01ARZ3NDEKTSV4RRFFQ69G5FAV"),
    ).not.toThrow();
  });
});
