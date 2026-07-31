import {
  createIdFactory,
  requestDigest,
  type CommandContext,
} from "@idea/application";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPool,
  migrate,
  PostgresExperienceQueryService,
  PostgresIdeaService,
} from "../src/index.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
const ideaService = new PostgresIdeaService(pool);
const experienceService = new PostgresExperienceQueryService(pool);
const ids = createIdFactory();
const actor = {
  actorType: "AI" as const,
  role: "EXECUTOR" as const,
  displayName: "LP-03 projection test",
};
const proposer = {
  actorType: "HUMAN" as const,
  role: "PROPOSER" as const,
  displayName: "Founder",
};

const context = (
  key: string,
  route: string,
  params: object,
  body: object,
): CommandContext => ({
  idempotencyKey: key,
  requestId: ids.request(),
  requestDigest: requestDigest("POST", route, params, body),
});

const reset = async (): Promise<void> => {
  await pool.query(`
    TRUNCATE TABLE audit_events,project_hypotheses,validation_projects,
      clarification_answers,clarification_questions,idea_statements,
      idempotency_records,ideas CASCADE
  `);
};

const createIdea = async (name: string, needsClarification = false) => {
  const input = {
    intentSummary: `Idea ${name}`,
    proposer,
    ...(needsClarification ? {} : { desiredOutcome: `Outcome ${name}` }),
    facts: [],
    hypotheses: needsClarification ? [] : [{ text: `Hypothesis ${name}` }],
    clarificationQuestions: needsClarification
      ? [{ prompt: `Clarify ${name}`, targetField: "DESIRED_OUTCOME" as const }]
      : [],
    actor,
    reason: "Create experience fixture",
  };
  const created = await ideaService.createIdea(
    input,
    context(`create-${name}`, "/api/v1/ideas", {}, input),
  );
  if (!created.ok) throw new Error(`CREATE_FAILED:${name}`);
  return created.data.idea;
};

const promote = async (name: string, ideaId: string, version: number) => {
  const input = {
    expectedVersion: version,
    explicitIntent: "PROMOTE" as const,
    actor: proposer,
    reason: "Promote experience fixture",
  };
  const promoted = await ideaService.promoteIdea(
    ideaId,
    input,
    context(
      `promote-${name}`,
      "/api/v1/ideas/:ideaId/promotions",
      { ideaId },
      input,
    ),
  );
  if (!promoted.ok) throw new Error(`PROMOTE_FAILED:${name}`);
  return promoted.data.project.authority;
};

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(reset);
afterAll(async () => {
  await pool.end();
});

