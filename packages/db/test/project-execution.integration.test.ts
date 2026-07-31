import { createIdFactory, requestDigest } from "@idea/application";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPool,
  migrate,
  PostgresIdeaService,
  PostgresProjectExecutionService,
} from "../src/index.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const humanControlToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
const ideaService = new PostgresIdeaService(pool);
const executionService = new PostgresProjectExecutionService(
  pool,
  humanControlToken,
);
const ids = createIdFactory();

const aiActor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "Codex",
  client: "lp02-integration",
};
const humanActor = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

const commandContext = (
  key: string,
  route: string,
  params: Readonly<Record<string, unknown>>,
  body: unknown,
) => ({
  idempotencyKey: key,
  requestId: ids.request(),
  requestDigest: requestDigest("POST", route, params, body),
});

const reset = async (): Promise<void> => {
  await pool.query(`
    TRUNCATE TABLE
      audit_events,
      project_hypotheses,
      validation_projects,
      clarification_answers,
      clarification_questions,
      idea_statements,
      idempotency_records,
      ideas
    CASCADE
  `);
};

const createProject = async (suffix = "default"): Promise<string> => {
  const create = {
    intentSummary: "Validate the LP-02 execution and decision loop",
    proposer: humanActor,
    desiredOutcome: "Reach a traceable evidence-backed decision",
    facts: [{ text: "LP-01 has created the project authority" }],
    hypotheses: [{ text: "A bounded execution loop improves decisions" }],
    clarificationQuestions: [],
    actor: aiActor,
    reason: "Create an execution-ready Idea",
  };
  const created = await ideaService.createIdea(
    create,
    commandContext(`lp02-create-${suffix}`, "/api/v1/ideas", {}, create),
  );
  if (!created.ok) throw new Error("LP02_CREATE_FAILED");
  const promotion = {
    expectedVersion: created.data.idea.version,
    explicitIntent: "PROMOTE" as const,
    actor: humanActor,
    reason: "Begin the validation project",
  };
  const promoted = await ideaService.promoteIdea(
    created.data.idea.id,
    promotion,
    commandContext(
      `lp02-promote-${suffix}`,
      "/api/v1/ideas/:ideaId/promotions",
      { ideaId: created.data.idea.id },
      promotion,
    ),
  );
  if (!promoted.ok) throw new Error("LP02_PROMOTION_FAILED");
  return promoted.data.project.authority.id;
};

const prepareConclusion = async (
  suffix: string,
  recommendation: "CONTINUE" | "ADJUST" | "STOP" | "TRANSFER",
): Promise<{ projectId: string; conclusionId: string }> => {
  const projectId = await createProject(suffix);
  const start = {
    expectedVersion: 1,
    transition: "START" as const,
    nextStep: "Collect a conclusion signal",
    actor: aiActor,
    reason: "Start the matrix project",
  };
  const started = await executionService.transitionProject(
    projectId,
    start,
    commandContext(
      `lp02-matrix-start-${suffix}`,
      "/api/v1/projects/:projectId/transitions",
      { projectId },
      start,
    ),
  );
  if (!started.ok) throw new Error("LP02_MATRIX_START_FAILED");
  const evidence = {
    expectedVersion: 2,
    kind: "NOTE" as const,
    title: "Matrix evidence",
    summary: `Evidence for ${recommendation}`,
    capturedAt: "2026-07-31T05:00:00.000Z",
    actor: aiActor,
    reason: "Record matrix evidence",
  };
  const recorded = await executionService.createEvidence(
    projectId,
    evidence,
    commandContext(
      `lp02-matrix-evidence-${suffix}`,
      "/api/v1/projects/:projectId/evidence",
      { projectId },
      evidence,
    ),
  );
  if (!recorded.ok) throw new Error("LP02_MATRIX_EVIDENCE_FAILED");
  const conclusion = {
    expectedVersion: 3,
    evidenceSummary: `The evidence supports ${recommendation}`,
    evidenceIds: [recorded.data.evidence.id],
    limitations: ["Bounded matrix fixture"],
    uncertainties: ["Future evidence may differ"],
    recommendation,
    recommendationNote: `Recommend ${recommendation}`,
    actor: aiActor,
    reason: "Record the matrix conclusion",
  };
  const concluded = await executionService.createConclusion(
    projectId,
    conclusion,
    commandContext(
      `lp02-matrix-conclusion-${suffix}`,
      "/api/v1/projects/:projectId/conclusions",
      { projectId },
      conclusion,
    ),
  );
  if (!concluded.ok) throw new Error("LP02_MATRIX_CONCLUSION_FAILED");
  return { projectId, conclusionId: concluded.data.conclusion.id };
};

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(reset);
afterAll(async () => {
  await pool.end();
});

