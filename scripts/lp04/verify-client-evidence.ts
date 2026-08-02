import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClientValidationRecordV1 } from "./contracts.js";
import { normalizeLoopbackOrigin } from "./environment.js";
import { readJson } from "./http-client.js";
import { exactValuePresent } from "./public-verification.js";
import { sha256 } from "./request-identity.js";
import { assertSanitizedEvidence } from "./security.js";

const expectedChecks = {
  CODEX: [
    "exact-skill-loaded",
    "unknown-result-replayed",
    "exact-body-key-reused",
    "live-idea-read-reconciled",
    "proposer-collection-unique",
    "human-boundary-respected",
    "transcript-secret-scan",
  ],
  CLAUDE: [
    "exact-skill-loaded",
    "ready-idea-read",
    "promotion-attribution",
    "single-execution-fact",
    "invalid-report-rejected",
    "report-remained-empty",
    "corrected-report-accepted",
    "proposer-experience-reconciled",
    "executor-experience-reconciled",
    "database-authority-reconciled",
    "human-boundary-respected",
    "transcript-secret-scan",
  ],
} as const;

const expectedResourceKeys = {
  CODEX: ["ideaId"],
  CLAUDE: ["ideaId", "projectId", "reportId"],
} as const;

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
  const client = input.client as "CODEX" | "CLAUDE";
  const checkIds = objectiveChecks.map((check) => check.id);
  if (
    new Set(checkIds).size !== checkIds.length ||
    checkIds.length !== expectedChecks[client].length ||
    expectedChecks[client].some((check) => !checkIds.includes(check))
  )
    throw new Error("CLIENT_EVIDENCE_OBJECTIVES");
  const resourceKeys = Object.keys(resourceRefs).sort();
  if (
    resourceKeys.length !== expectedResourceKeys[client].length ||
    expectedResourceKeys[client].some((key) => !resourceKeys.includes(key))
  )
    throw new Error("CLIENT_EVIDENCE_RESOURCE_SHAPE");
  if (
    (client === "CODEX" && input.executionMode !== "CLI") ||
    (client === "CLAUDE" && input.executionMode !== "DESKTOP")
  )
    throw new Error("CLIENT_EVIDENCE_MODE");
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

const auditRequestIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(auditRequestIds);
  if (typeof value !== "object" || value === null) return [];
  const input = value as Record<string, unknown>;
  const own =
    typeof input.requestId === "string" &&
    typeof input.aggregateId === "string" &&
    typeof input.eventType === "string"
      ? [input.requestId]
      : [];
  return [...own, ...Object.values(input).flatMap(auditRequestIds)];
};

const assertTranscriptEnvelope = (
  record: ClientValidationRecordV1,
  transcriptText: string,
): void => {
  const lines = transcriptText.trim().split("\n");
  if (lines.length === 0 || lines.length > 10_000)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
  const events = lines.map((line) => {
    try {
      return object(
        JSON.parse(line) as unknown,
        "CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE",
      );
    } catch {
      throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
    }
  });
  const started = Date.parse(record.startedAt);
  const finished = Date.parse(record.finishedAt);
  const hasBoundedEvent = events.some((event) => {
    const timestamp = event.timestamp;
    if (typeof timestamp !== "string") return false;
    const observed = Date.parse(timestamp);
    return (
      Number.isFinite(observed) && observed >= started && observed <= finished
    );
  });
  const hasClientEnvelope = events.some((event) => {
    if (record.client === "CODEX") {
      if (event.type !== "session_meta") return false;
      const payload = event.payload;
      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      )
        return false;
      const version = (payload as Record<string, unknown>).cli_version;
      const sessionId = (payload as Record<string, unknown>).session_id;
      return (
        typeof version === "string" &&
        record.clientVersion.includes(version) &&
        typeof sessionId === "string" &&
        sessionId.length > 0
      );
    }
    const version = event.version;
    return (
      (event.type === "user" || event.type === "assistant") &&
      typeof version === "string" &&
      record.clientVersion.includes(version) &&
      typeof event.sessionId === "string" &&
      event.sessionId.length > 0
    );
  });
  if (!hasBoundedEvent || !hasClientEnvelope)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
};

