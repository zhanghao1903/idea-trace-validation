import { readFile } from "node:fs/promises";

import type {
  DurableRequestJournalEntryV1,
  SanitizedObservation,
} from "./contracts.js";
import {
  createPreparedEntry,
  journalPath,
  readJournalEntry,
  transitionJournalEntry,
  writeJournalEntry,
} from "./request-journal.js";

export interface HttpJsonResponse {
  status: number;
  json: Record<string, unknown>;
  observation: SanitizedObservation;
}

const errorCode = (response: HttpJsonResponse): string | null => {
  const error = asObject(response.json.error);
  return typeof error.code === "string" ? error.code : null;
};

const inProgressDelay = (response: HttpJsonResponse): number | null => {
  if (
    response.status !== 409 ||
    errorCode(response) !== "IDEMPOTENCY_IN_PROGRESS"
  )
    return null;
  const error = asObject(response.json.error);
  const details = asObject(error.details);
  const retryAfterMs = details.retryAfterMs;
  if (
    error.retryable !== true ||
    details.recovery !== "RETRY_SAME_KEY" ||
    !Number.isSafeInteger(retryAfterMs) ||
    Number(retryAfterMs) < 1 ||
    Number(retryAfterMs) > 1_000
  )
    throw new Error("IDEMPOTENCY_RETRY_AFTER_INVALID");
  return Number(retryAfterMs);
};

export class UnknownResultError extends Error {
  readonly entry: DurableRequestJournalEntryV1;

  constructor(entry: DurableRequestJournalEntryV1) {
    super(`UNKNOWN_RESULT:${entry.stepId}`);
    this.entry = entry;
  }
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const observationFrom = (
  status: number,
  json: Record<string, unknown>,
): SanitizedObservation => {
  const meta = asObject(json.meta);
  const error = asObject(json.error);
  return {
    requestId: typeof meta.requestId === "string" ? meta.requestId : null,
    status,
    errorCode: typeof error.code === "string" ? error.code : null,
  };
};

const readBoundedJson = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (Buffer.byteLength(text) > 8_388_608)
    throw new Error("RESPONSE_TOO_LARGE");
  return asObject(JSON.parse(text));
};

