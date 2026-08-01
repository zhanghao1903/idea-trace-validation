import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClientValidationRecordV1 } from "./contracts.js";
import { normalizeLoopbackOrigin } from "./environment.js";
import { readJson } from "./http-client.js";
import { sha256 } from "./request-identity.js";
import { assertSanitizedEvidence } from "./security.js";

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const bounded = (value: unknown, code: string, maximum = 2_000): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum)
    throw new Error(code);
  return value;
};

export const parseClientValidationRecord = (
  value: unknown,
): ClientValidationRecordV1 => {
  const input = object(value, "CLIENT_EVIDENCE_OBJECT");
  const exact = [
    "schemaVersion",
    "client",
    "clientVersion",
    "executionMode",
    "observedBy",
    "skillCommitSha",
    "runId",
    "inputIntent",
    "startedAt",
    "finishedAt",
    "rawTranscriptSha256",
    "requestIds",
    "resourceRefs",
    "webPaths",
    "objectiveChecks",
    "result",
    "evidenceSha256",
  ];
  if (Object.keys(input).some((key) => !exact.includes(key)))
    throw new Error("CLIENT_EVIDENCE_FIELD");
  if (
    input.schemaVersion !== "1.0" ||
    (input.client !== "CODEX" && input.client !== "CLAUDE") ||
    (input.executionMode !== "CLI" && input.executionMode !== "DESKTOP") ||
    input.result !== "PASS" ||
    typeof input.skillCommitSha !== "string" ||
    !/^[a-f0-9]{40}$/u.test(input.skillCommitSha) ||
    typeof input.runId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(input.runId) ||
    typeof input.inputIntent !== "string" ||
    !input.inputIntent.includes("SYNTHETIC_DEMO_DATA") ||
    typeof input.startedAt !== "string" ||
    typeof input.finishedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(input.startedAt) ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(input.finishedAt) ||
    Date.parse(input.finishedAt) < Date.parse(input.startedAt) ||
    typeof input.rawTranscriptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.rawTranscriptSha256) ||
    typeof input.evidenceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.evidenceSha256) ||
    !Array.isArray(input.requestIds) ||
    input.requestIds.length === 0 ||
    input.requestIds.length > 100 ||
    input.requestIds.some(
      (id) =>
        typeof id !== "string" || !/^req_[0-9A-HJKMNP-TV-Z]{26}$/u.test(id),
    ) ||
    new Set(input.requestIds).size !== input.requestIds.length ||
    !Array.isArray(input.webPaths) ||
    input.webPaths.length === 0 ||
    input.webPaths.length > 20 ||
    input.webPaths.some(
      (item) =>
        typeof item !== "string" ||
        !item.startsWith("/") ||
        item.includes("://") ||
        /(?:token|cookie|authorization)=/iu.test(item),
    ) ||
    !Array.isArray(input.objectiveChecks) ||
    input.objectiveChecks.length === 0 ||
    input.objectiveChecks.length > 30
  )
    throw new Error("CLIENT_EVIDENCE_VALUE");
  const resourceInput = object(input.resourceRefs, "CLIENT_EVIDENCE_REFS");
  const resourceRefs: Record<string, string> = {};
  for (const [key, resource] of Object.entries(resourceInput)) {
    if (
      !/^[a-z][A-Za-z0-9]{1,40}$/u.test(key) ||
      typeof resource !== "string" ||
      !/^(?:idea|proj|rpt)_[0-9A-Za-z]{10,64}$/u.test(resource)
    )
      throw new Error("CLIENT_EVIDENCE_REF");
    resourceRefs[key] = resource;
  }
  if (Object.keys(resourceRefs).length === 0)
    throw new Error("CLIENT_EVIDENCE_REFS");
  const objectiveChecks = input.objectiveChecks.map((value) => {
    const check = object(value, "CLIENT_EVIDENCE_CHECK");
    if (
      Object.keys(check).some((key) => key !== "id" && key !== "result") ||
      check.result !== "PASS"
    )
      throw new Error("CLIENT_EVIDENCE_CHECK");
    return {
      id: bounded(check.id, "CLIENT_EVIDENCE_CHECK", 120),
      result: "PASS" as const,
    };
  });
  const record: ClientValidationRecordV1 = {
    schemaVersion: "1.0",
    client: input.client,
    clientVersion: bounded(input.clientVersion, "CLIENT_EVIDENCE_VERSION", 120),
    executionMode: input.executionMode,
    observedBy: bounded(input.observedBy, "CLIENT_EVIDENCE_OBSERVER", 120),
    skillCommitSha: input.skillCommitSha,
    runId: input.runId,
    inputIntent: bounded(input.inputIntent, "CLIENT_EVIDENCE_INTENT"),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    rawTranscriptSha256: input.rawTranscriptSha256,
    requestIds: input.requestIds as string[],
    resourceRefs,
    webPaths: input.webPaths as string[],
    objectiveChecks,
    result: "PASS",
    evidenceSha256: input.evidenceSha256,
  };
  const { evidenceSha256, ...digestInput } = record;
  if (sha256(assertSanitizedEvidence(digestInput)) !== evidenceSha256)
    throw new Error("CLIENT_EVIDENCE_DIGEST");
  assertSanitizedEvidence(record);
  return record;
};

