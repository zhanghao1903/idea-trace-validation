import Schema from "typebox/schema";
import { describe, expect, it } from "vitest";

import {
  ReportCurrentDtoSchema,
  ReportSubmissionRouteSchema,
  SafeInlineTokenSchema,
  SafeReportRenderModelSchema,
} from "../src/index.js";

const projectId = "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("LP-03 report API contracts", () => {
  it("binds report submission to AI write security and a strict source document", () => {
    expect(ReportSubmissionRouteSchema.security).toEqual([{ aiWrite: [] }]);
    const body = Schema.Compile(ReportSubmissionRouteSchema.body);
    expect(
      body.Check({
        schemaVersion: "1.0",
        projectId,
        clientRequestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        basedOnRevision: 0,
        locale: "zh-CN",
        title: "报告",
        sections: [
          {
            id: "overview",
            title: "概览",
            blocks: [{ id: "summary", type: "text", markdown: "安全文本" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("keeps accepted, primary and runtimeFallback independent and closed", () => {
    const current = Schema.Compile(ReportCurrentDtoSchema);
    const empty = {
      projectId,
      reportId: null,
      displayMode: "EMPTY",
      accepted: null,
      primary: null,
      runtimeFallback: null,
      compatibilityCode: null,
    };
    expect(current.Check(empty)).toBe(true);
    expect(current.Check({ ...empty, unexpected: true })).toBe(false);
  });

  it("accepts only the seven safe render block discriminants", () => {
    const renderModel = Schema.Compile(
      { SafeInlineToken: SafeInlineTokenSchema },
      SafeReportRenderModelSchema,
    );
    const base = {
      schemaVersion: "1.0",
      locale: "zh-CN",
      title: "报告",
      summary: null,
      sections: [
        { id: "overview", title: "概览", description: null, blocks: [] },
      ],
    };
    expect(renderModel.Check(base)).toBe(true);
    expect(
      renderModel.Check({
        ...base,
        sections: [
          {
            ...base.sections[0],
            blocks: [{ id: "custom", type: "component", component: "Admin" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("closes safe inline tokens recursively at every nesting depth", () => {
    const renderModel = Schema.Compile(
      { SafeInlineToken: SafeInlineTokenSchema },
      SafeReportRenderModelSchema,
    );
    const base = {
      schemaVersion: "1.0",
      locale: "zh-CN",
      title: "报告",
      summary: null,
      sections: [
        { id: "overview", title: "概览", description: null, blocks: [] },
      ],
    };
    const validDeepNesting = {
      ...base,
      sections: [
        {
          ...base.sections[0],
          blocks: [
            {
              id: "nested",
              type: "text",
              content: [
                {
                  type: "paragraph",
                  children: [
                    {
                      type: "strong",
                      children: [
                        {
                          type: "emphasis",
                          children: [
                            {
                              type: "link",
                              href: "https://example.test/evidence",
                              children: [{ type: "text", value: "证据" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "list",
                  ordered: false,
                  items: [[{ type: "inline_code", value: "safe" }]],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(renderModel.Check(validDeepNesting)).toBe(true);

    const unsafeNestedLink = structuredClone(validDeepNesting);
    unsafeNestedLink.sections[0]!.blocks[0]!.content[0]!.children[0]!.children[0]!.children[0]!.href =
      "javascript:alert(1)";
    expect(renderModel.Check(unsafeNestedLink)).toBe(false);

    const unknownNestedToken = structuredClone(validDeepNesting);
    unknownNestedToken.sections[0]!.blocks[0]!.content[1]!.items[0] = [
      { type: "html", value: "<img src=x onerror=alert(1)>" },
    ];
    expect(renderModel.Check(unknownNestedToken)).toBe(false);
  });
});
