import path from "node:path";

import { loadDemoEnvironment } from "../environment.js";
import { createPreparedEntry, writeJournalEntry } from "../request-journal.js";
import {
  createRunRecord,
  transitionRunRecord,
  writeRunRecord,
} from "../run-record.js";
import { ideaRequestBody, loadScenarioAssets } from "../scenario.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new Error(`${name}_REQUIRED`);
  return value;
};

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const proofRoot = required("LP04_PROOF_ROOT");
const environment = loadDemoEnvironment({
  baseUrl: required("LP04_BASE_URL"),
  runId: required("LP04_RUN_ID"),
  skillCommitSha: required("LP04_SKILL_COMMIT"),
});
const assets = await loadScenarioAssets(repoRoot);
const idea = assets.manifest.ideas.find(
  (candidate) => candidate.key === "clarification",
);
if (idea === undefined) throw new Error("CLARIFICATION_FIXTURE_MISSING");
const record = transitionRunRecord(
  createRunRecord({
    runId: environment.runId,
    manifestSha256: assets.manifestSha256,
    skillCommitSha: environment.skillCommitSha,
    baseOrigin: environment.baseOrigin,
  }),
  "PREFLIGHT_PASSED",
);
await writeRunRecord(proofRoot, record);
await writeJournalEntry(
  proofRoot,
  createPreparedEntry({
    runId: environment.runId,
    stepId: "create-clarification-idea",
    semanticAttempt: 0,
    path: "/api/v1/ideas",
    body: ideaRequestBody(idea, assets.manifest.actors),
    manifestSha256: assets.manifestSha256,
    skillCommitSha: environment.skillCommitSha,
  }),
);
process.exitCode = 86;
