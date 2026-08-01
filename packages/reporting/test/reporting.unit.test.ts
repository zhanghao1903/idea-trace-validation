import type { StructuredReportV1 } from "@idea/contracts";
import { describe, expect, it } from "vitest";

import {
  compileReportView,
  reportContentDigest,
  validateStructuredReport,
} from "../src/index.js";

const projectId = "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const evidenceId = "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const attentionId = "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV";

const report = (): StructuredReportV1 => ({
  schemaVersion: "1.0",
  projectId,
  clientRequestId: requestId,
  basedOnRevision: 0,
  locale: "zh-CN",
  title: "项目验证汇报",
  summary: "权威事实之外的展示摘要",
  generator: { name: "LP-03 fixture", version: "1.0" },
  sections: [
    {
      id: "overview",
      title: "概览",
      blocks: [
        {
          id: "narrative",
          type: "text",
          markdown:
            "**已验证**，参见 [公开资料](https://example.test/evidence)。\n\n- 第一项\n- 第二项",
        },
        {
          id: "metrics",
          type: "metrics",
          items: [
            {
              id: "conversion",
              label: "转化率",
              value: 0.42,
              unit: "%",
              trend: "up",
            },
          ],
        },
        {
          id: "checks",
          type: "list",
          ordered: false,
          items: [{ id: "first_check", text: "完成访谈", checked: true }],
        },
        {
          id: "comparison",
          type: "table",
          columns: [
            { key: "option", label: "方案" },
            { key: "score", label: "评分", align: "end" },
          ],
          rows: [{ id: "option_a", cells: { option: "A", score: 9 } }],
        },
        {
          id: "events",
          type: "timeline",
          items: [
            {
              id: "first_signal",
              title: "获得首个信号",
              happenedAt: "2026-07-31T10:00:00.000Z",
              evidenceIds: [evidenceId],
            },
          ],
        },
        { id: "evidence", type: "evidence_refs", evidenceIds: [evidenceId] },
        {
          id: "actions",
          type: "action_refs",
          attentionItemIds: [attentionId],
        },
      ],
    },
  ],
});

describe("structured report validation and compilation", () => {
  it("accepts all seven block types and preserves their order in a frozen model", () => {
    const result = validateStructuredReport(report());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const model = compileReportView(result.document);
    expect(model.sections[0]?.blocks.map((block) => block.type)).toEqual([
      "text",
      "metrics",
      "list",
      "table",
      "timeline",
      "evidence_refs",
      "action_refs",
    ]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
    expect(Object.isFrozen(model.sections[0]?.blocks)).toBe(true);
  });

  it("excludes only clientRequestId from the canonical business digest", () => {
    const original = report();
    expect(
      reportContentDigest({
        ...original,
        clientRequestId: "req_DIFFERENT_ID_12345",
      }),
    ).toBe(reportContentDigest(original));
    expect(reportContentDigest({ ...original, title: "另一份汇报" })).not.toBe(
      reportContentDigest(original),
    );
    expect(reportContentDigest({ title: "same", basedOnRevision: 0 })).toBe(
      reportContentDigest({ basedOnRevision: 0, title: "same" }),
    );
  });

  it.each([
    "<script>alert(1)</script>",
    "![remote](https://example.test/image.png)",
    "```js\nalert(1)\n```",
    "[plain HTTP](http://example.test)",
    "[userinfo](https://user:secret@example.test)",
    "[script](javascript:alert(1))",
    "${dangerousTemplate}",
  ])("rejects unsafe Markdown without echoing it: %s", (markdown) => {
    const input = report();
    const block = input.sections[0]?.blocks[0];
    if (block?.type === "text") block.markdown = markdown;
    const result = validateStructuredReport(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("REPORT_UNSAFE_CONTENT");
    expect(JSON.stringify(result.issues)).not.toContain(markdown);
  });

  it("rejects semantic duplicates, malformed tables, blanks, and non-finite numbers", () => {
    const input = report();
    input.title = "   ";
    const blocks = input.sections[0]?.blocks;
    if (!blocks) throw new Error("Fixture sections missing");
    blocks[1]!.id = blocks[0]!.id;
    const metrics = blocks[1];
    if (metrics.type === "metrics") metrics.items[0]!.value = Number.NaN;
    const table = blocks[3];
    if (table.type === "table") table.rows[0]!.cells = { option: "A" };

    const result = validateStructuredReport(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "BLANK_STRING",
        "DUPLICATE_REPORT_ID",
        "METRIC_NOT_FINITE",
        "TABLE_CELLS_MISMATCH",
      ]),
    );
  });

  it("returns stable sorted pointers and caps schema issues at fifty", () => {
    const invalid: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`unknown${index}`, true]),
    );
    const result = validateStructuredReport(invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(50);
    expect(result.issues).toEqual(
      [...result.issues].sort((left, right) =>
        left.path === right.path
          ? left.code.localeCompare(right.code)
          : left.path.localeCompare(right.path),
      ),
    );
    expect(
      result.issues.every((issue) => !JSON.stringify(issue).includes("true")),
    ).toBe(true);
  });

  it("distinguishes unsupported schemas from invalid supported documents", () => {
    const result = validateStructuredReport({
      ...report(),
      schemaVersion: "2.0",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "REPORT_SCHEMA_UNSUPPORTED",
      issues: [{ path: "/schemaVersion" }],
    });
  });
});