export const readJson = async (input: {
  baseOrigin: string;
  path: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<HttpJsonResponse> => {
  const response = await (input.fetchImpl ?? fetch)(
    new URL(input.path, input.baseOrigin),
    { headers: { accept: "application/json" }, redirect: "error" },
  );
  const json = await readBoundedJson(response);
  return {
    status: response.status,
    json,
    observation: observationFrom(response.status, json),
  };
};

export const executeStoredEntry = async (input: {
  proofRoot: string;
  entry: DurableRequestJournalEntryV1;
  baseOrigin: string;
  aiToken: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{
  entry: DurableRequestJournalEntryV1;
  response: HttpJsonResponse;
}> => {
  if (input.entry.state === "COMMITTED" || input.entry.state === "REJECTED")
    throw new Error(`JOURNAL_TERMINAL:${input.entry.state}`);
  const dispatched = transitionJournalEntry(input.entry, "DISPATCHED");
  await writeJournalEntry(input.proofRoot, dispatched);
  try {
    const response = await (input.fetchImpl ?? fetch)(
      new URL(dispatched.path, input.baseOrigin),
      {
        method: dispatched.method,
        redirect: "error",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.aiToken}`,
          "content-type": "application/json",
          "idempotency-key": dispatched.idempotencyKey,
        },
        body: dispatched.canonicalBody,
      },
    );
    const json = await readBoundedJson(response);
    return {
      entry: dispatched,
      response: {
        status: response.status,
        json,
        observation: observationFrom(response.status, json),
      },
    };
  } catch (error) {
    const unknown = transitionJournalEntry(dispatched, "OUTCOME_UNKNOWN");
    await writeJournalEntry(input.proofRoot, unknown);
    if (error instanceof UnknownResultError) throw error;
    throw new UnknownResultError(unknown);
  }
};

export const executeStoredEntryWithInProgressRetry = async (input: {
  proofRoot: string;
  entry: DurableRequestJournalEntryV1;
  baseOrigin: string;
  aiToken: string;
  fetchImpl?: typeof fetch | undefined;
  sleepImpl?: ((milliseconds: number) => Promise<void>) | undefined;
  maximumAttempts?: number | undefined;
}): Promise<{
  entry: DurableRequestJournalEntryV1;
  response: HttpJsonResponse;
}> => {
  const maximumAttempts = input.maximumAttempts ?? 3;
  if (
    !Number.isSafeInteger(maximumAttempts) ||
    maximumAttempts < 1 ||
    maximumAttempts > 3
  )
    throw new Error("IDEMPOTENCY_RETRY_LIMIT_INVALID");
  const sleep =
    input.sleepImpl ??
    (async (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let entry = input.entry;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = await executeStoredEntry({
      proofRoot: input.proofRoot,
      entry,
      baseOrigin: input.baseOrigin,
      aiToken: input.aiToken,
      fetchImpl: input.fetchImpl,
    });
    const delay = inProgressDelay(result.response);
    if (delay === null) return result;
    const unresolved = transitionJournalEntry(result.entry, "OUTCOME_UNKNOWN", {
      observation: result.response.observation,
    });
    await writeJournalEntry(input.proofRoot, unresolved);
    if (attempt === maximumAttempts)
      throw new Error(
        `IDEMPOTENCY_IN_PROGRESS_EXHAUSTED:${result.entry.stepId}`,
      );
    await sleep(delay);
    entry = unresolved;
  }
  throw new Error("IDEMPOTENCY_RETRY_UNREACHABLE");
};

export const prepareAndExecute = async (input: {
  proofRoot: string;
  runId: string;
  stepId: string;
  semanticAttempt: number;
  path: string;
  body: unknown;
  authorityInputs?: DurableRequestJournalEntryV1["authorityInputs"] | undefined;
  manifestSha256: string;
  skillCommitSha: string;
  baseOrigin: string;
  aiToken: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{
  entry: DurableRequestJournalEntryV1;
  response: HttpJsonResponse;
}> => {
  const prepared = createPreparedEntry(input);
  const file = journalPath(
    input.proofRoot,
    input.runId,
    input.stepId,
    input.semanticAttempt,
  );
  let entry: DurableRequestJournalEntryV1;
  try {
    await readFile(file, "utf8");
    entry = await readJournalEntry(file);
    if (
      entry.bodySha256 !== prepared.bodySha256 ||
      entry.idempotencyKey !== prepared.idempotencyKey ||
      entry.path !== prepared.path ||
      entry.manifestSha256 !== prepared.manifestSha256 ||
      entry.skillCommitSha !== prepared.skillCommitSha
    )
      throw new Error("JOURNAL_INTENT_DRIFT");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") throw error;
    entry = prepared;
    await writeJournalEntry(input.proofRoot, entry);
  }
  return executeStoredEntry({
    proofRoot: input.proofRoot,
    entry,
    baseOrigin: input.baseOrigin,
    aiToken: input.aiToken,
    fetchImpl: input.fetchImpl,
  });
};

export const resolveExecutedEntry = async (input: {
  proofRoot: string;
  entry: DurableRequestJournalEntryV1;
  response: HttpJsonResponse;
  resultResourceRefs?: Record<string, string> | undefined;
  accepted: boolean;
}): Promise<DurableRequestJournalEntryV1> => {
  const resolved = transitionJournalEntry(
    input.entry,
    input.accepted ? "COMMITTED" : "REJECTED",
    {
      observation: input.response.observation,
      resultResourceRefs: input.resultResourceRefs,
    },
  );
  await writeJournalEntry(input.proofRoot, resolved);
  return resolved;
};