const readProjectAuditIds = async (input: {
  baseOrigin: string;
  projectId: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<string[]> => {
  const ids: string[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `/api/v1/projects/${input.projectId}/history?${query.toString()}`,
      fetchImpl: input.fetchImpl,
    });
    if (response.status !== 200)
      throw new Error(`CLIENT_EVIDENCE_HISTORY:${input.projectId}`);
    ids.push(...auditRequestIds(response.json));
    const data = object(response.json.data, "CLIENT_EVIDENCE_HISTORY");
    const page = object(data.page, "CLIENT_EVIDENCE_HISTORY");
    if (page.nextCursor === null) return ids;
    if (
      typeof page.nextCursor !== "string" ||
      page.nextCursor.length === 0 ||
      seen.has(page.nextCursor)
    )
      throw new Error(`CLIENT_EVIDENCE_HISTORY_CURSOR:${input.projectId}`);
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error(`CLIENT_EVIDENCE_HISTORY_LIMIT:${input.projectId}`);
};

export const verifyClientEvidence = async (input: {
  repoRoot: string;
  baseOrigin: string;
  transcriptFile: string;
  value: unknown;
  fetchImpl?: typeof fetch | undefined;
}): Promise<ClientValidationRecordV1> => {
  const record = parseClientValidationRecord(input.value);
  const transcript = await readFile(input.transcriptFile);
  if (sha256(transcript) !== record.rawTranscriptSha256)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_DIGEST");
  const transcriptText = transcript.toString("utf8");
  assertSanitizedEvidence(transcriptText, [], 8_388_608);
  assertTranscriptEnvelope(record, transcriptText);
  for (const expected of [
    record.runId,
    ...record.requestIds,
    ...Object.values(record.resourceRefs),
  ]) {
    if (!transcriptText.includes(expected))
      throw new Error(`CLIENT_EVIDENCE_TRANSCRIPT_BINDING:${expected}`);
  }
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
  const authoritativeRequestIds = new Set<string>();
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
    if (response.status !== 200 || !exactValuePresent(response.json, id))
      throw new Error(`CLIENT_EVIDENCE_RESOURCE:${id}`);
    if (!body.includes("SYNTHETIC_DEMO_DATA"))
      throw new Error(`CLIENT_EVIDENCE_NOT_SYNTHETIC:${id}`);
    if (id.startsWith("idea_")) {
      const ids = auditRequestIds(response.json);
      if (!ids.some((requestId) => record.requestIds.includes(requestId)))
        throw new Error(`CLIENT_EVIDENCE_IDEA_HISTORY:${id}`);
      ids.forEach((requestId) => authoritativeRequestIds.add(requestId));
    }
    if (id.startsWith("proj_")) {
      const ids = await readProjectAuditIds({
        baseOrigin: input.baseOrigin,
        projectId: id,
        fetchImpl: input.fetchImpl,
      });
      if (!ids.some((requestId) => record.requestIds.includes(requestId)))
        throw new Error(`CLIENT_EVIDENCE_PROJECT_HISTORY:${id}`);
      ids.forEach((requestId) => authoritativeRequestIds.add(requestId));
    }
  }
  for (const id of Object.values(record.resourceRefs).filter((value) =>
    value.startsWith("rpt_"),
  )) {
    const projectId = record.resourceRefs.projectId;
    if (projectId === undefined)
      throw new Error(`CLIENT_EVIDENCE_REPORT_PROJECT:${id}`);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `/api/v1/projects/${projectId}/reports/current`,
      fetchImpl: input.fetchImpl,
    });
    const body = JSON.stringify(response.json);
    if (
      response.status !== 200 ||
      !exactValuePresent(response.json, id) ||
      !body.includes("SYNTHETIC_DEMO_DATA")
    )
      throw new Error(`CLIENT_EVIDENCE_REPORT:${id}`);
  }
  if (
    !record.requestIds.some((requestId) =>
      authoritativeRequestIds.has(requestId),
    )
  )
    throw new Error("CLIENT_EVIDENCE_REQUEST_AUTHORITY");
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
    transcriptFile: path.resolve(argument("--transcript")),
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
