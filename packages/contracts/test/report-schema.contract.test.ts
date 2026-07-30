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
});
