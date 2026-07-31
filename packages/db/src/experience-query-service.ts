import type {
  ExecutorProjectCardDto,
  ExecutorProjectGroup,
  ExperienceAttentionPreview,
  ExperienceConclusionPreview,
  ExperienceProgressPreview,
  ExperienceProjectDetailDto,
  ExperienceView,
  ProjectAuthorityDto,
  ProposerIdeaCardDto,
  ProposerIdeaCategory,
} from "@idea/contracts";
import {
  decodeCursor,
  encodeCursor,
  type ExperienceQueryService,
  type Page,
} from "@idea/application";
import { WORKSPACE_ID } from "@idea/domain";
import type { Pool } from "pg";

type ProjectStatus = "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
type ProjectPhase = "PLANNING" | "BUILDING" | "VALIDATING" | "CONCLUDING";

interface AuthorityRow {
  project_id: string;
  idea_id: string;
  goal: string;
  phase: ProjectPhase;
  status: ProjectStatus;
  current_next_step: string | null;
  latest_progress_update_id: string | null;
  active_conclusion_id: string | null;
  completed_at: Date | null;
  completion_kind: "COMPLETE" | "STOP" | "TRANSFER" | null;
  source_idea_version: number;
  project_version: number;
  project_created_at: Date;
  project_updated_at: Date;
}

interface ProposerAuthorityRow extends AuthorityRow {
  idea_version: number;
  intent_summary: string;
  intake_status: "IDEA" | "NEEDS_CLARIFICATION";
  idea_updated_at: Date;
  category: ProposerIdeaCategory | null;
  relation_valid: boolean;
  invalid_relation_count: number;
}

interface ExecutorAuthorityRow extends AuthorityRow {
  group_name: ExecutorProjectGroup;
}

interface PreviewRow {
  project_id: string;
  latest_progress: ExperienceProgressPreview | null;
  open_attention: ExperienceAttentionPreview[];
  latest_conclusion: ExperienceConclusionPreview | null;
  pending_confirmations: number;
}

interface DetailRow extends AuthorityRow, PreviewRow {
  progress_count: number;
  attention_count: number;
  evidence_count: number;
  conclusion_count: number;
  confirmation_count: number;
}

const toIso = (value: Date): string => value.toISOString();

const collectionPaths = (projectId: string) => ({
  project: `/api/v1/projects/${projectId}`,
  progressUpdates: `/api/v1/projects/${projectId}/progress-updates`,
  attentionItems: `/api/v1/projects/${projectId}/attention-items`,
  evidence: `/api/v1/projects/${projectId}/evidence`,
  conclusions: `/api/v1/projects/${projectId}/conclusions`,
  confirmations: `/api/v1/projects/${projectId}/human-confirmations`,
  history: `/api/v1/projects/${projectId}/history`,
});

const authority = (row: AuthorityRow): ProjectAuthorityDto => ({
  id: row.project_id,
  ideaId: row.idea_id,
  goal: row.goal,
  phase: row.phase,
  status: row.status,
  currentNextStep: row.current_next_step,
  latestProgressUpdateId: row.latest_progress_update_id,
  activeConclusionId: row.active_conclusion_id,
  completedAt: row.completed_at === null ? null : toIso(row.completed_at),
  completionKind: row.completion_kind,
  sourceIdeaVersion: row.source_idea_version,
  version: row.project_version,
  createdAt: toIso(row.project_created_at),
  updatedAt: toIso(row.project_updated_at),
});

const previewsByProjectSql = `
  SELECT project.id AS project_id,
    CASE WHEN progress.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',progress.id,'summary',progress.summary,'nextStep',progress.next_step,
      'recordedAt',to_char(progress.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) END AS latest_progress,
    coalesce(attention.items,'[]'::jsonb) AS open_attention,
    conclusion.item AS latest_conclusion,
    (
      SELECT count(*)::int FROM human_confirmations confirmation
      WHERE confirmation.project_id=project.id
        AND confirmation.decision='PENDING'
        AND confirmation.expires_at > clock_timestamp()
        AND confirmation.expected_project_version=project.version
    ) AS pending_confirmations
  FROM validation_projects project
  LEFT JOIN progress_updates progress
    ON progress.id=project.latest_progress_update_id AND progress.project_id=project.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',item.id,'type',item.type,'title',item.title,'status',item.status,
      'waitingForRole',item.waiting_for_role,
      'detailPath','/api/v1/projects/' || project.id || '/attention-items?focus=' || item.id
    ) ORDER BY item.updated_at DESC,item.id DESC) AS items
    FROM attention_items item
    WHERE item.project_id=project.id AND item.status IN ('OPEN','NEEDS_INFO')
  ) attention ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id',candidate.id,'summary',candidate.evidence_summary,
      'recommendation',candidate.recommendation,
      'confirmedAt',to_char(state.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) AS item
    FROM validation_conclusions candidate
    JOIN LATERAL (
      SELECT event.status,event.recorded_at FROM conclusion_state_events event
      WHERE event.conclusion_id=candidate.id
      ORDER BY event.recorded_at DESC,event.id DESC LIMIT 1
    ) state ON state.status='CONFIRMED'
    WHERE candidate.project_id=project.id
    ORDER BY candidate.sequence DESC,candidate.id DESC LIMIT 1
  ) conclusion ON true
  WHERE project.id=ANY($1::varchar[])
`;

