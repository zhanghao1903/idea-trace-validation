import type { Page, Route } from "@playwright/test";
import type { ReportCurrentDto, ReportRenderSlotDto } from "@idea/contracts";

export const ids = {
  idea: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  project: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  evidence: "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  attention: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  confirmation: "confirm_01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

export const success = (data: unknown) => ({
  ok: true,
  data,
  meta: { requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
});

export const fulfillJson = async (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });

export const paths = {
  project: `/api/v1/projects/${ids.project}`,
  progressUpdates: `/api/v1/projects/${ids.project}/progress-updates`,
  attentionItems: `/api/v1/projects/${ids.project}/attention-items`,
  evidence: `/api/v1/projects/${ids.project}/evidence`,
  conclusions: `/api/v1/projects/${ids.project}/conclusions`,
  confirmations: `/api/v1/projects/${ids.project}/history`,
  history: `/api/v1/projects/${ids.project}/history`,
};

export const projectDetail = {
  view: "PROPOSER",
  authority: {
    id: ids.project,
    ideaId: ids.idea,
    goal: "验证两周内的创始人决策闭环",
    phase: "VALIDATING",
    status: "IN_PROGRESS",
    currentNextStep: "完成五次付费意愿访谈",
    latestProgressUpdateId: "prog_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    activeConclusionId: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    completedAt: null,
    completionKind: null,
    sourceIdeaVersion: 2,
    version: 8,
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-31T08:00:00.000Z",
  },
  roleSummary: {
    headline: "验证两周内的创始人决策闭环",
    nextAction: "决定是否扩大访谈样本",
    attentionLabel: "1 项等待提议者",
  },
  previewCounts: {
    progressUpdates: 2,
    attentionItems: 1,
    evidence: 3,
    conclusions: 1,
    confirmations: 1,
  },
  latestProgress: {
    id: "prog_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    summary: "已完成首轮访谈",
    nextStep: "完成五次付费意愿访谈",
    recordedAt: "2026-07-31T08:00:00.000Z",
  },
  attentionPreview: [
    {
      id: ids.attention,
      type: "DECISION_REQUEST",
      title: "是否扩大样本",
      status: "OPEN",
      waitingForRole: "PROPOSER",
      detailPath: paths.attentionItems,
    },
  ],
  latestConclusion: {
    id: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    summary: "现有证据支持继续",
    recommendation: "CONTINUE",
    confirmedAt: "2026-07-31T08:00:00.000Z",
  },
  collectionPaths: paths,
  reportPath: `/api/v1/projects/${ids.project}/reports/current`,
};

const slot = (revision: number): ReportRenderSlotDto => ({
  revision,
  schemaVersion: "1.0",
  compilerVersion: "lp03-report-compiler/1",
  contentSha256: "a".repeat(64),
  acceptedAt: "2026-07-31T08:00:00.000Z",
  renderModel: {
    schemaVersion: "1.0",
    locale: "zh-CN",
    title: revision === 2 ? "证据优先验证报告" : "历史安全报告",
    summary: "相同通用渲染器覆盖不同结构。",
    sections: [
      {
        id: "signals",
        title: "关键信号",
        description: "按服务端顺序展示",
        blocks: [
          {
            id: "text",
            type: "text",
            content: [
              {
                type: "paragraph",
                children: [
                  { type: "text", value: "访谈证据已安全编译为文本。" },
                  {
                    type: "strong",
                    children: [{ type: "text", value: "证据可信" }],
                  },
                ],
              },
            ],
          },
          {
            id: "metrics",
            type: "metrics",
            items: [{ label: "访谈", value: 5, unit: "次" }],
          },
          {
            id: "list",
            type: "list",
            ordered: false,
            items: [{ title: "下一步", detail: "扩大样本" }],
          },
          {
            id: "table",
            type: "table",
            columns: [{ key: "signal", label: "信号" }],
            rows: [{ id: "row", cells: { signal: "愿意付费" } }],
          },
          {
            id: "timeline",
            type: "timeline",
            items: [{ date: "2026-07-31", title: "首轮访谈", status: "done" }],
          },
          {
            id: "evidence",
            type: "evidence_refs",
            evidenceIds: [ids.evidence],
          },
          {
            id: "actions",
            type: "action_refs",
            attentionItemIds: [ids.attention],
          },
        ],
      },
    ],
  },
  hydratedRefs: {
    evidence: [
      {
        id: ids.evidence,
        kind: "NOTE",
        title: "访谈记录",
        summary: "权威补全",
        state: "ACTIVE",
        detailPath: paths.evidence,
        historyPath: paths.evidence,
      },
    ],
    attentionItems: [
      {
        id: ids.attention,
        type: "DECISION_REQUEST",
        title: "是否扩大样本",
        status: "OPEN",
        waitingForRole: "PROPOSER",
        detailPath: paths.attentionItems,
        historyPath: paths.attentionItems,
      },
    ],
  },
});

export const reportCurrent: ReportCurrentDto = {
  projectId: ids.project,
  reportId: "rpt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  displayMode: "CURRENT",
  accepted: null,
  primary: slot(2),
  runtimeFallback: slot(1),
  compatibilityCode: null,
};

export const installProjectRoutes = async (
  page: Page,
  report = reportCurrent,
) => {
  await page.route("**/api/v1/experience/projects/**", (route) =>
    fulfillJson(route, success(projectDetail)),
  );
  await page.route("**/api/v1/projects/*/reports/current", (route) =>
    fulfillJson(route, success(report)),
  );
};
