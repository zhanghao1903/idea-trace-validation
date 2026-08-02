import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import {
  createInitialTransition,
  exactKeys,
  parseCandidateIdentity,
  parseDeploymentTarget,
  record,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite } from "../shared/filesystem.js";
import { projectAttemptState } from "./attempt-state.js";

const keys = [
  "schemaVersion",
  "attemptId",
  "attemptRecordSha256",
  "envelopeId",
  "envelopeSha256",
  "candidate",
  "target",
  "currentState",
  "startedAt",
  "updatedAt",
  "finishedAt",
  "resume",
  "previousRelease",
  "sourceDatabase",
  "safetyBackup",
  "migration",
  "initialSmoke",
  "postDeployBackup",
  "restoreEvidence",
  "postRestoreSmoke",
  "rollback",
  "transitionLog",
  "knownLimitations",
] as const;

export const finalizeAttemptRecord = (attempt: JsonRecord): JsonRecord => {
  const output: JsonRecord = { ...attempt, attemptRecordSha256: "" };
  output.attemptRecordSha256 = canonicalSha256(output, ["attemptRecordSha256"]);
  verifyAttemptRecord(output);
  return output;
};

export const createAttemptRecord = (input: {
  attemptId: string;
  envelopeId: string;
  envelopeSha256: string;
  candidate: unknown;
  target: JsonRecord;
  previousRelease: JsonRecord | null;
  startedAt: string;
}): JsonRecord =>
  finalizeAttemptRecord({
    schemaVersion: "1.0",
    attemptId: input.attemptId,
    attemptRecordSha256: "",
    envelopeId: input.envelopeId,
    envelopeSha256: input.envelopeSha256,
    candidate: parseCandidateIdentity(input.candidate),
    target: input.target,
    currentState: "PREPARED",
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    finishedAt: null,
    resume: {
      count: 0,
      interruptedState: null,
      interruptedAt: null,
      reasonCode: null,
      lastTransitionSha256: null,
      resumedAt: null,
    },
    previousRelease: input.previousRelease,
    sourceDatabase: null,
    safetyBackup: null,
    migration: null,
    initialSmoke: null,
    postDeployBackup: null,
    restoreEvidence: null,
    postRestoreSmoke: null,
    rollback: {
      status: "NOT_STARTED",
      reasonCode: null,
      previousRelease: null,
      readinessSha256: null,
      smokeSha256: null,
      startedAt: null,
      finishedAt: null,
    },
    transitionLog: [createInitialTransition(input.startedAt)],
    knownLimitations: [],
  });

export const verifyAttemptRecord = (value: unknown): JsonRecord => {
  const input = record(value, "ATTEMPT_RECORD");
  if (Object.keys(input).sort().join("\0") !== [...keys].sort().join("\0"))
    throw new Error("ATTEMPT_FIELDS");
  if (
    input.schemaVersion !== "1.0" ||
    !/^deploy_[a-zA-Z0-9_-]{6,64}$/u.test(String(input.attemptId))
  )
    throw new Error("ATTEMPT_ID");
  parseCandidateIdentity(input.candidate);
  parseDeploymentTarget(input.target);
  if (!/^auth_[0-9a-f]{32}$/u.test(String(input.envelopeId)))
    throw new Error("ATTEMPT_ENVELOPE_ID");
  if (!/^[0-9a-f]{64}$/u.test(String(input.envelopeSha256)))
    throw new Error("ATTEMPT_ENVELOPE_SHA");
  for (const field of ["startedAt", "updatedAt"] as const) {
    if (
      typeof input[field] !== "string" ||
      Number.isNaN(Date.parse(input[field]))
    )
      throw new Error("ATTEMPT_TIME");
  }
  if (Date.parse(String(input.updatedAt)) < Date.parse(String(input.startedAt)))
    throw new Error("ATTEMPT_TIME_ORDER");
  const resume = record(input.resume, "ATTEMPT_RESUME");
  exactKeys(
    resume,
    [
      "count",
      "interruptedState",
      "interruptedAt",
      "reasonCode",
      "lastTransitionSha256",
      "resumedAt",
    ],
    "ATTEMPT_RESUME",
  );
  if (resume.count !== 0 && resume.count !== 1)
    throw new Error("ATTEMPT_RESUME_COUNT");
  const resumeDetails = [
    resume.interruptedState,
    resume.interruptedAt,
    resume.reasonCode,
    resume.lastTransitionSha256,
    resume.resumedAt,
  ];
  if (
    (resume.count === 0 && resumeDetails.some((entry) => entry !== null)) ||
    (resume.count === 1 && resumeDetails.some((entry) => entry === null))
  )
    throw new Error("ATTEMPT_RESUME_FIELDS");
  const rollback = record(input.rollback, "ATTEMPT_ROLLBACK");
  exactKeys(
    rollback,
    [
      "status",
      "reasonCode",
      "previousRelease",
      "readinessSha256",
      "smokeSha256",
      "startedAt",
      "finishedAt",
    ],
    "ATTEMPT_ROLLBACK",
  );
  if (
    !["NOT_STARTED", "PASS", "FAIL", "NOT_APPLICABLE"].includes(
      String(rollback.status),
    )
  )
    throw new Error("ATTEMPT_ROLLBACK_STATUS");
  if (
    !Array.isArray(input.knownLimitations) ||
    input.knownLimitations.length > 20 ||
    new Set(input.knownLimitations).size !== input.knownLimitations.length ||
    input.knownLimitations.some(
      (entry) => typeof entry !== "string" || entry.length > 240,
    )
  )
    throw new Error("ATTEMPT_LIMITATIONS");
  projectAttemptState(input);
  const expected = canonicalSha256(input, ["attemptRecordSha256"]);
  if (input.attemptRecordSha256 !== expected) throw new Error("ATTEMPT_DIGEST");
  return input;
};

export const writeAttemptRecord = async (
  path: string,
  previous: JsonRecord | null,
  next: JsonRecord,
): Promise<void> => {
  verifyAttemptRecord(next);
  if (previous !== null) {
    verifyAttemptRecord(previous);
    const before = previous.transitionLog as JsonRecord[];
    const after = next.transitionLog as JsonRecord[];
    if (
      after.length !== before.length + 1 ||
      before.some(
        (entry, index) => canonicalJson(entry) !== canonicalJson(after[index]),
      )
    ) {
      throw new Error("ATTEMPT_HISTORY_REWRITE");
    }
  }
  await atomicWrite(path, canonicalJson(next), 0o600);
};