const previewMap = async (
  pool: Pool,
  projectIds: readonly string[],
): Promise<Map<string, PreviewRow>> => {
  if (projectIds.length === 0) return new Map();
  const result = await pool.query<PreviewRow>(previewsByProjectSql, [
    projectIds,
  ]);
  return new Map(result.rows.map((row) => [row.project_id, row]));
};

const requirePreview = (
  previews: ReadonlyMap<string, PreviewRow>,
  projectId: string,
): PreviewRow => {
  const preview = previews.get(projectId);
  if (preview === undefined)
    throw new Error("EXPERIENCE_PROJECT_PREVIEW_INVARIANT");
  return preview;
};

export class PostgresExperienceQueryService implements ExperienceQueryService {
  constructor(private readonly pool: Pool) {}

  async listProposerIdeas(
    category: ProposerIdeaCategory | undefined,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProposerIdeaCardDto>> {
    const decoded =
      cursor === undefined ? undefined : decodeCursor(cursor, "idea");
    const result = await this.pool.query<ProposerAuthorityRow>(
      `
        WITH authority AS (
          SELECT idea.id AS idea_id,idea.version AS idea_version,
            idea.intent_summary,idea.intake_status,idea.updated_at AS idea_updated_at,
            project.id AS project_id,project.idea_id AS project_idea_id,
            project.goal,project.phase,project.status,project.current_next_step,
            project.latest_progress_update_id,project.active_conclusion_id,
            project.completed_at,project.completion_kind,project.source_idea_version,
            project.version AS project_version,project.created_at AS project_created_at,
            project.updated_at AS project_updated_at,
            CASE
              WHEN idea.project_id IS NOT NULL AND project.id=idea.project_id AND project.idea_id=idea.id
                THEN CASE WHEN project.status='QUEUED' THEN 'AWAITING_EXECUTION' ELSE project.status END
              WHEN idea.project_id IS NULL AND project.id IS NULL THEN idea.intake_status
              ELSE NULL
            END AS category,
            (
              (idea.project_id IS NULL AND project.id IS NULL)
              OR (idea.project_id IS NOT NULL AND project.id=idea.project_id AND project.idea_id=idea.id)
            ) AS relation_valid
          FROM ideas idea
          LEFT JOIN validation_projects project ON project.idea_id=idea.id
          WHERE idea.workspace_id=$1
        ), checked AS (
          SELECT authority.*,
            count(*) FILTER (WHERE NOT relation_valid OR category IS NULL) OVER ()::int
              AS invalid_relation_count
          FROM authority
        )
        SELECT * FROM checked
        WHERE ($2::text IS NULL OR category=$2)
          AND ($3::timestamptz IS NULL OR (idea_updated_at,idea_id)<($3::timestamptz,$4))
        ORDER BY idea_updated_at DESC,idea_id DESC
        LIMIT $5
      `,
      [
        WORKSPACE_ID,
        category ?? null,
        decoded?.updatedAt ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    if ((result.rows[0]?.invalid_relation_count ?? 0) > 0)
      throw new Error("EXPERIENCE_IDEA_PROJECT_RELATION_INVARIANT");
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const projectIds = rows.flatMap((row) =>
      row.project_id === null ? [] : [row.project_id],
    );
    const previews = await previewMap(this.pool, projectIds);
    const items = rows.map((row): ProposerIdeaCardDto => {
      if (row.category === null)
        throw new Error("EXPERIENCE_IDEA_CATEGORY_INVARIANT");
      const preview =
        row.project_id === null
          ? null
          : requirePreview(previews, row.project_id);
      return {
        ideaId: row.idea_id,
        ideaVersion: row.idea_version,
        intentSummary: row.intent_summary,
        intakeStatus: row.intake_status,
        category: row.category,
        updatedAt: toIso(row.idea_updated_at),
        project:
          row.project_id === null
            ? null
            : {
                id: row.project_id,
                version: row.project_version,
                status: row.status,
                phase: row.phase,
                updatedAt: toIso(row.project_updated_at),
              },
        latestProgress: preview?.latest_progress ?? null,
        currentNextStep: row.project_id === null ? null : row.current_next_step,
        waitingForProposer:
          preview?.open_attention.filter(
            (item) => item.waitingForRole === "PROPOSER",
          ) ?? [],
        latestConfirmedConclusion: preview?.latest_conclusion ?? null,
        collectionPaths:
          row.project_id === null ? null : collectionPaths(row.project_id),
      };
    });
    const last = rows.at(-1);
    return {
      items,
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({
              v: 1,
              updatedAt: toIso(last.idea_updated_at),
              id: last.idea_id,
            })
          : null,
    };
  }

  async listExecutorProjects(
    group: ExecutorProjectGroup | undefined,
    limit: number,
    cursor?: string,
  ): Promise<Page<ExecutorProjectCardDto>> {
    const decoded =
      cursor === undefined ? undefined : decodeCursor(cursor, "project");
    const result = await this.pool.query<ExecutorAuthorityRow>(
      `
        SELECT project.id AS project_id,project.idea_id,project.goal,project.phase,
          project.status,project.current_next_step,project.latest_progress_update_id,
          project.active_conclusion_id,project.completed_at,project.completion_kind,
          project.source_idea_version,project.version AS project_version,
          project.created_at AS project_created_at,project.updated_at AS project_updated_at,
          CASE WHEN project.status='COMPLETED' THEN 'COMPLETED' ELSE 'OPEN' END AS group_name
        FROM validation_projects project
        WHERE project.workspace_id=$1
          AND ($2::text IS NULL OR
            CASE WHEN project.status='COMPLETED' THEN 'COMPLETED' ELSE 'OPEN' END=$2)
          AND ($3::timestamptz IS NULL OR
            (project.updated_at,project.id)<($3::timestamptz,$4))
        ORDER BY project.updated_at DESC,project.id DESC
        LIMIT $5
      `,
      [
        WORKSPACE_ID,
        group ?? null,
        decoded?.updatedAt ?? null,
        decoded?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const previews = await previewMap(
      this.pool,
      rows.map((row) => row.project_id),
    );
    const items = rows.map((row): ExecutorProjectCardDto => {
      const preview = requirePreview(previews, row.project_id);
      return {
        projectId: row.project_id,
        ideaId: row.idea_id,
        version: row.project_version,
        status: row.status,
        phase: row.phase,
        group: row.group_name,
        goal: row.goal,
        currentNextStep: row.current_next_step,
        updatedAt: toIso(row.project_updated_at),
        latestProgress: preview.latest_progress,
        blockers: preview.open_attention.filter(
          (item) => item.type === "BLOCKER",
        ),
        pendingConfirmations: preview.pending_confirmations,
        supportRequests: preview.open_attention.filter(
          (item) => item.type === "SUPPORT_REQUEST",
        ),
        latestConclusion: preview.latest_conclusion,
        collectionPaths: collectionPaths(row.project_id),
      };
    });
    const last = rows.at(-1);
    return {
      items,
      limit,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({
              v: 1,
              updatedAt: toIso(last.project_updated_at),
              id: last.project_id,
            })
          : null,
    };
  }

  async getProjectExperience(
    projectId: string,
    view: ExperienceView,
  ): Promise<ExperienceProjectDetailDto | null> {
    const result = await this.pool.query<DetailRow>(
      `
        WITH project_detail AS (
          SELECT project.id AS project_id,project.idea_id,project.goal,project.phase,
            project.status,project.current_next_step,project.latest_progress_update_id,
            project.active_conclusion_id,project.completed_at,project.completion_kind,
            project.source_idea_version,project.version AS project_version,
            project.created_at AS project_created_at,project.updated_at AS project_updated_at,
            (SELECT count(*)::int FROM progress_updates WHERE project_id=project.id) AS progress_count,
            (SELECT count(*)::int FROM attention_items WHERE project_id=project.id) AS attention_count,
            (SELECT count(*)::int FROM evidence_items WHERE project_id=project.id) AS evidence_count,
            (SELECT count(*)::int FROM validation_conclusions WHERE project_id=project.id) AS conclusion_count,
            (SELECT count(*)::int FROM human_confirmations WHERE project_id=project.id) AS confirmation_count
          FROM validation_projects project
          WHERE project.id=$1 AND project.workspace_id=$2
        )
        SELECT detail.*,preview.latest_progress,preview.open_attention,
          preview.latest_conclusion,preview.pending_confirmations
        FROM project_detail detail
        JOIN (${previewsByProjectSql.replace("WHERE project.id=ANY($1::varchar[])", "WHERE project.id=$1")}) preview
          ON preview.project_id=detail.project_id
      `,
      [projectId, WORKSPACE_ID],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const openAttention = row.open_attention;
    const proposer = view === "PROPOSER";
    const nextAction = proposer
      ? (openAttention.find((item) => item.waitingForRole === "PROPOSER")
          ?.title ?? row.current_next_step)
      : row.current_next_step;
    return {
      view,
      authority: authority(row),
      roleSummary: {
        headline: proposer ? row.goal : `${row.phase} · ${row.status}`,
        nextAction,
        attentionLabel: proposer
          ? `${openAttention.filter((item) => item.waitingForRole === "PROPOSER").length} 项等待提议者`
          : `${openAttention.length} 项执行关注`,
      },
      previewCounts: {
        progressUpdates: row.progress_count,
        attentionItems: row.attention_count,
        evidence: row.evidence_count,
        conclusions: row.conclusion_count,
        confirmations: row.confirmation_count,
      },
      latestProgress: row.latest_progress,
      attentionPreview: proposer
        ? openAttention
            .filter((item) => item.waitingForRole === "PROPOSER")
            .slice(0, 10)
        : openAttention.slice(0, 10),
      latestConclusion: row.latest_conclusion,
      collectionPaths: collectionPaths(projectId),
      reportPath: `/api/v1/projects/${projectId}/reports/current`,
    };
  }
}
