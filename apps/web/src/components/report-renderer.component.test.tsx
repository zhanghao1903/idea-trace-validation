import type { ReportCurrentDto, ReportRenderSlotDto } from "@idea/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportDynamicRegion } from "./report-renderer.js";

const slot = (revision: number): ReportRenderSlotDto => ({
  revision,
  schemaVersion: "1.0",
  compilerVersion: "lp03-report-compiler/1",
  contentSha256: "a".repeat(64),
  acceptedAt: "2026-07-31T10:00:00.000Z",
  renderModel: {
    schemaVersion: "1.0",
    locale: "zh-CN",
    title: `安全报告 r${revision}`,
    summary: "七类通用块",
    sections: [
      {
        id: "overview",
        title: "概览",
        description: null,
        blocks: [
          {
            id: "text",
            type: "text",
            content: [
              {
                type: "paragraph",
                children: [
                  { type: "text", value: "<script>不是脚本</script>" },
                  {
                    type: "strong",
                    children: [{ type: "text", value: "重点" }],
                  },
                  {
                    type: "link",
                    href: "https://example.com/",
                    children: [{ type: "text", value: "安全链接" }],
                  },
                ],
              },
            ],
          },
          {
            id: "metrics",
            type: "metrics",
            items: [{ label: "访谈", value: 12, unit: "次" }],
          },
          {
            id: "list",
            type: "list",
            ordered: false,
            items: [{ title: "验证假设", detail: "用户愿意付费" }],
          },
          {
            id: "table",
            type: "table",
            columns: [{ key: "signal", label: "信号" }],
            rows: [{ id: "row", cells: { signal: "正向" } }],
          },
          {
            id: "timeline",
            type: "timeline",
            items: [{ date: "2026-07-31", title: "完成访谈", status: "done" }],
          },
          {
            id: "evidence",
            type: "evidence_refs",
            evidenceIds: ["evd_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
          },
          {
            id: "action",
            type: "action_refs",
            attentionItemIds: ["attn_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
          },
        ],
      },
    ],
  },
  hydratedRefs: {
    evidence: [
      {
        id: "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        kind: "NOTE",
        title: "访谈记录",
        summary: "权威证据",
        state: "ACTIVE",
        detailPath: "/api/evidence",
        historyPath: "/api/evidence/history",
      },
    ],
    attentionItems: [
      {
        id: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        type: "BLOCKER",
        title: "解决访问",
        status: "OPEN",
        waitingForRole: "EXECUTOR",
        detailPath: "/api/attention",
        historyPath: "/api/attention/history",
      },
    ],
  },
});

const report = (
  primary: ReportRenderSlotDto | null,
  fallback: ReportRenderSlotDto | null,
): ReportCurrentDto => ({
  projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  reportId: "rpt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  displayMode: primary === null ? "UNSUPPORTED" : "CURRENT",
  accepted: null,
  primary,
  runtimeFallback: fallback,
  compatibilityCode: primary === null ? "REPORT_SCHEMA_UNSUPPORTED" : null,
});

afterEach(cleanup);

describe("safe generic report renderer", () => {
  it("renders all seven fixed block types without executable DOM", () => {
    const view = render(
      <ReportDynamicRegion report={report(slot(2), slot(1))} />,
    );
    expect(screen.getByText("<script>不是脚本</script>")).toBeVisible();
    expect(view.container.querySelector("script")).toBeNull();
    expect(screen.getByText("访谈")).toBeVisible();
    expect(screen.getByText("验证假设")).toBeVisible();
    expect(screen.getByRole("table", { name: "结构化报告表格" })).toBeVisible();
    expect(screen.getByText("完成访谈")).toBeVisible();
    expect(screen.getByText("访谈记录")).toBeVisible();
    expect(screen.getByText("解决访问")).toBeVisible();
    expect(screen.getByRole("link", { name: "安全链接" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("contains a primary exception and renders the independently hydrated fallback", () => {
    const broken = slot(2) as unknown as {
      renderModel: { sections: { blocks: unknown[] }[] };
    };
    broken.renderModel.sections[0]?.blocks.splice(0, 1, {
      id: "bad",
      type: "unknown",
    });
    render(
      <ReportDynamicRegion
        report={report(broken as unknown as ReportRenderSlotDto, slot(1))}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "REPORT_RENDER_RUNTIME_FAILED",
    );
    expect(
      screen.getByText("正在显示独立补全的回退 revision 1。"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "安全报告 r1" })).toBeVisible();
  });

  it("keeps a safe empty dynamic state when runtime fallback is absent", () => {
    const broken = slot(2) as unknown as {
      renderModel: { sections: { blocks: unknown[] }[] };
    };
    broken.renderModel.sections[0]?.blocks.splice(0, 1, {
      id: "bad",
      type: "unknown",
    });
    render(
      <ReportDynamicRegion
        report={report(broken as unknown as ReportRenderSlotDto, null)}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "没有可安全显示的历史汇报",
    );
  });
});
