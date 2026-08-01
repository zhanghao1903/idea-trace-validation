import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "./canonical-json.js";
import type {
  DurableRequestJournalEntryV1,
  DurableRequestState,
  SanitizedObservation,
} from "./contracts.js";
import {
  deriveRequestId,
  sha256,
  validRunId,
  validStepId,
} from "./request-identity.js";

const digestPattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const requestPattern = /^req_[0-9A-HJKMNP-TV-Z]{26}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const safeResourceId =
  /^(?:idea|proj|ques|evd|attn|conc|rpt|confirm|trn|prog)_[0-9A-Za-z]{10,64}$/u;
const secretPatterns = [
  /authorization/iu,
  /cookie/iu,
  /human[-_]?control/iu,
  /(?:token|password|secret)\s*[:=]/iu,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/u,
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/u,
  /AKIA[0-9A-Z]{16}/u,
];

const transitions: Readonly<
  Record<DurableRequestState, DurableRequestState[]>
> = {
  PREPARED: ["DISPATCHED"],
  DISPATCHED: ["DISPATCHED", "OUTCOME_UNKNOWN", "COMMITTED", "REJECTED"],
  OUTCOME_UNKNOWN: ["DISPATCHED", "COMMITTED", "REJECTED"],
  COMMITTED: ["COMMITTED"],
  REJECTED: ["REJECTED"],
};

export const journalDirectory = (proofRoot: string, runId: string): string => {
  if (!validRunId(runId)) throw new Error("RUN_ID_INVALID");
  return path.join(proofRoot, "runs", runId, "requests");
};

export const journalPath = (
  proofRoot: string,
  runId: string,
  stepId: string,
  semanticAttempt: number,
): string => {
  if (!validStepId(stepId)) throw new Error("STEP_ID_INVALID");
  if (!Number.isSafeInteger(semanticAttempt) || semanticAttempt < 0)
    throw new Error("SEMANTIC_ATTEMPT_INVALID");
  return path.join(
    journalDirectory(proofRoot, runId),
    `${stepId}-${semanticAttempt}.json`,
  );
};

const syncDirectory = async (directory: string): Promise<void> => {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (!["EINVAL", "ENOTSUP", "EPERM"].includes(code)) throw error;
  }
};