const skillTree = (repoRoot: string, revision: string): string =>
  execFileSync(
    "git",
    ["rev-parse", `${revision}:skills/idea-validation-workflow`],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();

export const verifyClientEvidence = async (input: {
  repoRoot: string;
  baseOrigin: string;
  value: unknown;
  fetchImpl?: typeof fetch | undefined;
}): Promise<ClientValidationRecordV1> => {
  const record = parseClientValidationRecord(input.value);
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", record.skillCommitSha, "HEAD"],
    {
      cwd: input.repoRoot,
      stdio: "ignore",
    },
  );
  if (
    skillTree(input.repoRoot, record.skillCommitSha) !==
    skillTree(input.repoRoot, "HEAD")
  )
    throw new Error("CLIENT_EVIDENCE_SKILL_TREE");
  const projectBodies: string[] = [];
  for (const id of Object.values(record.resourceRefs)) {
    const route = id.startsWith("idea_")
      ? `/api/v1/ideas/${id}`
      : id.startsWith("proj_")
        ? `/api/v1/projects/${id}`
        : null;
    if (route === null) continue;
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: route,
      fetchImpl: input.fetchImpl,
    });
    const body = JSON.stringify(response.json);
    if (response.status !== 200 || !body.includes(id))
      throw new Error(`CLIENT_EVIDENCE_RESOURCE:${id}`);
    if (!body.includes("SYNTHETIC_DEMO_DATA"))
      throw new Error(`CLIENT_EVIDENCE_NOT_SYNTHETIC:${id}`);
    if (id.startsWith("proj_")) projectBodies.push(body);
  }
  for (const id of Object.values(record.resourceRefs).filter((value) =>
    value.startsWith("rpt_"),
  )) {
    if (!projectBodies.some((body) => body.includes(id))) {
      let found = false;
      for (const projectId of Object.values(record.resourceRefs).filter(
        (value) => value.startsWith("proj_"),
      )) {
        const response = await readJson({
          baseOrigin: input.baseOrigin,
          path: `/api/v1/projects/${projectId}/reports/current`,
          fetchImpl: input.fetchImpl,
        });
        if (
          response.status === 200 &&
          JSON.stringify(response.json).includes(id)
        )
          found = true;
      }
      if (!found) throw new Error(`CLIENT_EVIDENCE_REPORT:${id}`);
    }
  }
  return record;
};

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

if (process.argv[1]?.endsWith("verify-client-evidence.ts") === true) {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const file = path.resolve(argument("--file"));
  const record = await verifyClientEvidence({
    repoRoot,
    baseOrigin: normalizeLoopbackOrigin(argument("--base-url")),
    value: JSON.parse(await readFile(file, "utf8")),
  });
  console.log(
    JSON.stringify({
      result: "PASS",
      client: record.client,
      runId: record.runId,
    }),
  );
}
