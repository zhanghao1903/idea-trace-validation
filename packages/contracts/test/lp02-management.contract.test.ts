import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryUrl = new URL("../../../", import.meta.url);
const readRepositoryFile = (path: string) =>
  readFile(new URL(path, repositoryUrl), "utf8");

describe("v0.1 management projection", () => {
  it("records exact accepted dependencies and truthful LP-04 progress", async () => {
    const [management, lp01, lp02, lp03, lp04] = await Promise.all([
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
      readRepositoryFile(
        "docs/implementation-plans/v0-1/lp-04-ai-skill-demo.md",
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
    for (const carrier of [management, lp03]) {
      expect(carrier).toContain("Accepted");
      expect(carrier).toContain("ACCEPTED_NO_PUBLISH");
      expect(carrier).toContain("818671c504c8b8b8cd41f8ebc096f341ece6b18f");
      expect(carrier).toContain(
        "7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8b",
      );
      expect(carrier).toContain(
        "25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8",
      );
      expect(carrier).toContain("`[]`");
    }
    expect(lp03).toContain(
      "../../feature/lp-03-reporting-role-experience/verification.md",
    );
    expect(management).toContain("LP-04");
    expect(management).toContain("In Progress");
    expect(lp04).toContain("`In Progress`");
    expect(lp04).toContain("Result: `None`");
    expect(management).toContain("Not Started");
  });

  it("keeps every management and evidence link target present", async () => {
    const paths = [
      "docs/feature/lp-01-core-idea-flow/verification.md",
      "docs/feature/lp-02-execution-decisions/verification.md",
      "docs/feature/lp-03-reporting-role-experience/verification.md",
      "docs/feature/lp-04-ai-skill-demo/verification.md",
      "docs/demo/lp04.md",
      "docs/implementation-plans/v0-1/lp-01-core-idea-flow.md",
      "docs/implementation-plans/v0-1/lp-02-execution-decisions.md",
      "docs/implementation-plans/v0-1/lp-03-reporting-role-experience.md",
      "docs/implementation-plans/v0-1/lp-04-ai-skill-demo.md",
      "openapi/lp01.v1.json",
      "openapi/lp02.v1.json",
      "openapi/lp03.v1.json",
    ];
    await expect(
      Promise.all(paths.map((path) => access(new URL(path, repositoryUrl)))),
    ).resolves.toBeDefined();
  });
});
