import {
  AttentionCreateRouteSchema,
  AttentionCollectionRouteSchema,
  AttentionEventRequestSchema,
  ConfirmationCreateRouteSchema,
  ConfirmationDecisionRouteSchema,
  ConfirmationGetRouteSchema,
  ConfirmationPayloadSummarySchema,
  CreateConclusionRequestSchema,
  CreateEvidenceRequestSchema,
  CreateProgressUpdateRequestSchema,
  ProjectTransitionRouteSchema,
} from "../src/index.js";
import Schema from "typebox/schema";
import { describe, expect, it } from "vitest";

const actor = {
  actorType: "AI",
  role: "EXECUTOR",
  displayName: "Codex",
};
const projectId = "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const evidenceId = "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const conclusionId = "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const confirmationId = "confirm_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const transitionId = "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const common = {
  schemaVersion: 1,
  projectId,
  projectVersion: 8,
  projectStatus: "IN_PROGRESS",
  projectPhase: "VALIDATING",
};
const conclusion = {
  id: conclusionId,
  sequence: 1,
  statusAtRequest: "DRAFT",
  evidenceSummary: "The planned signal was observed",
  evidenceIds: [evidenceId],
  limitations: ["Bounded sample"],
  uncertainties: ["Long-term behavior"],
  recommendation: "CONTINUE",
  recommendationNote: "Continue",
  supplementalNote: null,
};

describe("LP-02 API contracts", () => {
  it("accepts the flattened attention collection cursor and filters", () => {
    const query = Schema.Compile(AttentionCollectionRouteSchema.querystring);
    expect(
      query.Check({
        limit: 20,
        cursor: "opaque-cursor",
        type: "BLOCKER",
        status: "OPEN",
      }),
    ).toBe(true);
    expect(query.Check({ type: "UNKNOWN" })).toBe(false);
    expect(query.Check({ view: "executor" })).toBe(false);
    expect(query.Check({ unexpected: "field" })).toBe(false);
  });

  it("enforces unambiguous Attention resolve and correction payloads", () => {
    const check = Schema.Compile(AttentionEventRequestSchema);
    const command = {
      expectedVersion: 8,
      actor,
      reason: "Record the response",
    };

    expect(
      check.Check({
        ...command,
        kind: "RESOLVE",
        message: "Select the recommended path",
        selectedOption: "Option A",
      }),
    ).toBe(true);
    expect(
      check.Check({
        ...command,
        kind: "RESOLVE",
        message: "Ambiguous decision",
        selectedOption: "Option A",
        decisionText: "Option B",
      }),
    ).toBe(false);
    expect(
      check.Check({
        ...command,
        kind: "CORRECT_RESPONSE",
        correctsEventId: "atnevt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        correctedKind: "COMMENT",
        replacement: {
          message: "Corrected comment",
          resolution: "Must not be accepted",
        },
      }),
    ).toBe(false);
    expect(
      check.Check({
        ...command,
        kind: "CORRECT_RESPONSE",
        correctsEventId: "atnevt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        correctedKind: "RESOLVE",
        replacement: {
          message: "Corrected support response",
          supportSummary: "Support supplied",
        },
      }),
    ).toBe(true);
  });

  it("declares exact write security and bounded idempotency keys", () => {
    expect(ProjectTransitionRouteSchema.security).toEqual([{ aiWrite: [] }]);
    expect(AttentionCreateRouteSchema.security).toEqual([{ aiWrite: [] }]);
    expect(ConfirmationCreateRouteSchema.security).toEqual([
      { humanControl: [] },
    ]);
    expect(ConfirmationDecisionRouteSchema.security).toEqual([
      { confirmationCapability: [] },
    ]);
    expect(ConfirmationGetRouteSchema.security).toEqual([
      { humanControl: [] },
      { confirmationCapability: [] },
    ]);

    const headers = Schema.Compile(ProjectTransitionRouteSchema.headers);
    expect(headers.Check({ "idempotency-key": "lp02-request-1" })).toBe(true);
    expect(headers.Check({ "idempotency-key": "" })).toBe(false);
    expect(headers.Check({ "idempotency-key": "contains a space" })).toBe(
      false,
    );
    expect(headers.Check({ "idempotency-key": "a".repeat(129) })).toBe(false);
  });

  it("accepts flattened strict Evidence, progress and conclusion requests", () => {
    expect(
      Schema.Compile(CreateEvidenceRequestSchema).Check({
        expectedVersion: 2,
        kind: "LINK",
        title: "Evidence",
        summary: "Summary",
        locator: "https://example.test/evidence",
        capturedAt: "2026-07-31T04:00:00.000Z",
        actor,
        reason: "Record evidence",
      }),
    ).toBe(true);
    expect(
      Schema.Compile(CreateProgressUpdateRequestSchema).Check({
        expectedVersion: 3,
        summary: "Progress",
        completedWork: ["One task"],
        nextStep: "Next task",
        evidenceIds: [evidenceId],
        occurredAt: "2026-07-31T04:05:00.000Z",
        actor,
        reason: "Record progress",
      }),
    ).toBe(true);
    expect(
      Schema.Compile(CreateConclusionRequestSchema).Check({
        expectedVersion: 4,
        evidenceSummary: "Evidence summary",
        evidenceIds: [evidenceId],
        limitations: ["One limitation"],
        uncertainties: ["One uncertainty"],
        recommendation: "CONTINUE",
        recommendationNote: "Continue",
        actor,
        reason: "Record conclusion",
      }),
    ).toBe(true);
  });

  it("accepts exactly the five closed confirmation payload variants", () => {
    const check = Schema.Compile(ConfirmationPayloadSummarySchema);
    const variants = [
      {
        ...common,
        operation: "CONFIRM_CONCLUSION",
        conclusion,
        targetConclusionStatus: "CONFIRMED",
      },
      ...(["COMPLETE", "STOP", "TRANSFER"] as const).map((kind) => ({
        ...common,
        operation: `${kind}_PROJECT`,
        conclusion: {
          ...conclusion,
          recommendation:
            kind === "STOP"
              ? "STOP"
              : kind === "TRANSFER"
                ? "TRANSFER"
                : "CONTINUE",
        },
        targetConclusionStatus: "CONFIRMED",
        completionSummary: `${kind} the project`,
        targetProjectStatus: "COMPLETED",
        completionKind: kind,
      })),
      {
        ...common,
        projectStatus: "COMPLETED",
        operation: "REOPEN_PROJECT",
        terminalTransition: {
          id: transitionId,
          kind: "COMPLETE",
          conclusionId,
          confirmationId,
          resultingProjectVersion: 9,
          recordedAt: "2026-07-31T04:10:00.000Z",
        },
        completedAt: "2026-07-31T04:10:00.000Z",
        reopenReason: "Observe another signal",
        nextStep: "Run the next observation",
        targetProjectStatus: "IN_PROGRESS",
        targetProjectPhase: "VALIDATING",
      },
    ];
    expect(variants).toHaveLength(5);
    for (const variant of variants) expect(check.Check(variant)).toBe(true);
    expect(
      check.Check({
        ...variants[0],
        completionSummary: null,
        targetProjectStatus: null,
      }),
    ).toBe(false);
  });
});
