import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryUrl = new URL("../../../", import.meta.url);
const readRepositoryFile = (path: string) =>
  readFile(new URL(path, repositoryUrl), "utf8");

describe("LP3-AC-015 management projection", () => {
  it("records exact accepted dependencies and objective LP-03 readiness", async () => {
    const [management, lp01, lp02, lp03] = await Promise.all([
      readRepositoryFile("docs/project-management.md"),
      readRepositoryFile(
        "docs/implementation-plans/v0-1/lp-01-core-idea-flow.md",
      ),
      readRepositoryFile(
        "docs/implementation-plans/v0-1/lp-02-execution-decisions.md",
      ),
      readRepositoryFile(
        "docs/implementation-plans/v0-1/lp-03-reporting-role-experience.md",
      ),
    ]);

    for (const carrier of [management, lp01]) {
      expect(carrier).toContain("Accepted");
      expect(carrier).toContain("ACCEPTED_NO_PUBLISH");
      expect(carrier).toContain("b562a3c0ede8384afef2007b8057a1250650a39f");
      expect(carrier).toContain(
        "35d19b6c45c96c037c011b8c0f371ebfd454ff4b762492e70e6dc98e0ee9ef4a",
      );
      expect(carrier).toContain(
        "82e0fb86b20b1f82e04d6ec4aa53a094e8cc32ea8ad3a7dfed3d2258ccb5188d",
      );
    }
    expect(management).toContain("releaseTargets: `[]`");
    expect(lp01).toContain("Release artifacts: `None`");
    for (const carrier of [management, lp02]) {
      expect(carrier).toContain("Accepted");
      expect(carrier).toContain("ACCEPTED_NO_PUBLISH");
      expect(carrier).toContain("644af4f186b054a9c5d1c6db087a97e009f545a3");
      expect(carrier).toContain(
        "b63ec86101008217bfa6eab6bbeda41713735e7099b051a2a7e21f3026321cba",
      );
      expect(carrier).toContain(
        "418d1de3689d1bef9a1ce3ee2abf88cb3e44cd1976dc3ec40c2e15f7b63d5061",
      );
      expect(carrier).toContain("`[]`");
    }
    expect(lp02).toContain(
      "../../feature/lp-02-execution-decisions/verification.md",
    );
    expect(management).toContain("LP-03");
    expect(management).toContain("Ready for Acceptance");
    expect(lp03).toContain("`Ready for Acceptance`");
    expect(lp03).toContain(
      "../../feature/lp-03-reporting-role-experience/verification.md",
    );
    expect(lp03).not.toContain("`Accepted`");
    expect(management).toContain("LP-04");
    expect(management).toContain("Not Started");
  });

  it("keeps every management and evidence link target present", async () => {
    const paths = [
      "docs/feature/lp-01-core-idea-flow/verification.md",
      "docs/feature/lp-02-execution-decisions/verification.md",
      "docs/feature/lp-03-reporting-role-experience/verification.md",
      "docs/implementation-plans/v0-1/lp-01-core-idea-flow.md",
      "docs/implementation-plans/v0-1/lp-02-execution-decisions.md",
      "docs/implementation-plans/v0-1/lp-03-reporting-role-experience.md",
      "openapi/lp01.v1.json",
      "openapi/lp02.v1.json",
      "openapi/lp03.v1.json",
    ];
    await expect(
      Promise.all(paths.map((path) => access(new URL(path, repositoryUrl)))),
    ).resolves.toBeDefined();
  });
});