describe("LP-02 project execution authority", () => {
  it("runs an evidence-backed decision to completion and reopens without rewriting history", async () => {
    const projectId = await createProject();

    const start = {
      expectedVersion: 1,
      transition: "START" as const,
      nextStep: "Collect one objective signal",
      actor: aiActor,
      reason: "Start execution",
    };
    const started = await executionService.transitionProject(
      projectId,
      start,
      commandContext(
        "lp02-start",
        "/api/v1/projects/:projectId/transitions",
        { projectId },
        start,
      ),
    );
    expect(started).toMatchObject({
      ok: true,
      data: {
        project: { status: "IN_PROGRESS", version: 2 },
        transition: { kind: "START", resultingProjectVersion: 2 },
      },
    });

    const evidence = {
      expectedVersion: 2,
      kind: "METRIC" as const,
      title: "Interview completion",
      summary: "Five of five target interviews completed",
      metricName: "completed_interviews",
      metricValue: "5",
      metricUnit: "interviews",
      capturedAt: "2026-07-31T01:00:00.000Z",
      actor: aiActor,
      reason: "Record the objective execution signal",
    };
    const recorded = await executionService.createEvidence(
      projectId,
      evidence,
      commandContext(
        "lp02-evidence",
        "/api/v1/projects/:projectId/evidence",
        { projectId },
        evidence,
      ),
    );
    if (!recorded.ok) throw new Error("LP02_EVIDENCE_FAILED");
    expect(recorded.data.project.version).toBe(3);

    const progress = {
      expectedVersion: 3,
      summary: "Interview round complete",
      completedWork: ["Interviewed all five target users"],
      nextStep: "Evaluate the decision threshold",
      evidenceIds: [recorded.data.evidence.id],
      occurredAt: "2026-07-31T01:05:00.000Z",
      actor: aiActor,
      reason: "Report evidence-backed progress",
    };
    const progressed = await executionService.createProgressUpdate(
      projectId,
      progress,
      commandContext(
        "lp02-progress",
        "/api/v1/projects/:projectId/progress-updates",
        { projectId },
        progress,
      ),
    );
    expect(progressed).toMatchObject({
      ok: true,
      data: {
        project: {
          version: 4,
          currentNextStep: "Evaluate the decision threshold",
        },
        progressUpdate: {
          evidenceIds: [recorded.data.evidence.id],
          resultingProjectVersion: 4,
        },
      },
    });

    const attention = {
      expectedVersion: 4,
      type: "DECISION_REQUEST" as const,
      title: "Choose the decision threshold",
      background: "All planned interviews are complete",
      decisionImpact: "The threshold determines whether validation concludes",
      waitingForRole: "PROPOSER" as const,
      options: ["Proceed", "Collect more data"],
      recommendation: "Proceed",
      actor: aiActor,
      reason: "Request a bounded proposer decision",
    };
    const opened = await executionService.createAttentionItem(
      projectId,
      attention,
      commandContext(
        "lp02-attention",
        "/api/v1/projects/:projectId/attention-items",
        { projectId },
        attention,
      ),
    );
    if (!opened.ok) throw new Error("LP02_ATTENTION_FAILED");
    const resolve = {
      expectedVersion: 5,
      kind: "RESOLVE" as const,
      message: "Use the planned threshold",
      selectedOption: "Proceed",
      actor: humanActor,
      reason: "Resolve the decision request",
    };
    const resolved = await executionService.appendAttentionEvent(
      projectId,
      opened.data.attentionItem.id,
      resolve,
      commandContext(
        "lp02-attention-resolve",
        "/api/v1/projects/:projectId/attention-items/:itemId/events",
        { projectId, itemId: opened.data.attentionItem.id },
        resolve,
      ),
    );
    expect(resolved).toMatchObject({
      ok: true,
      data: {
        project: { version: 6 },
        attentionItem: { status: "RESOLVED" },
        event: { kind: "RESOLVE", selectedOption: "Proceed" },
      },
    });

    const conclusion = {
      expectedVersion: 6,
      evidenceSummary: "The complete interview round met the planned signal",
      evidenceIds: [recorded.data.evidence.id],
      limitations: ["The sample is intentionally small"],
      uncertainties: ["Retention behavior is not yet observed"],
      recommendation: "CONTINUE" as const,
      recommendationNote: "Continue into the next planned product slice",
      actor: aiActor,
      reason: "Record the evidence-backed conclusion",
    };
    const concluded = await executionService.createConclusion(
      projectId,
      conclusion,
      commandContext(
        "lp02-conclusion",
        "/api/v1/projects/:projectId/conclusions",
        { projectId },
        conclusion,
      ),
    );
    if (!concluded.ok) throw new Error("LP02_CONCLUSION_FAILED");
    expect(concluded.data.conclusion.status).toBe("DRAFT");

    const complete = {
      expectedVersion: 7,
      operation: "COMPLETE_PROJECT" as const,
      conclusionId: concluded.data.conclusion.id,
      completionSummary: "The validation objective was completed",
      actor: humanActor,
      reason: "Create the exact completion opportunity",
    };
    const confirmation = await executionService.createConfirmation(
      projectId,
      complete,
      commandContext(
        "lp02-complete-confirmation",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId },
        complete,
      ),
    );
    if (!confirmation.ok) throw new Error("LP02_CONFIRMATION_FAILED");
    expect(confirmation.data.confirmation).toMatchObject({
      operation: "COMPLETE_PROJECT",
      expectedProjectVersion: 8,
      decision: "PENDING",
      usability: "ACTIVE",
      payloadSummary: {
        operation: "COMPLETE_PROJECT",
        projectVersion: 8,
        conclusion: { statusAtRequest: "DRAFT" },
        completionKind: "COMPLETE",
      },
    });
    expect(
      Object.keys(confirmation.data.confirmation.payloadSummary).sort(),
    ).toEqual([
      "completionKind",
      "completionSummary",
      "conclusion",
      "operation",
      "projectId",
      "projectPhase",
      "projectStatus",
      "projectVersion",
      "schemaVersion",
      "targetConclusionStatus",
      "targetProjectStatus",
    ]);

    const decision = {
      expectedVersion: 8,
      decision: "APPROVE" as const,
      decisionNote: "The evidence supports completing this validation",
      actor: humanActor,
      reason: "Approve the bound completion operation",
    };
    const completed = await executionService.decideConfirmation(
      confirmation.data.confirmation.id,
      confirmation.capability,
      decision,
      commandContext(
        "lp02-complete-decision",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: confirmation.data.confirmation.id },
        decision,
      ),
    );
    if (!completed.ok) throw new Error("LP02_DECISION_FAILED");
    expect(completed.data).toMatchObject({
      project: {
        status: "COMPLETED",
        version: 9,
        completionKind: "COMPLETE",
      },
      confirmation: { decision: "APPROVED", usability: "CONSUMED" },
      conclusion: { status: "CONFIRMED" },
      transition: { kind: "COMPLETE", resultingProjectVersion: 9 },
    });
    const terminalTransitionId = completed.data.transition?.id;
    if (terminalTransitionId === undefined) {
      throw new Error("LP02_TERMINAL_TRANSITION_MISSING");
    }

    const consumedWithNewKey = await executionService.decideConfirmation(
      confirmation.data.confirmation.id,
      confirmation.capability,
      decision,
      commandContext(
        "lp02-complete-decision-new-key",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: confirmation.data.confirmation.id },
        decision,
      ),
    );
    expect(consumedWithNewKey).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "CONFIRMATION_ALREADY_DECIDED" },
    });

    const reopen = {
      expectedVersion: 9,
      operation: "REOPEN_PROJECT" as const,
      terminalTransitionId,
      reopenReason: "A follow-up signal requires another execution pass",
      nextStep: "Collect the follow-up signal",
      actor: humanActor,
      reason: "Create the exact reopen opportunity",
    };
    const reopenConfirmation = await executionService.createConfirmation(
      projectId,
      reopen,
      commandContext(
        "lp02-reopen-confirmation",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId },
        reopen,
      ),
    );
    if (!reopenConfirmation.ok) {
      throw new Error("LP02_REOPEN_CONFIRMATION_FAILED");
    }
    const reopenDecision = {
      expectedVersion: 10,
      decision: "APPROVE" as const,
      decisionNote: "Reopen while preserving the terminal history",
      actor: humanActor,
      reason: "Approve the bound reopen operation",
    };
    const reopened = await executionService.decideConfirmation(
      reopenConfirmation.data.confirmation.id,
      reopenConfirmation.capability,
      reopenDecision,
      commandContext(
        "lp02-reopen-decision",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: reopenConfirmation.data.confirmation.id },
        reopenDecision,
      ),
    );
    expect(reopened).toMatchObject({
      ok: true,
      data: {
        project: {
          status: "IN_PROGRESS",
          version: 11,
          completedAt: null,
          completionKind: null,
          currentNextStep: "Collect the follow-up signal",
        },
        transition: {
          kind: "REOPEN",
          relatedTransitionId: terminalTransitionId,
        },
      },
    });

    const history = await pool.query<{
      kind: string;
      conclusion_id: string | null;
      confirmation_id: string | null;
    }>(
      `
        SELECT kind,conclusion_id,confirmation_id
        FROM project_transitions
        WHERE project_id=$1 ORDER BY resulting_project_version
      `,
      [projectId],
    );
    expect(history.rows.map((row) => row.kind)).toEqual([
      "START",
      "COMPLETE",
      "REOPEN",
    ]);
    expect(history.rows[1]).toMatchObject({
      conclusion_id: concluded.data.conclusion.id,
      confirmation_id: confirmation.data.confirmation.id,
    });
    expect(await executionService.listConclusions(projectId, 20)).toMatchObject(
      {
        items: [{ id: concluded.data.conclusion.id, status: "CONFIRMED" }],
      },
    );
    expect(
      await executionService.listAttentionItems(projectId, 20),
    ).toMatchObject({
      items: [
        {
          item: {
            id: opened.data.attentionItem.id,
            status: "RESOLVED",
          },
          eventHistory: [
            {
              original: { kind: "RESOLVE", selectedOption: "Proceed" },
              corrections: [],
              effectiveResponse: { selectedOption: "Proceed" },
              stateEffect: { fromStatus: "OPEN", toStatus: "RESOLVED" },
            },
          ],
        },
      ],
    });
    const projectHistory = await executionService.listProjectHistory(
      projectId,
      100,
    );
    expect(
      projectHistory.items.filter((item) => item.kind === "TRANSITION"),
    ).toHaveLength(3);
    expect(
      projectHistory.items.filter((item) => item.kind === "AUDIT"),
    ).toHaveLength(10);

    const proposer = await ideaService.getProject(projectId, "proposer");
    const executor = await ideaService.getProject(projectId, "executor");
    expect(proposer?.authority).toEqual(executor?.authority);
    expect(proposer?.execution).toMatchObject({
      latestProgress: {
        id: progressed.ok ? progressed.data.progressUpdate.id : "",
      },
      openAttentionCount: 0,
      openAttentionPreview: [],
      evidenceCount: 1,
      latestConclusion: {
        id: concluded.data.conclusion.id,
        status: "CONFIRMED",
      },
    });
    expect(proposer?.focus).toMatchObject({
      view: "proposer",
      projectOutcome: {
        latestProgressSummary: "Interview round complete",
        openAttentionCount: 0,
        latestRecommendation: "CONTINUE",
      },
    });
    expect(executor?.focus).toMatchObject({
      view: "executor",
      execution: {
        openAttentionCount: 0,
        evidenceCount: 1,
        latestConclusionId: concluded.data.conclusion.id,
      },
    });
  });

  it("invalidates a pending confirmation after any successful project mutation", async () => {
    const projectId = await createProject();
    const start = {
      expectedVersion: 1,
      transition: "START" as const,
      nextStep: "Collect a decision signal",
      actor: aiActor,
      reason: "Start execution",
    };
    await executionService.transitionProject(
      projectId,
      start,
      commandContext(
        "lp02-stale-start",
        "/api/v1/projects/:projectId/transitions",
        { projectId },
        start,
      ),
    );
    const evidence = {
      expectedVersion: 2,
      kind: "NOTE" as const,
      title: "Decision evidence",
      summary: "The signal is sufficient for a draft conclusion",
      capturedAt: "2026-07-31T02:00:00.000Z",
      actor: aiActor,
      reason: "Record the signal",
    };
    const recorded = await executionService.createEvidence(
      projectId,
      evidence,
      commandContext(
        "lp02-stale-evidence",
        "/api/v1/projects/:projectId/evidence",
        { projectId },
        evidence,
      ),
    );
    if (!recorded.ok) throw new Error("LP02_STALE_EVIDENCE_FAILED");
    const conclusion = {
      expectedVersion: 3,
      evidenceSummary: "The signal supports continuing",
      evidenceIds: [recorded.data.evidence.id],
      limitations: ["One bounded signal"],
      uncertainties: ["Future demand may change"],
      recommendation: "CONTINUE" as const,
      recommendationNote: "Continue",
      actor: aiActor,
      reason: "Record a draft conclusion",
    };
    const concluded = await executionService.createConclusion(
      projectId,
      conclusion,
      commandContext(
        "lp02-stale-conclusion",
        "/api/v1/projects/:projectId/conclusions",
        { projectId },
        conclusion,
      ),
    );
    if (!concluded.ok) throw new Error("LP02_STALE_CONCLUSION_FAILED");
    const request = {
      expectedVersion: 4,
      operation: "CONFIRM_CONCLUSION" as const,
      conclusionId: concluded.data.conclusion.id,
      actor: humanActor,
      reason: "Request confirmation",
    };
    const pending = await executionService.createConfirmation(
      projectId,
      request,
      commandContext(
        "lp02-stale-confirmation",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId },
        request,
      ),
    );
    if (!pending.ok) throw new Error("LP02_STALE_CONFIRMATION_FAILED");

    const progress = {
      expectedVersion: 5,
      summary: "A new signal arrived",
      completedWork: ["Captured the new signal"],
      nextStep: "Re-evaluate the conclusion",
      evidenceIds: [recorded.data.evidence.id],
      occurredAt: "2026-07-31T02:05:00.000Z",
      actor: aiActor,
      reason: "Mutate project authority after confirmation creation",
    };
    await executionService.createProgressUpdate(
      projectId,
      progress,
      commandContext(
        "lp02-stale-progress",
        "/api/v1/projects/:projectId/progress-updates",
        { projectId },
        progress,
      ),
    );

    const decision = {
      expectedVersion: 5,
      decision: "APPROVE" as const,
      decisionNote: "Attempt stale approval",
      actor: humanActor,
      reason: "Attempt to approve an obsolete opportunity",
    };
    const stale = await executionService.decideConfirmation(
      pending.data.confirmation.id,
      pending.capability,
      decision,
      commandContext(
        "lp02-stale-decision",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: pending.data.confirmation.id },
        decision,
      ),
    );
    expect(stale).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "CONFIRMATION_STALE" },
    });
    expect(
      await executionService.getConfirmation(pending.data.confirmation.id),
    ).toMatchObject({
      decision: "PENDING",
      usability: "STALE",
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM conclusion_state_events WHERE confirmation_id=$1 AND status='CONFIRMED'",
          [pending.data.confirmation.id],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it("applies every conclusion/terminal confirmation matrix branch", async () => {
    const terminalCases = [
      {
        operation: "COMPLETE_PROJECT" as const,
        recommendation: "CONTINUE" as const,
        transition: "COMPLETE",
      },
      {
        operation: "STOP_PROJECT" as const,
        recommendation: "STOP" as const,
        transition: "STOP",
      },
      {
        operation: "TRANSFER_PROJECT" as const,
        recommendation: "TRANSFER" as const,
        transition: "TRANSFER",
      },
    ];
    for (const testCase of terminalCases) {
      const suffix = testCase.operation.toLowerCase();
      const prepared = await prepareConclusion(suffix, testCase.recommendation);
      const request = {
        expectedVersion: 4,
        operation: testCase.operation,
        conclusionId: prepared.conclusionId,
        completionSummary: `${testCase.transition} the matrix project`,
        actor: humanActor,
        reason: `Create ${testCase.operation}`,
      };
      const pending = await executionService.createConfirmation(
        prepared.projectId,
        request,
        commandContext(
          `lp02-matrix-confirmation-${suffix}`,
          "/api/v1/projects/:projectId/human-confirmations",
          { projectId: prepared.projectId },
          request,
        ),
      );
      if (!pending.ok) throw new Error("LP02_MATRIX_CONFIRMATION_FAILED");
      const decision = {
        expectedVersion: 5,
        decision: "APPROVE" as const,
        decisionNote: `Approve ${testCase.operation}`,
        actor: humanActor,
        reason: `Apply ${testCase.operation}`,
      };
      const decided = await executionService.decideConfirmation(
        pending.data.confirmation.id,
        pending.capability,
        decision,
        commandContext(
          `lp02-matrix-decision-${suffix}`,
          "/api/v1/human-confirmations/:confirmationId/decisions",
          { confirmationId: pending.data.confirmation.id },
          decision,
        ),
      );
      expect(decided).toMatchObject({
        ok: true,
        data: {
          project: { status: "COMPLETED", version: 6 },
          conclusion: { id: prepared.conclusionId, status: "CONFIRMED" },
          transition: {
            kind: testCase.transition,
            confirmationId: pending.data.confirmation.id,
          },
        },
      });
    }

    const prepared = await prepareConclusion("confirm-then-complete", "ADJUST");
    const confirmRequest = {
      expectedVersion: 4,
      operation: "CONFIRM_CONCLUSION" as const,
      conclusionId: prepared.conclusionId,
      actor: humanActor,
      reason: "Confirm the conclusion without completing",
    };
    const pendingConclusion = await executionService.createConfirmation(
      prepared.projectId,
      confirmRequest,
      commandContext(
        "lp02-confirm-conclusion-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: prepared.projectId },
        confirmRequest,
      ),
    );
    if (!pendingConclusion.ok)
      throw new Error("LP02_CONFIRM_CONCLUSION_FAILED");
    const confirmDecision = {
      expectedVersion: 5,
      decision: "APPROVE" as const,
      decisionNote: "Confirm only",
      actor: humanActor,
      reason: "Approve the conclusion",
    };
    const confirmed = await executionService.decideConfirmation(
      pendingConclusion.data.confirmation.id,
      pendingConclusion.capability,
      confirmDecision,
      commandContext(
        "lp02-confirm-conclusion-decision",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: pendingConclusion.data.confirmation.id },
        confirmDecision,
      ),
    );
    expect(confirmed).toMatchObject({
      ok: true,
      data: {
        project: { status: "IN_PROGRESS", version: 6 },
        conclusion: { status: "CONFIRMED" },
        transition: null,
      },
    });

    const completionRequest = {
      expectedVersion: 6,
      operation: "COMPLETE_PROJECT" as const,
      conclusionId: prepared.conclusionId,
      completionSummary: "Complete using an already confirmed conclusion",
      actor: humanActor,
      reason: "Create completion from confirmed state",
    };
    const pendingCompletion = await executionService.createConfirmation(
      prepared.projectId,
      completionRequest,
      commandContext(
        "lp02-confirmed-completion-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: prepared.projectId },
        completionRequest,
      ),
    );
    if (!pendingCompletion.ok) {
      throw new Error("LP02_CONFIRMED_COMPLETION_FAILED");
    }
    const completionDecision = {
      expectedVersion: 7,
      decision: "APPROVE" as const,
      decisionNote: "Complete without a duplicate conclusion event",
      actor: humanActor,
      reason: "Approve completion",
    };
    const completed = await executionService.decideConfirmation(
      pendingCompletion.data.confirmation.id,
      pendingCompletion.capability,
      completionDecision,
      commandContext(
        "lp02-confirmed-completion-decision",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: pendingCompletion.data.confirmation.id },
        completionDecision,
      ),
    );
    expect(completed).toMatchObject({
      ok: true,
      data: {
        project: { status: "COMPLETED", version: 8 },
        transition: { kind: "COMPLETE" },
      },
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM conclusion_state_events WHERE conclusion_id=$1 AND status='CONFIRMED'",
          [prepared.conclusionId],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("rejects, replays, expires and recommendation-checks confirmation opportunities", async () => {
    const rejectedPrepared = await prepareConclusion("reject", "CONTINUE");
    const request = {
      expectedVersion: 4,
      operation: "CONFIRM_CONCLUSION" as const,
      conclusionId: rejectedPrepared.conclusionId,
      actor: humanActor,
      reason: "Request a rejectable confirmation",
    };
    const pending = await executionService.createConfirmation(
      rejectedPrepared.projectId,
      request,
      commandContext(
        "lp02-reject-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: rejectedPrepared.projectId },
        request,
      ),
    );
    if (!pending.ok) throw new Error("LP02_REJECT_REQUEST_FAILED");
    const rejection = {
      expectedVersion: 5,
      decision: "REJECT" as const,
      decisionNote: "The evidence needs another pass",
      actor: humanActor,
      reason: "Reject the opportunity",
    };
    const rejectionContext = commandContext(
      "lp02-reject-decision",
      "/api/v1/human-confirmations/:confirmationId/decisions",
      { confirmationId: pending.data.confirmation.id },
      rejection,
    );
    const first = await executionService.decideConfirmation(
      pending.data.confirmation.id,
      pending.capability,
      rejection,
      rejectionContext,
    );
    const replay = await executionService.decideConfirmation(
      pending.data.confirmation.id,
      pending.capability,
      rejection,
      { ...rejectionContext, requestId: ids.request() },
    );
    expect(first).toMatchObject({
      ok: true,
      data: {
        project: { status: "IN_PROGRESS", version: 6 },
        confirmation: { decision: "REJECTED" },
        conclusion: { status: "DRAFT" },
        transition: null,
      },
    });
    expect(replay).toMatchObject({
      ok: true,
      idempotentReplay: true,
      requestId: first.requestId,
    });
    const newKey = await executionService.decideConfirmation(
      pending.data.confirmation.id,
      pending.capability,
      rejection,
      commandContext(
        "lp02-reject-new-key",
        "/api/v1/human-confirmations/:confirmationId/decisions",
        { confirmationId: pending.data.confirmation.id },
        rejection,
      ),
    );
    expect(newKey).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_ALREADY_DECIDED" },
    });

    const mismatchPrepared = await prepareConclusion("mismatch", "CONTINUE");
    const mismatch = {
      expectedVersion: 4,
      operation: "STOP_PROJECT" as const,
      conclusionId: mismatchPrepared.conclusionId,
      completionSummary: "Attempt a mismatched stop",
      actor: humanActor,
      reason: "Prove recommendation binding",
    };
    expect(
      await executionService.createConfirmation(
        mismatchPrepared.projectId,
        mismatch,
        commandContext(
          "lp02-mismatch-request",
          "/api/v1/projects/:projectId/human-confirmations",
          { projectId: mismatchPrepared.projectId },
          mismatch,
        ),
      ),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "RECOMMENDATION_MISMATCH" },
    });

    const expiredPrepared = await prepareConclusion("expired", "CONTINUE");
    let testClock = new Date("2020-01-01T00:00:00.000Z");
    const expiringService = new PostgresProjectExecutionService(
      pool,
      humanControlToken,
      () => testClock,
    );
    const expiringRequest = {
      expectedVersion: 4,
      operation: "CONFIRM_CONCLUSION" as const,
      conclusionId: expiredPrepared.conclusionId,
      actor: humanActor,
      reason: "Create an expiring opportunity",
    };
    const expiring = await expiringService.createConfirmation(
      expiredPrepared.projectId,
      expiringRequest,
      commandContext(
        "lp02-expiring-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: expiredPrepared.projectId },
        expiringRequest,
      ),
    );
    if (!expiring.ok) throw new Error("LP02_EXPIRING_REQUEST_FAILED");
    testClock = new Date("2020-01-01T00:31:00.000Z");
    const expiredDecision = {
      expectedVersion: 5,
      decision: "APPROVE" as const,
      decisionNote: "Attempt expired approval",
      actor: humanActor,
      reason: "Prove expiry",
    };
    expect(
      await expiringService.decideConfirmation(
        expiring.data.confirmation.id,
        expiring.capability,
        expiredDecision,
        commandContext(
          "lp02-expired-decision",
          "/api/v1/human-confirmations/:confirmationId/decisions",
          { confirmationId: expiring.data.confirmation.id },
          expiredDecision,
        ),
      ),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "CONFIRMATION_EXPIRED" },
    });
  });

  it("serializes competing confirmation decisions to one terminal authority", async () => {
    const prepared = await prepareConclusion("concurrent-decision", "CONTINUE");
    const request = {
      expectedVersion: 4,
      operation: "COMPLETE_PROJECT" as const,
      conclusionId: prepared.conclusionId,
      completionSummary: "Complete once under concurrent approval",
      actor: humanActor,
      reason: "Create the concurrent decision opportunity",
    };
    const pending = await executionService.createConfirmation(
      prepared.projectId,
      request,
      commandContext(
        "lp02-concurrent-decision-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: prepared.projectId },
        request,
      ),
    );
    if (!pending.ok) throw new Error("LP02_CONCURRENT_CONFIRMATION_FAILED");
    const duplicateRequest = { ...request, expectedVersion: 5 };
    const duplicatePending = await executionService.createConfirmation(
      prepared.projectId,
      duplicateRequest,
      commandContext(
        "lp02-concurrent-pending-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: prepared.projectId },
        duplicateRequest,
      ),
    );
    expect(duplicatePending).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_ALREADY_PENDING" },
    });

    const decision = {
      expectedVersion: 5,
      decision: "APPROVE" as const,
      decisionNote: "Approve once",
      actor: humanActor,
      reason: "Race two independent decision keys",
    };
    const [left, right] = await Promise.all([
      executionService.decideConfirmation(
        pending.data.confirmation.id,
        pending.capability,
        decision,
        commandContext(
          "lp02-concurrent-decision-left",
          "/api/v1/human-confirmations/:confirmationId/decisions",
          { confirmationId: pending.data.confirmation.id },
          decision,
        ),
      ),
      executionService.decideConfirmation(
        pending.data.confirmation.id,
        pending.capability,
        decision,
        commandContext(
          "lp02-concurrent-decision-right",
          "/api/v1/human-confirmations/:confirmationId/decisions",
          { confirmationId: pending.data.confirmation.id },
          decision,
        ),
      ),
    ]);
    const successes = [left, right].filter((result) => result.ok);
    const rejections = [left, right].filter((result) => !result.ok);
    expect(successes).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toMatchObject({
      error: { code: "CONFIRMATION_ALREADY_DECIDED" },
    });
    expect(
      (
        await pool.query(
          "SELECT status,version FROM validation_projects WHERE id=$1",
          [prepared.projectId],
        )
      ).rows[0],
    ).toEqual({ status: "COMPLETED", version: 6 });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM project_transitions WHERE confirmation_id=$1",
          [pending.data.confirmation.id],
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM conclusion_state_events WHERE confirmation_id=$1 AND status='CONFIRMED'",
          [pending.data.confirmation.id],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("rejects cross-project and retracted Evidence while preserving LP-02 replay and version semantics", async () => {
    const projectId = await createProject("reference-owner");
    const otherProjectId = await createProject("reference-other");
    const evidence = {
      expectedVersion: 1,
      kind: "NOTE" as const,
      title: "Owned Evidence",
      summary: "This metadata belongs to one project",
      capturedAt: "2026-07-31T05:30:00.000Z",
      actor: aiActor,
      reason: "Create reference ownership fixture",
    };
    const recorded = await executionService.createEvidence(
      projectId,
      evidence,
      commandContext(
        "lp02-reference-evidence",
        "/api/v1/projects/:projectId/evidence",
        { projectId },
        evidence,
      ),
    );
    if (!recorded.ok) throw new Error("LP02_REFERENCE_EVIDENCE_FAILED");
    const ownerStart = {
      expectedVersion: 2,
      transition: "START" as const,
      nextStep: "Use only active same-project Evidence",
      actor: aiActor,
      reason: "Start the Evidence owner project",
    };
    await executionService.transitionProject(
      projectId,
      ownerStart,
      commandContext(
        "lp02-reference-owner-start",
        "/api/v1/projects/:projectId/transitions",
        { projectId },
        ownerStart,
      ),
    );
    const otherStart = {
      expectedVersion: 1,
      transition: "START" as const,
      nextStep: "Attempt a bounded reference",
      actor: aiActor,
      reason: "Start the other project",
    };
    await executionService.transitionProject(
      otherProjectId,
      otherStart,
      commandContext(
        "lp02-reference-other-start",
        "/api/v1/projects/:projectId/transitions",
        { projectId: otherProjectId },
        otherStart,
      ),
    );
    const crossProjectProgress = {
      expectedVersion: 2,
      summary: "Attempt cross-project reference",
      completedWork: ["No valid work should commit"],
      nextStep: "Use same-project Evidence",
      evidenceIds: [recorded.data.evidence.id],
      occurredAt: "2026-07-31T05:31:00.000Z",
      actor: aiActor,
      reason: "Prove cross-project rejection",
    };
    expect(
      await executionService.createProgressUpdate(
        otherProjectId,
        crossProjectProgress,
        commandContext(
          "lp02-cross-project-progress",
          "/api/v1/projects/:projectId/progress-updates",
          { projectId: otherProjectId },
          crossProjectProgress,
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "CROSS_PROJECT_REFERENCE" },
    });
    expect(
      (
        await pool.query(
          "SELECT version FROM validation_projects WHERE id=$1",
          [otherProjectId],
        )
      ).rows[0]?.version,
    ).toBe(2);

    const correction = {
      expectedVersion: 3,
      action: "CORRECT" as const,
      replacement: {
        kind: "NOTE" as const,
        title: "Corrected Evidence",
        summary: "Use the corrected metadata",
        capturedAt: "2026-07-31T05:32:00.000Z",
      },
      actor: aiActor,
      reason: "Retract the original through correction",
    };
    const corrected = await executionService.correctEvidence(
      projectId,
      recorded.data.evidence.id,
      correction,
      commandContext(
        "lp02-reference-evidence-correction",
        "/api/v1/projects/:projectId/evidence/:evidenceId/corrections",
        { projectId, evidenceId: recorded.data.evidence.id },
        correction,
      ),
    );
    if (!corrected.ok) throw new Error("LP02_REFERENCE_CORRECTION_FAILED");
    const progress = {
      expectedVersion: 4,
      summary: "Record progress against current Evidence",
      completedWork: ["Selected the active correction leaf"],
      nextStep: "Continue with the corrected fact",
      evidenceIds: [corrected.data.evidence.id],
      occurredAt: "2026-07-31T05:33:00.000Z",
      actor: aiActor,
      reason: "Prove current-reference and replay semantics",
    };
    const retractedProgress = {
      ...progress,
      evidenceIds: [recorded.data.evidence.id],
      reason: "Attempt a retracted Evidence reference",
    };
    expect(
      await executionService.createProgressUpdate(
        projectId,
        retractedProgress,
        commandContext(
          "lp02-retracted-progress",
          "/api/v1/projects/:projectId/progress-updates",
          { projectId },
          retractedProgress,
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "REFERENCE_NOT_ACTIVE" },
    });

    const progressContext = commandContext(
      "lp02-reference-progress",
      "/api/v1/projects/:projectId/progress-updates",
      { projectId },
      progress,
    );
    const created = await executionService.createProgressUpdate(
      projectId,
      progress,
      progressContext,
    );
    const replay = await executionService.createProgressUpdate(
      projectId,
      progress,
      { ...progressContext, requestId: ids.request() },
    );
    expect(created).toMatchObject({
      ok: true,
      data: { project: { version: 5 } },
    });
    expect(replay).toMatchObject({
      ok: true,
      idempotentReplay: true,
      requestId: created.requestId,
    });

    const changedIntent = {
      ...progress,
      summary: "A different intent under the same key",
    };
    expect(
      await executionService.createProgressUpdate(
        projectId,
        changedIntent,
        commandContext(
          "lp02-reference-progress",
          "/api/v1/projects/:projectId/progress-updates",
          { projectId },
          changedIntent,
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(
      await executionService.createProgressUpdate(
        projectId,
        { ...progress, reason: "Attempt a stale project version" },
        commandContext(
          "lp02-stale-progress-version",
          "/api/v1/projects/:projectId/progress-updates",
          { projectId },
          { ...progress, reason: "Attempt a stale project version" },
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("preserves correction and supersession chains while projecting the latest interpretation", async () => {
    const projectId = await createProject("corrections");
    const start = {
      expectedVersion: 1,
      transition: "START" as const,
      nextStep: "Record correctable facts",
      actor: aiActor,
      reason: "Start correction scenario",
    };
    await executionService.transitionProject(
      projectId,
      start,
      commandContext(
        "lp02-correction-start",
        "/api/v1/projects/:projectId/transitions",
        { projectId },
        start,
      ),
    );
    const originalEvidence = {
      expectedVersion: 2,
      kind: "NOTE" as const,
      title: "Original note",
      summary: "The initial interpretation",
      capturedAt: "2026-07-31T06:00:00.000Z",
      actor: aiActor,
      reason: "Record original evidence",
    };
    const original = await executionService.createEvidence(
      projectId,
      originalEvidence,
      commandContext(
        "lp02-correction-evidence-original",
        "/api/v1/projects/:projectId/evidence",
        { projectId },
        originalEvidence,
      ),
    );
    if (!original.ok) throw new Error("LP02_ORIGINAL_EVIDENCE_FAILED");
    const evidenceCorrection = {
      expectedVersion: 3,
      action: "CORRECT" as const,
      replacement: {
        kind: "NOTE" as const,
        title: "Corrected note",
        summary: "The corrected interpretation",
        capturedAt: "2026-07-31T06:01:00.000Z",
      },
      actor: aiActor,
      reason: "Correct the evidence interpretation",
    };
    const correctedEvidence = await executionService.correctEvidence(
      projectId,
      original.data.evidence.id,
      evidenceCorrection,
      commandContext(
        "lp02-correction-evidence",
        "/api/v1/projects/:projectId/evidence/:evidenceId/corrections",
        { projectId, evidenceId: original.data.evidence.id },
        evidenceCorrection,
      ),
    );
    if (!correctedEvidence.ok) {
      throw new Error("LP02_CORRECTED_EVIDENCE_FAILED");
    }

    const firstProgress = {
      expectedVersion: 4,
      summary: "Initial progress interpretation",
      completedWork: ["Captured the corrected evidence"],
      nextStep: "Review the progress text",
      evidenceIds: [correctedEvidence.data.evidence.id],
      occurredAt: "2026-07-31T06:02:00.000Z",
      actor: aiActor,
      reason: "Record initial progress",
    };
    const progress = await executionService.createProgressUpdate(
      projectId,
      firstProgress,
      commandContext(
        "lp02-correction-progress-original",
        "/api/v1/projects/:projectId/progress-updates",
        { projectId },
        firstProgress,
      ),
    );
    if (!progress.ok) throw new Error("LP02_ORIGINAL_PROGRESS_FAILED");
    const progressCorrection = {
      expectedVersion: 5,
      summary: "Corrected progress interpretation",
      completedWork: ["Captured and reviewed the corrected evidence"],
      nextStep: "Resolve the decision response",
      evidenceIds: [correctedEvidence.data.evidence.id],
      occurredAt: "2026-07-31T06:03:00.000Z",
      correctsProgressId: progress.data.progressUpdate.id,
      actor: aiActor,
      reason: "Correct the progress record",
    };
    const correctedProgress = await executionService.createProgressUpdate(
      projectId,
      progressCorrection,
      commandContext(
        "lp02-correction-progress",
        "/api/v1/projects/:projectId/progress-updates",
        { projectId },
        progressCorrection,
      ),
    );
    if (!correctedProgress.ok) {
      throw new Error("LP02_CORRECTED_PROGRESS_FAILED");
    }

    const attention = {
      expectedVersion: 6,
      type: "DECISION_REQUEST" as const,
      title: "Choose an interpretation",
      background: "The response may need correction",
      decisionImpact: "The response informs the conclusion",
      waitingForRole: "PROPOSER" as const,
      options: ["Proceed", "Collect more"],
      recommendation: "Proceed",
      actor: aiActor,
      reason: "Open a correctable response",
    };
    const opened = await executionService.createAttentionItem(
      projectId,
      attention,
      commandContext(
        "lp02-correction-attention",
        "/api/v1/projects/:projectId/attention-items",
        { projectId },
        attention,
      ),
    );
    if (!opened.ok) throw new Error("LP02_CORRECTION_ATTENTION_FAILED");
    const response = {
      expectedVersion: 7,
      kind: "RESOLVE" as const,
      message: "Proceed now",
      selectedOption: "Proceed",
      actor: humanActor,
      reason: "Record the original response",
    };
    const responded = await executionService.appendAttentionEvent(
      projectId,
      opened.data.attentionItem.id,
      response,
      commandContext(
        "lp02-correction-response-original",
        "/api/v1/projects/:projectId/attention-items/:itemId/events",
        { projectId, itemId: opened.data.attentionItem.id },
        response,
      ),
    );
    if (!responded.ok) throw new Error("LP02_ORIGINAL_RESPONSE_FAILED");
    const responseCorrection = {
      expectedVersion: 8,
      kind: "CORRECT_RESPONSE" as const,
      correctsEventId: responded.data.event.id,
      correctedKind: "RESOLVE" as const,
      replacement: {
        message: "Collect another signal",
        selectedOption: "Collect more",
      },
      actor: humanActor,
      reason: "Correct only the response text",
    };
    const correctedResponse = await executionService.appendAttentionEvent(
      projectId,
      opened.data.attentionItem.id,
      responseCorrection,
      commandContext(
        "lp02-correction-response",
        "/api/v1/projects/:projectId/attention-items/:itemId/events",
        { projectId, itemId: opened.data.attentionItem.id },
        responseCorrection,
      ),
    );
    expect(correctedResponse).toMatchObject({
      ok: true,
      data: {
        attentionItem: { status: "RESOLVED" },
        event: { kind: "CORRECT_RESPONSE" },
        effectiveResponse: { selectedOption: "Collect more" },
      },
    });

    const conclusionOne = {
      expectedVersion: 9,
      evidenceSummary: "Original conclusion",
      evidenceIds: [correctedEvidence.data.evidence.id],
      limitations: ["Original limitation"],
      uncertainties: ["Original uncertainty"],
      recommendation: "CONTINUE" as const,
      recommendationNote: "Original recommendation",
      actor: aiActor,
      reason: "Record original conclusion",
    };
    const firstConclusion = await executionService.createConclusion(
      projectId,
      conclusionOne,
      commandContext(
        "lp02-correction-conclusion-original",
        "/api/v1/projects/:projectId/conclusions",
        { projectId },
        conclusionOne,
      ),
    );
    if (!firstConclusion.ok) throw new Error("LP02_ORIGINAL_CONCLUSION_FAILED");
    const conclusionTwo = {
      expectedVersion: 10,
      evidenceSummary: "Corrected conclusion",
      evidenceIds: [correctedEvidence.data.evidence.id],
      limitations: ["Corrected limitation"],
      uncertainties: ["Corrected uncertainty"],
      recommendation: "ADJUST" as const,
      recommendationNote: "Collect one more signal",
      supersedesConclusionId: firstConclusion.data.conclusion.id,
      actor: aiActor,
      reason: "Supersede the original conclusion",
    };
    const secondConclusion = await executionService.createConclusion(
      projectId,
      conclusionTwo,
      commandContext(
        "lp02-correction-conclusion",
        "/api/v1/projects/:projectId/conclusions",
        { projectId },
        conclusionTwo,
      ),
    );
    if (!secondConclusion.ok) {
      throw new Error("LP02_CORRECTED_CONCLUSION_FAILED");
    }

    const evidenceHistory = await executionService.listEvidence(projectId, 20);
    expect(evidenceHistory.items).toMatchObject([
      {
        evidence: {
          id: correctedEvidence.data.evidence.id,
          state: "ACTIVE",
          replacesEvidenceId: original.data.evidence.id,
        },
        lifecycleEvent: null,
      },
      {
        evidence: { id: original.data.evidence.id, state: "RETRACTED" },
        lifecycleEvent: {
          kind: "CORRECT",
          replacementEvidenceId: correctedEvidence.data.evidence.id,
        },
      },
    ]);
    expect(
      await executionService.listProgressUpdates(projectId, 20),
    ).toMatchObject({
      items: [
        {
          id: correctedProgress.data.progressUpdate.id,
          correctsProgressId: progress.data.progressUpdate.id,
        },
        { id: progress.data.progressUpdate.id, correctsProgressId: null },
      ],
    });
    expect(
      await executionService.listAttentionItems(projectId, 20),
    ).toMatchObject({
      items: [
        {
          item: { id: opened.data.attentionItem.id, status: "RESOLVED" },
          eventHistory: [
            {
              original: { id: responded.data.event.id, kind: "RESOLVE" },
              corrections: [
                {
                  id: correctedResponse.ok
                    ? correctedResponse.data.event.id
                    : "",
                  kind: "CORRECT_RESPONSE",
                },
              ],
              effectiveResponse: { selectedOption: "Collect more" },
              stateEffect: { fromStatus: "OPEN", toStatus: "RESOLVED" },
            },
          ],
        },
      ],
    });
    expect(await executionService.listConclusions(projectId, 20)).toMatchObject(
      {
        items: [
          {
            id: secondConclusion.data.conclusion.id,
            status: "DRAFT",
            supersedesConclusionId: firstConclusion.data.conclusion.id,
          },
          {
            id: firstConclusion.data.conclusion.id,
            status: "SUPERSEDED",
          },
        ],
      },
    );

    await expect(
      pool.query("UPDATE evidence_items SET summary='tampered' WHERE id=$1", [
        original.data.evidence.id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("UPDATE attention_items SET title='tampered' WHERE id=$1", [
        opened.data.attentionItem.id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rolls back an execution fact, project, audit and idempotency record after a terminal write failure", async () => {
    const projectId = await createProject("rollback-evidence");
    const key = "lp02-rollback-evidence";
    const evidence = {
      expectedVersion: 1,
      kind: "NOTE" as const,
      title: "Rollback evidence",
      summary: "This row must disappear with the failed transaction",
      capturedAt: "2026-07-31T06:00:00.000Z",
      actor: aiActor,
      reason: "Prove execution transaction rollback",
    };
    const context = commandContext(
      key,
      "/api/v1/projects/:projectId/evidence",
      { projectId },
      evidence,
    );

    await pool.query(`
      CREATE OR REPLACE FUNCTION lp02_test_fail_evidence_commit()
      RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.idempotency_key = '${key}'
           AND OLD.status = 'IN_PROGRESS'
           AND NEW.status = 'SUCCEEDED' THEN
          IF NOT EXISTS (
            SELECT 1
            FROM evidence_items evidence
            JOIN validation_projects project
              ON project.id = evidence.project_id
            JOIN audit_events audit
              ON audit.aggregate_id = project.id
             AND audit.idempotency_key = NEW.idempotency_key
            WHERE evidence.project_id = '${projectId}'
              AND evidence.title = 'Rollback evidence'
              AND project.version = 2
          ) THEN
            RAISE EXCEPTION 'LP-02 evidence rollback precondition missing'
              USING ERRCODE = 'P0002';
          END IF;
          RAISE EXCEPTION 'injected LP-02 evidence commit failure'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await pool.query(`
      CREATE TRIGGER lp02_test_fail_evidence_commit_trigger
      BEFORE UPDATE ON idempotency_records
      FOR EACH ROW
      EXECUTE FUNCTION lp02_test_fail_evidence_commit()
    `);

    try {
      await expect(
        executionService.createEvidence(projectId, evidence, context),
      ).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await pool.query(
        "DROP TRIGGER lp02_test_fail_evidence_commit_trigger ON idempotency_records",
      );
      await pool.query("DROP FUNCTION lp02_test_fail_evidence_commit()");
    }

    const rolledBack = await pool.query<{
      audits: number;
      evidence: number;
      idempotency: number;
      version: number;
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM evidence_items
            WHERE project_id=$1 AND title='Rollback evidence') AS evidence,
          (SELECT version FROM validation_projects WHERE id=$1) AS version,
          (SELECT count(*)::int FROM audit_events
            WHERE idempotency_key=$2) AS audits,
          (SELECT count(*)::int FROM idempotency_records
            WHERE idempotency_key=$2) AS idempotency
      `,
      [projectId, key],
    );
    expect(rolledBack.rows[0]).toEqual({
      audits: 0,
      evidence: 0,
      idempotency: 0,
      version: 1,
    });

    const recovered = await executionService.createEvidence(
      projectId,
      evidence,
      {
        ...context,
        requestId: ids.request(),
      },
    );
    expect(recovered).toMatchObject({
      ok: true,
      idempotentReplay: false,
      data: {
        project: { version: 2 },
        evidence: { title: "Rollback evidence" },
      },
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE idempotency_key=$1",
          [key],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("rolls back a human decision and terminal transition, then recovers with the same key", async () => {
    const prepared = await prepareConclusion("rollback-decision", "CONTINUE");
    const confirmationRequest = {
      expectedVersion: 4,
      operation: "COMPLETE_PROJECT" as const,
      conclusionId: prepared.conclusionId,
      completionSummary: "Complete only after the transaction commits",
      actor: humanActor,
      reason: "Create a rollback-sensitive confirmation",
    };
    const pending = await executionService.createConfirmation(
      prepared.projectId,
      confirmationRequest,
      commandContext(
        "lp02-rollback-decision-request",
        "/api/v1/projects/:projectId/human-confirmations",
        { projectId: prepared.projectId },
        confirmationRequest,
      ),
    );
    if (!pending.ok) throw new Error("LP02_ROLLBACK_CONFIRMATION_FAILED");

    const key = "lp02-rollback-decision";
    const decision = {
      expectedVersion: 5,
      decision: "APPROVE" as const,
      decisionNote: "Approve only if all authority records commit",
      actor: humanActor,
      reason: "Prove human decision transaction rollback",
    };
    const context = commandContext(
      key,
      "/api/v1/human-confirmations/:confirmationId/decisions",
      { confirmationId: pending.data.confirmation.id },
      decision,
    );

    await pool.query(`
      CREATE OR REPLACE FUNCTION lp02_test_fail_decision_commit()
      RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.idempotency_key = '${key}'
           AND OLD.status = 'IN_PROGRESS'
           AND NEW.status = 'SUCCEEDED' THEN
          IF NOT EXISTS (
            SELECT 1
            FROM human_confirmations confirmation
            JOIN validation_projects project
              ON project.id = confirmation.project_id
            JOIN conclusion_state_events conclusion_state
              ON conclusion_state.confirmation_id = confirmation.id
             AND conclusion_state.status = 'CONFIRMED'
            JOIN project_transitions transition
              ON transition.confirmation_id = confirmation.id
             AND transition.kind = 'COMPLETE'
            JOIN audit_events audit
              ON audit.aggregate_id = project.id
             AND audit.idempotency_key = NEW.idempotency_key
            WHERE confirmation.id = '${pending.data.confirmation.id}'
              AND confirmation.decision = 'APPROVED'
              AND project.status = 'COMPLETED'
              AND project.version = 6
          ) THEN
            RAISE EXCEPTION 'LP-02 decision rollback precondition missing'
              USING ERRCODE = 'P0002';
          END IF;
          RAISE EXCEPTION 'injected LP-02 decision commit failure'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await pool.query(`
      CREATE TRIGGER lp02_test_fail_decision_commit_trigger
      BEFORE UPDATE ON idempotency_records
      FOR EACH ROW
      EXECUTE FUNCTION lp02_test_fail_decision_commit()
    `);

    try {
      await expect(
        executionService.decideConfirmation(
          pending.data.confirmation.id,
          pending.capability,
          decision,
          context,
        ),
      ).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await pool.query(
        "DROP TRIGGER lp02_test_fail_decision_commit_trigger ON idempotency_records",
      );
      await pool.query("DROP FUNCTION lp02_test_fail_decision_commit()");
    }

    expect(
      await executionService.getConfirmation(pending.data.confirmation.id),
    ).toMatchObject({ decision: "PENDING", usability: "ACTIVE" });
    expect(
      (
        await pool.query(
          "SELECT status,version FROM validation_projects WHERE id=$1",
          [prepared.projectId],
        )
      ).rows[0],
    ).toEqual({ status: "IN_PROGRESS", version: 5 });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM project_transitions WHERE confirmation_id=$1",
          [pending.data.confirmation.id],
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE idempotency_key=$1",
          [key],
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM idempotency_records WHERE idempotency_key=$1",
          [key],
        )
      ).rows[0]?.count,
    ).toBe(0);

    const recovered = await executionService.decideConfirmation(
      pending.data.confirmation.id,
      pending.capability,
      decision,
      { ...context, requestId: ids.request() },
    );
    expect(recovered).toMatchObject({
      ok: true,
      idempotentReplay: false,
      data: {
        project: { status: "COMPLETED", version: 6 },
        confirmation: { decision: "APPROVED", usability: "CONSUMED" },
        conclusion: { status: "CONFIRMED" },
        transition: { kind: "COMPLETE" },
      },
    });
  });
});
