import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DemoRunPhase,
  DemoRunRecordV1,
  RequestTraceEntry,
} from "./contracts.js";
import { atomicWriteJson } from "./request-journal.js";
import { validRunId } from "./request-identity.js";

const transitions: Readonly<Record<DemoRunPhase, DemoRunPhase[]>> = {
  CREATED: ["PREFLIGHT_PASSED", "FAILED"],
  PREFLIGHT_PASSED: ["RECOVERING_UNKNOWN", "SEEDED", "FAILED"],
  RECOVERING_UNKNOWN: ["PREFLIGHT_PASSED", "SEEDED", "SMOKE_PASSED", "FAILED"],
  SEEDED: ["RECOVERING_UNKNOWN", "SMOKE_PASSED", "FAILED"],
  SMOKE_PASSED: ["RECOVERING_UNKNOWN", "VERIFIED", "FAILED"],
  VERIFIED: ["VERIFIED"],
  FAILED: ["PREFLIGHT_PASSED"],
};

export const runRecordPath = (proofRoot: string, runId: string): string => {
  if (!validRunId(runId)) throw new Error("RUN_ID_INVALID");
  return path.join(proofRoot, "runs", runId, "result.json");
};

export const createRunRecord = (input: {
  runId: string;
  manifestSha256: string;
  skillCommitSha: string;
  baseOrigin: string;
  now?: string;
}): DemoRunRecordV1 => ({
  schemaVersion: "1.0",
  runId: input.runId,
  manifestSha256: input.manifestSha256,
  skillCommitSha: input.skillCommitSha,
  baseOrigin: input.baseOrigin,
  phase: "CREATED",
  resumePhase: null,
  startedAt: input.now ?? new Date().toISOString(),
  finishedAt: null,
  requestTrace: [],
  resourceRefs: {},
  assertions: [],
  result: "PENDING",
});

export const transitionRunRecord = (
  record: DemoRunRecordV1,
  phase: DemoRunPhase,
  now = new Date().toISOString(),
): DemoRunRecordV1 => {
  if (!transitions[record.phase].includes(phase))
    throw new Error(`RUN_TRANSITION:${record.phase}:${phase}`);
  const enteringRecovery = phase === "RECOVERING_UNKNOWN";
  const leavingRecovery = record.phase === "RECOVERING_UNKNOWN";
  if (enteringRecovery && record.phase === "RECOVERING_UNKNOWN")
    throw new Error("RUN_ALREADY_RECOVERING");
  if (leavingRecovery && phase !== "FAILED" && record.resumePhase !== phase)
    throw new Error(
      `RUN_RESUME_PHASE:${record.resumePhase ?? "null"}:${phase}`,
    );
  return {
    ...record,
    phase,
    resumePhase: enteringRecovery
      ? (record.phase as Exclude<DemoRunPhase, "RECOVERING_UNKNOWN">)
      : leavingRecovery
        ? null
        : record.resumePhase,
    finishedAt: phase === "VERIFIED" || phase === "FAILED" ? now : null,
    result:
      phase === "VERIFIED" ? "PASS" : phase === "FAILED" ? "FAIL" : "PENDING",
  };
};

export const writeRunRecord = async (
  proofRoot: string,
  record: DemoRunRecordV1,
): Promise<void> =>
  atomicWriteJson(runRecordPath(proofRoot, record.runId), record);

const phases: DemoRunPhase[] = [
  "CREATED",
  "PREFLIGHT_PASSED",
  "RECOVERING_UNKNOWN",
  "SEEDED",
  "SMOKE_PASSED",
  "VERIFIED",
  "FAILED",
];

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const stringMap = (value: unknown, code: string): Record<string, string> => {
  const input = object(value, code);
  if (Object.values(input).some((item) => typeof item !== "string"))
    throw new Error(code);
  return input as Record<string, string>;
};