export const atomicWriteJson = async (
  target: string,
  value: unknown,
): Promise<void> => {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${canonicalJson(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
    await syncDirectory(directory);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("JOURNAL_OBJECT_INVALID");
  return value as Record<string, unknown>;
};

const optionalInteger = (value: unknown, code: string): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
};

const observation = (value: unknown): SanitizedObservation | null => {
  if (value === null) return null;
  const input = asObject(value);
  const requestId = input.requestId;
  const status = input.status;
  const errorCode = input.errorCode;
  if (requestId !== null && typeof requestId !== "string")
    throw new Error("JOURNAL_OBSERVATION_REQUEST");
  if (status !== null && (!Number.isInteger(status) || Number(status) < 100))
    throw new Error("JOURNAL_OBSERVATION_STATUS");
  if (errorCode !== null && typeof errorCode !== "string")
    throw new Error("JOURNAL_OBSERVATION_ERROR");
  return {
    requestId,
    status: status === null ? null : Number(status),
    errorCode,
  };
};

export const validateJournalEntry = (
  value: unknown,
): DurableRequestJournalEntryV1 => {
  const input = asObject(value);
  const exact = [
    "schemaVersion",
    "runId",
    "stepId",
    "semanticAttempt",
    "method",
    "path",
    "canonicalBody",
    "bodySha256",
    "authorityInputs",
    "idempotencyKey",
    "idempotencyKeySha256",
    "manifestSha256",
    "skillCommitSha",
    "serializationVersion",
    "state",
    "preparedAt",
    "dispatchedAt",
    "resolvedAt",
    "lastObservation",
    "resultResourceRefs",
  ];
  if (Object.keys(input).some((key) => !exact.includes(key)))
    throw new Error("JOURNAL_UNKNOWN_FIELD");
  if (
    input.schemaVersion !== "1.0" ||
    input.serializationVersion !== "canonical-json-v1"
  )
    throw new Error("JOURNAL_VERSION");
  if (typeof input.runId !== "string" || !validRunId(input.runId))
    throw new Error("JOURNAL_RUN_ID");
  if (typeof input.stepId !== "string" || !validStepId(input.stepId))
    throw new Error("JOURNAL_STEP_ID");
  if (
    !Number.isSafeInteger(input.semanticAttempt) ||
    Number(input.semanticAttempt) < 0
  )
    throw new Error("JOURNAL_ATTEMPT");
  if (input.method !== "POST") throw new Error("JOURNAL_METHOD");
  if (
    typeof input.path !== "string" ||
    !input.path.startsWith("/api/v1/") ||
    input.path.includes("?") ||
    input.path.includes("..")
  )
    throw new Error("JOURNAL_PATH");
  if (
    typeof input.canonicalBody !== "string" ||
    Buffer.byteLength(input.canonicalBody) > 65_536
  )
    throw new Error("JOURNAL_BODY");
  const canonicalBody = input.canonicalBody;
  JSON.parse(canonicalBody);
  if (secretPatterns.some((pattern) => pattern.test(canonicalBody)))
    throw new Error("JOURNAL_SECRET");
  if (
    typeof input.bodySha256 !== "string" ||
    !digestPattern.test(input.bodySha256) ||
    sha256(canonicalBody) !== input.bodySha256
  )
    throw new Error("JOURNAL_BODY_DIGEST");
  const authority = asObject(input.authorityInputs);
  if (
    Object.keys(authority).some(
      (key) => key !== "expectedVersion" && key !== "basedOnRevision",
    )
  )
    throw new Error("JOURNAL_AUTHORITY_FIELD");
  const authorityInputs: DurableRequestJournalEntryV1["authorityInputs"] = {};
  const expectedVersion = optionalInteger(
    authority.expectedVersion,
    "JOURNAL_EXPECTED_VERSION",
  );
  const basedOnRevision = optionalInteger(
    authority.basedOnRevision,
    "JOURNAL_BASED_ON_REVISION",
  );
  if (expectedVersion !== undefined)
    authorityInputs.expectedVersion = expectedVersion;
  if (basedOnRevision !== undefined)
    authorityInputs.basedOnRevision = basedOnRevision;
  const body = asObject(JSON.parse(canonicalBody));
  for (const [key, authorityValue] of Object.entries(authorityInputs)) {
    if (body[key] !== authorityValue)
      throw new Error("JOURNAL_AUTHORITY_DRIFT");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    !requestPattern.test(input.idempotencyKey) ||
    typeof input.idempotencyKeySha256 !== "string" ||
    sha256(input.idempotencyKey) !== input.idempotencyKeySha256
  )
    throw new Error("JOURNAL_KEY");
  if (
    typeof input.manifestSha256 !== "string" ||
    !digestPattern.test(input.manifestSha256) ||
    typeof input.skillCommitSha !== "string" ||
    !gitShaPattern.test(input.skillCommitSha)
  )
    throw new Error("JOURNAL_BINDING");
  const derived = deriveRequestId({
    runId: input.runId,
    manifestSha256: input.manifestSha256,
    stepId: input.stepId,
    semanticAttempt: Number(input.semanticAttempt),
  });
  if (derived !== input.idempotencyKey) throw new Error("JOURNAL_KEY_DRIFT");
  const state = input.state;
  if (
    state !== "PREPARED" &&
    state !== "DISPATCHED" &&
    state !== "OUTCOME_UNKNOWN" &&
    state !== "COMMITTED" &&
    state !== "REJECTED"
  )
    throw new Error("JOURNAL_STATE");
  if (
    typeof input.preparedAt !== "string" ||
    !datePattern.test(input.preparedAt)
  )
    throw new Error("JOURNAL_PREPARED_AT");
  const dispatchedAt = input.dispatchedAt;
  const resolvedAt = input.resolvedAt;
  if (
    dispatchedAt !== null &&
    (typeof dispatchedAt !== "string" || !datePattern.test(dispatchedAt))
  )
    throw new Error("JOURNAL_DISPATCHED_AT");
  if (
    resolvedAt !== null &&
    (typeof resolvedAt !== "string" || !datePattern.test(resolvedAt))
  )
    throw new Error("JOURNAL_RESOLVED_AT");
  if (state !== "PREPARED" && dispatchedAt === null)
    throw new Error("JOURNAL_DISPATCH_TIME_REQUIRED");
  if ((state === "COMMITTED" || state === "REJECTED") !== (resolvedAt !== null))
    throw new Error("JOURNAL_RESOLUTION_TIME");
  const refsInput = asObject(input.resultResourceRefs);
  const resultResourceRefs: Record<string, string> = {};
  for (const [key, ref] of Object.entries(refsInput)) {
    if (
      !/^[a-z][a-zA-Z0-9]{1,40}$/u.test(key) ||
      typeof ref !== "string" ||
      !safeResourceId.test(ref)
    )
      throw new Error("JOURNAL_RESOURCE_REF");
    resultResourceRefs[key] = ref;
  }
  return {
    schemaVersion: "1.0",
    runId: input.runId,
    stepId: input.stepId,
    semanticAttempt: Number(input.semanticAttempt),
    method: "POST",
    path: input.path,
    canonicalBody,
    bodySha256: input.bodySha256,
    authorityInputs,
    idempotencyKey: input.idempotencyKey,
    idempotencyKeySha256: input.idempotencyKeySha256,
    manifestSha256: input.manifestSha256,
    skillCommitSha: input.skillCommitSha,
    serializationVersion: "canonical-json-v1",
    state,
    preparedAt: input.preparedAt,
    dispatchedAt,
    resolvedAt,
    lastObservation: observation(input.lastObservation),
    resultResourceRefs,
  };
};

export const createPreparedEntry = (input: {
  runId: string;
  stepId: string;
  semanticAttempt: number;
  path: string;
  body: unknown;
  authorityInputs?: DurableRequestJournalEntryV1["authorityInputs"] | undefined;
  manifestSha256: string;
  skillCommitSha: string;
  now?: string;
}): DurableRequestJournalEntryV1 => {
  const canonicalBody = canonicalJson(input.body);
  const idempotencyKey = deriveRequestId(input);
  return validateJournalEntry({
    schemaVersion: "1.0",
    runId: input.runId,
    stepId: input.stepId,
    semanticAttempt: input.semanticAttempt,
    method: "POST",
    path: input.path,
    canonicalBody,
    bodySha256: sha256(canonicalBody),
    authorityInputs: input.authorityInputs ?? {},
    idempotencyKey,
    idempotencyKeySha256: sha256(idempotencyKey),
    manifestSha256: input.manifestSha256,
    skillCommitSha: input.skillCommitSha,
    serializationVersion: "canonical-json-v1",
    state: "PREPARED",
    preparedAt: input.now ?? new Date().toISOString(),
    dispatchedAt: null,
    resolvedAt: null,
    lastObservation: null,
    resultResourceRefs: {},
  });
};

export const writeJournalEntry = async (
  proofRoot: string,
  entry: DurableRequestJournalEntryV1,
): Promise<void> => {
  const validated = validateJournalEntry(entry);
  await atomicWriteJson(
    journalPath(
      proofRoot,
      validated.runId,
      validated.stepId,
      validated.semanticAttempt,
    ),
    validated,
  );
};

export const readJournalEntry = async (
  file: string,
): Promise<DurableRequestJournalEntryV1> =>
  validateJournalEntry(JSON.parse(await readFile(file, "utf8")));

export const transitionJournalEntry = (
  entry: DurableRequestJournalEntryV1,
  state: DurableRequestState,
  options: {
    now?: string;
    observation?: SanitizedObservation | undefined;
    resultResourceRefs?: Record<string, string> | undefined;
  } = {},
): DurableRequestJournalEntryV1 => {
  if (!transitions[entry.state].includes(state))
    throw new Error(`JOURNAL_TRANSITION:${entry.state}:${state}`);
  const now = options.now ?? new Date().toISOString();
  return validateJournalEntry({
    ...entry,
    state,
    dispatchedAt:
      state === "PREPARED" ? entry.dispatchedAt : (entry.dispatchedAt ?? now),
    resolvedAt:
      state === "COMMITTED" || state === "REJECTED" ? now : entry.resolvedAt,
    lastObservation: options.observation ?? entry.lastObservation,
    resultResourceRefs: options.resultResourceRefs ?? entry.resultResourceRefs,
  });
};

export const listJournalEntries = async (
  proofRoot: string,
  runId: string,
): Promise<{ file: string; entry: DurableRequestJournalEntryV1 }[]> => {
  const directory = journalDirectory(proofRoot, runId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) => {
        const file = path.join(directory, name);
        return { file, entry: await readJournalEntry(file) };
      }),
  );
  if (entries.length > 100) throw new Error("JOURNAL_ENTRY_LIMIT");
  return entries;
};

export const unresolvedJournalEntries = async (
  proofRoot: string,
  runId: string,
): Promise<DurableRequestJournalEntryV1[]> =>
  (await listJournalEntries(proofRoot, runId))
    .map(({ entry }) => entry)
    .filter((entry) =>
      ["PREPARED", "DISPATCHED", "OUTCOME_UNKNOWN"].includes(entry.state),
    );

export const assertJournalBinding = (
  entry: DurableRequestJournalEntryV1,
  binding: {
    runId: string;
    manifestSha256: string;
    skillCommitSha: string;
  },
): void => {
  if (
    entry.runId !== binding.runId ||
    entry.manifestSha256 !== binding.manifestSha256 ||
    entry.skillCommitSha !== binding.skillCommitSha
  )
    throw new Error(`JOURNAL_RUN_BINDING:${entry.stepId}`);
};
