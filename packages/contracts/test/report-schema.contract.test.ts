import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const schemaUrl = new URL(
  "../schemas/structured-report.v1.schema.json",
  import.meta.url,
);
const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const validReport = {
  schemaVersion: "1.0",
  projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  clientRequestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  basedOnRevision: 0,
  locale: "zh-CN",
  title: "验证报告",
  sections: [
    {
      id: "overview",
      title: "概览",
      blocks: [
        {
          id: "overview_text",
          type: "text",
          markdown: "A presentation-only report fixture.",
        },
      ],
    },
  ],
};

describe("structured report canonical schema", () => {
  it("accepts the representative valid fixture", () => {
    expect(validate(validReport), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects unknown properties and missing required content", () => {
    expect(validate({ ...validReport, secret: "must-not-be-accepted" })).toBe(
      false,
    );
    expect(validate({ schemaVersion: "1.0" })).toBe(false);
  });

  it("accepts the implemented evd_ prefix and rejects the obsolete evi_ prefix", () => {
    const withEvidence = {
      ...validReport,
      sections: [
        {
          id: "evidence",
          title: "Evidence",
          blocks: [
            {
              id: "evidence_refs",
              type: "evidence_refs",
              evidenceIds: ["evd_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
            },
          ],
        },
      ],
    };
    expect(validate(withEvidence), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...withEvidence,
        sections: [
          {
            ...withEvidence.sections[0],
            blocks: [
              {
                ...withEvidence.sections[0]!.blocks[0],
                evidenceIds: ["evi_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("enforces the collection bounds for every fixed block family", () => {
    const cases = [
      { type: "metrics", field: "items", value: [] },
      { type: "list", field: "items", value: [], ordered: false },
      { type: "table", field: "columns", value: [], rows: [] },
      { type: "timeline", field: "items", value: [] },
      { type: "evidence_refs", field: "evidenceIds", value: [] },
      { type: "action_refs", field: "attentionItemIds", value: [] },
    ];
    for (const sample of cases) {
      const { field, value, ...block } = sample;
      expect(
        validate({
          ...validReport,
          sections: [
            {
              id: "bounds",
              title: "Bounds",
              blocks: [{ id: "bounded_block", ...block, [field]: value }],
            },
          ],
        }),
        `${sample.type} unexpectedly passed`,
      ).toBe(false);
    }
  });
});
