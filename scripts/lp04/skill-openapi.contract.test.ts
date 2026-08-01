import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkSkill } from "./check-skill.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const skillRoot = path.join(repoRoot, "skills/idea-validation-workflow");

describe("LP-04 Skill canonical contract", () => {
  it("references only routes and stable errors present in LP-03 OpenAPI", () => {
    expect(checkSkill({ repoRoot, skillRoot })).toEqual([]);
  });

  it("keeps canonical API and report artifacts as explicit authorities", () => {
    const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    expect(skill).toContain("../../openapi/lp03.v1.json");
    expect(skill).toContain(
      "../../packages/contracts/schemas/structured-report.v1.schema.json",
    );
    expect(skill).not.toContain("additionalProperties");
  });
});