describe("LP-03 authoritative experience projections", () => {
  it("classifies every Idea exactly once from the linked project authority", async () => {
    const ordinary = await createIdea("ordinary");
    const clarify = await createIdea("clarify", true);
    const statuses = ["QUEUED", "IN_PROGRESS", "PAUSED", "COMPLETED"] as const;
    const promoted = [];
    for (const status of statuses) {
      const idea = await createIdea(status);
      const project = await promote(status, idea.id, idea.version);
      await pool.query(
        `UPDATE validation_projects SET status=$2::varchar,
          completed_at=CASE WHEN $2::varchar='COMPLETED' THEN clock_timestamp() ELSE NULL END,
          completion_kind=CASE WHEN $2::varchar='COMPLETED' THEN 'COMPLETE' ELSE NULL END
         WHERE id=$1`,
        [project.id, status],
      );
      await pool.query(
        "UPDATE ideas SET intake_status='NEEDS_CLARIFICATION' WHERE id=$1",
        [idea.id],
      );
      promoted.push(project);
    }

    const page = await experienceService.listProposerIdeas(undefined, 20);
    expect(page.items).toHaveLength(6);
    expect(
      new Map(page.items.map((item) => [item.ideaId, item.category])),
    ).toEqual(
      new Map([
        [ordinary.id, "IDEA"],
        [clarify.id, "NEEDS_CLARIFICATION"],
        ...promoted.map(
          (project, index) =>
            [
              project.ideaId,
              statuses[index] === "QUEUED"
                ? "AWAITING_EXECUTION"
                : statuses[index],
            ] as const,
        ),
      ]),
    );
    expect(page.items.filter((item) => item.project !== null)).toHaveLength(4);

    for (const category of [
      "IDEA",
      "NEEDS_CLARIFICATION",
      "AWAITING_EXECUTION",
      "IN_PROGRESS",
      "PAUSED",
      "COMPLETED",
    ] as const) {
      const filtered = await experienceService.listProposerIdeas(category, 20);
      expect(filtered.items).toHaveLength(1);
      expect(filtered.items[0]?.category).toBe(category);
    }
  });

  it("batch-loads role previews, groups executor projects and preserves stable cursors", async () => {
    const firstIdea = await createIdea("first");
    const first = await promote("first", firstIdea.id, firstIdea.version);
    const secondIdea = await createIdea("second");
    const second = await promote("second", secondIdea.id, secondIdea.version);
    const progressId = ids.progress();
    const blockerId = ids.attention();
    const supportId = ids.attention();
    const conclusionId = ids.conclusion();
    const stateId = ids.event();
    const confirmationId = ids.confirmation();
    await pool.query(
      `INSERT INTO progress_updates (
        id,workspace_id,project_id,sequence,summary,completed_work,next_step,
        project_status_at_submission,phase_at_submission,occurred_at,
        actor_type,actor_role,actor_display_name,actor_client,on_behalf_of_role,
        corrects_progress_id,resulting_project_version
      ) VALUES ($1,'workspace_default',$2,1,'Validated demand','["Interviewed buyer"]','Interview buyer',
        'IN_PROGRESS','VALIDATING',clock_timestamp(),'AI','EXECUTOR','Agent',NULL,NULL,NULL,2)`,
      [progressId, first.id],
    );
    await pool.query(
      `INSERT INTO attention_items (
        id,workspace_id,project_id,type,title,status,background,impact,options,waiting_for_role,
        support_needed,request_reason,expected_responder_role,
        actor_type,actor_role,actor_display_name,actor_client,on_behalf_of_role,
        resulting_project_version
      ) VALUES
        ($1,'workspace_default',$3,'BLOCKER','Need pricing decision','OPEN','Pricing is unresolved',
          'Blocks validation','[]','PROPOSER',NULL,NULL,NULL,
          'AI','EXECUTOR','Agent',NULL,NULL,3),
        ($2,'workspace_default',$3,'SUPPORT_REQUEST','Need introduction','NEEDS_INFO',NULL,
          'Cannot reach buyer','[]',NULL,'Buyer introduction','Reach target segment','EXECUTOR',
          'AI','EXECUTOR','Agent',NULL,NULL,4)`,
      [blockerId, supportId, first.id],
    );
    await pool.query(
      `INSERT INTO validation_conclusions (
        id,workspace_id,project_id,sequence,evidence_summary,limitations,uncertainties,
        recommendation,recommendation_note,supplemental_note,supersedes_conclusion_id,
        actor_type,actor_role,actor_display_name,actor_client,on_behalf_of_role,
        resulting_project_version
      ) VALUES ($1,'workspace_default',$2,1,'Evidence supports continuation','["Small sample"]','["Price"]',
        'CONTINUE','Keep validating',NULL,NULL,'AI','EXECUTOR','Agent',NULL,NULL,5)`,
      [conclusionId, first.id],
    );
    await pool.query(
      `INSERT INTO conclusion_state_events (
        id,workspace_id,project_id,conclusion_id,status,confirmation_id,reason,
        actor_type,actor_role,actor_display_name,actor_client,on_behalf_of_role,
        resulting_project_version
      ) VALUES ($1,'workspace_default',$2,$3,'CONFIRMED',NULL,'Confirmed',
        'HUMAN','PROPOSER','Founder',NULL,NULL,6)`,
      [stateId, first.id, conclusionId],
    );
    await pool.query(
      `UPDATE validation_projects SET status='IN_PROGRESS',phase='VALIDATING',
        latest_progress_update_id=$2,active_conclusion_id=$3,
        current_next_step='Interview buyer',version=6,updated_at='2026-01-02T00:00:00Z'
       WHERE id=$1`,
      [first.id, progressId, conclusionId],
    );
    await pool.query(
      `INSERT INTO human_confirmations (
        id,workspace_id,project_id,operation,conclusion_id,payload_digest,payload_summary,
        expected_project_version,capability_hash,expires_at,decision,
        confirmation_request_idempotency_key
      ) VALUES ($1,'workspace_default',$2,'CONFIRM_CONCLUSION',$3,repeat('a',64),'{}',6,
        repeat('b',64),clock_timestamp()+interval '1 hour','PENDING','confirm-fixture')`,
      [confirmationId, first.id, conclusionId],
    );
    await pool.query(
      "UPDATE validation_projects SET updated_at='2026-01-01T00:00:00Z' WHERE id=$1",
      [second.id],
    );

    const firstPage = await experienceService.listExecutorProjects("OPEN", 1);
    expect(firstPage.items).toMatchObject([
      {
        projectId: first.id,
        group: "OPEN",
        latestProgress: { id: progressId, nextStep: "Interview buyer" },
        blockers: [{ id: blockerId }],
        supportRequests: [{ id: supportId }],
        pendingConfirmations: 1,
        latestConclusion: { id: conclusionId, recommendation: "CONTINUE" },
      },
    ]);
    expect(firstPage.nextCursor).not.toBeNull();
    const nextPage = await experienceService.listExecutorProjects(
      "OPEN",
      1,
      firstPage.nextCursor ?? undefined,
    );
    expect(nextPage.items.map((item) => item.projectId)).toEqual([second.id]);
    expect(nextPage.nextCursor).toBeNull();

    const proposerPage = await experienceService.listProposerIdeas(
      "IN_PROGRESS",
      20,
    );
    const proposerCard = proposerPage.items[0];
    expect(proposerCard).toMatchObject({
      ideaId: first.ideaId,
      project: { id: first.id, version: 6 },
      latestProgress: { id: progressId },
      waitingForProposer: [{ id: blockerId }],
      latestConfirmedConclusion: { id: conclusionId },
    });
    expect(proposerCard?.project?.id).toBe(firstPage.items[0]?.projectId);
    const legacyIdea = await ideaService.getIdea(first.ideaId, "proposer");
    expect(proposerCard?.ideaVersion).toBe(legacyIdea?.authority.version);

    await pool.query(
      `UPDATE validation_projects SET status='COMPLETED',completed_at=clock_timestamp(),
        completion_kind='COMPLETE' WHERE id=$1`,
      [second.id],
    );
    expect(
      (await experienceService.listExecutorProjects("COMPLETED", 20)).items,
    ).toHaveLength(1);

    const detail = await experienceService.getProjectExperience(
      first.id,
      "PROPOSER",
    );
    expect(detail).toMatchObject({
      view: "PROPOSER",
      authority: { id: first.id, version: 6 },
      previewCounts: {
        progressUpdates: 1,
        attentionItems: 2,
        evidence: 0,
        conclusions: 1,
        confirmations: 1,
      },
      latestProgress: { id: progressId },
      attentionPreview: [{ id: blockerId }],
      latestConclusion: { id: conclusionId },
    });
    expect(
      await experienceService.getProjectExperience(ids.project(), "EXECUTOR"),
    ).toBeNull();
  });

  it("relies on database constraints to reject impossible and duplicate links", async () => {
    const orphan = await createIdea("orphan");
    await expect(
      pool.query("UPDATE ideas SET project_id=$2 WHERE id=$1", [
        orphan.id,
        ids.project(),
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    expect(
      (await experienceService.listProposerIdeas(undefined, 20)).items,
    ).toMatchObject([{ ideaId: orphan.id, category: "IDEA" }]);

    const firstIdea = await createIdea("unique-first");
    const first = await promote(
      "unique-first",
      firstIdea.id,
      firstIdea.version,
    );
    await expect(
      pool.query(
        `INSERT INTO validation_projects (
          id,workspace_id,idea_id,goal,phase,status,source_idea_version
        ) VALUES ($1,'workspace_default',$2,'Duplicate','PLANNING','QUEUED',$3)`,
        [ids.project(), first.ideaId, first.sourceIdeaVersion],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