const parseTrace = (value: unknown): RequestTraceEntry => {
  const input = object(value, "RUN_TRACE");
  const exact = [
    "stepId",
    "method",
    "path",
    "bodySha256",
    "idempotencyKeySha256",
    "requestId",
    "status",
    "errorCode",
    "resourceRefs",
  ];
  if (Object.keys(input).some((key) => !exact.includes(key)))
    throw new Error("RUN_TRACE_FIELD");
  if (
    typeof input.stepId !== "string" ||
    typeof input.method !== "string" ||
    typeof input.path !== "string" ||
    typeof input.bodySha256 !== "string" ||
    typeof input.idempotencyKeySha256 !== "string" ||
    (input.requestId !== null && typeof input.requestId !== "string") ||
    (input.status !== null && !Number.isInteger(input.status)) ||
    (input.errorCode !== null && typeof input.errorCode !== "string")
  )
    throw new Error("RUN_TRACE_VALUE");
  return {
    stepId: input.stepId,
    method: input.method,
    path: input.path,
    bodySha256: input.bodySha256,
    idempotencyKeySha256: input.idempotencyKeySha256,
    requestId: input.requestId,
    status: input.status === null ? null : Number(input.status),
    errorCode: input.errorCode,
    resourceRefs: stringMap(input.resourceRefs, "RUN_TRACE_REFS"),
  };
};

export const validateRunRecord = (value: unknown): DemoRunRecordV1 => {
  const input = object(value, "RUN_RECORD");
  const exact = [
    "schemaVersion",
    "runId",
    "manifestSha256",
    "skillCommitSha",
    "baseOrigin",
    "phase",
    "resumePhase",
    "startedAt",
    "finishedAt",
    "requestTrace",
    "resourceRefs",
    "assertions",
    "result",
  ];
  if (Object.keys(input).some((key) => !exact.includes(key)))
    throw new Error("RUN_RECORD_FIELD");
  if (
    input.schemaVersion !== "1.0" ||
    typeof input.runId !== "string" ||
    !validRunId(input.runId) ||
    typeof input.manifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.manifestSha256) ||
    typeof input.skillCommitSha !== "string" ||
    !/^[a-f0-9]{40}$/u.test(input.skillCommitSha) ||
    typeof input.baseOrigin !== "string" ||
    !phases.includes(input.phase as DemoRunPhase) ||
    (input.resumePhase !== null &&
      (!phases.includes(input.resumePhase as DemoRunPhase) ||
        input.resumePhase === "RECOVERING_UNKNOWN")) ||
    typeof input.startedAt !== "string" ||
    (input.finishedAt !== null && typeof input.finishedAt !== "string") ||
    !Array.isArray(input.requestTrace) ||
    input.requestTrace.length > 100 ||
    !Array.isArray(input.assertions) ||
    (input.result !== "PENDING" &&
      input.result !== "PASS" &&
      input.result !== "FAIL")
  )
    throw new Error("RUN_RECORD_VALUE");
  const assertions = input.assertions.map((value) => {
    const assertion = object(value, "RUN_ASSERTION");
    if (
      Object.keys(assertion).some(
        (key) => key !== "id" && key !== "result" && key !== "detailCode",
      ) ||
      typeof assertion.id !== "string" ||
      (assertion.result !== "PASS" && assertion.result !== "FAIL") ||
      typeof assertion.detailCode !== "string"
    )
      throw new Error("RUN_ASSERTION");
    return {
      id: assertion.id,
      result: assertion.result as "PASS" | "FAIL",
      detailCode: assertion.detailCode,
    };
  });
  const phase = input.phase as DemoRunPhase;
  const resumePhase = input.resumePhase as Exclude<
    DemoRunPhase,
    "RECOVERING_UNKNOWN"
  > | null;
  if ((phase === "RECOVERING_UNKNOWN") !== (resumePhase !== null))
    throw new Error("RUN_RESUME_BINDING");
  if ((phase === "VERIFIED") !== (input.result === "PASS"))
    throw new Error("RUN_RESULT_BINDING");
  if ((phase === "FAILED") !== (input.result === "FAIL"))
    throw new Error("RUN_FAILURE_BINDING");
  return {
    schemaVersion: "1.0",
    runId: input.runId,
    manifestSha256: input.manifestSha256,
    skillCommitSha: input.skillCommitSha,
    baseOrigin: input.baseOrigin,
    phase,
    resumePhase,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    requestTrace: input.requestTrace.map(parseTrace),
    resourceRefs: stringMap(input.resourceRefs, "RUN_RESOURCE_REFS"),
    assertions,
    result: input.result,
  };
};

export const readRunRecord = async (
  proofRoot: string,
  runId: string,
): Promise<DemoRunRecordV1> =>
  validateRunRecord(
    JSON.parse(await readFile(runRecordPath(proofRoot, runId), "utf8")),
  );
