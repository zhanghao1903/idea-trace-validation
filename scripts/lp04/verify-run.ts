import { execFileSync } from "node:child_process";
import path from "node:path";

import { normalizeLoopbackOrigin } from "./environment.js";
import { readJson } from "./http-client.js";
import {
  listJournalEntries,
  unresolvedJournalEntries,
} from "./request-journal.js";
import { readRunRecord } from "./run-record.js";
import { assertSanitizedEvidence } from "./security.js";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

export const verifyRun = async (input: {
  repoRoot: string;
  proofRoot: string;
  runId: string;
  baseOrigin: string;
  skillCommitSha: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{ requestCount: number; resourceCount: number }> => {
  const record = await readRunRecord(input.proofRoot, input.runId);
  if (
    record.baseOrigin !== input.baseOrigin ||
    record.skillCommitSha !== input.skillCommitSha ||
    record.phase !== "VERIFIED" ||
    record.result !== "PASS" ||
    record.assertions.some((assertion) => assertion.result !== "PASS")
  )
    throw new Error("RUN_NOT_VERIFIED");
  execFileSync(
    "git",
    [
      "cat-file",
      "-e",
      `${input.skillCommitSha}:skills/idea-validation-workflow/SKILL.md`,
    ],
    { cwd: input.repoRoot, stdio: "ignore" },
  );
  const unresolved = await unresolvedJournalEntries(
    input.proofRoot,
    input.runId,
  );
  if (unresolved.length > 0) throw new Error("RUN_UNRESOLVED_JOURNAL");
  const entries = (await listJournalEntries(input.proofRoot, input.runId)).map(
    ({ entry }) => entry,
  );
  if (entries.length !== record.requestTrace.length)
    throw new Error("RUN_TRACE_COUNT");
  for (const entry of entries) {
    if (
      entry.runId !== record.runId ||
      entry.manifestSha256 !== record.manifestSha256 ||
      entry.skillCommitSha !== record.skillCommitSha ||
      !record.requestTrace.some(
        (trace) =>
          trace.stepId === entry.stepId &&
          trace.bodySha256 === entry.bodySha256 &&
          trace.idempotencyKeySha256 === entry.idempotencyKeySha256,
      )
    )
      throw new Error(`RUN_TRACE_DRIFT:${entry.stepId}`);
  }
  for (const [name, id] of Object.entries(record.resourceRefs)) {
    const resourcePath = name.endsWith("IdeaId")
      ? `/api/v1/ideas/${id}`
      : name.endsWith("ProjectId")
        ? `/api/v1/projects/${id}`
        : null;
    if (resourcePath === null) continue;
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: resourcePath,
      fetchImpl: input.fetchImpl,
    });
    if (response.status !== 200 || !JSON.stringify(response.json).includes(id))
      throw new Error(`RUN_RESOURCE_MISSING:${name}`);
  }
  assertSanitizedEvidence(record);
  return {
    requestCount: entries.length,
    resourceCount: Object.keys(record.resourceRefs).length,
  };
};

if (process.argv[1]?.endsWith("verify-run.ts") === true) {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const baseOrigin = normalizeLoopbackOrigin(argument("--base-url"));
  const result = await verifyRun({
    repoRoot,
    proofRoot: path.join(repoRoot, ".lp04-demo"),
    runId: argument("--run-id"),
    baseOrigin,
    skillCommitSha: argument("--skill-commit"),
  });
  console.log(JSON.stringify({ result: "PASS", ...result }));
}
