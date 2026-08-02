import {
  ATTEMPT_STATES,
  appendTransition,
  verifyTransitionLog,
  type AttemptState,
  type JsonRecord,
} from "../shared/contracts.js";

const terminal = new Set<AttemptState>([
  "DEPLOYED",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
]);
const requiresDatabase = new Set<AttemptState>([
  "SAFETY_BACKUP_RESOLVED",
  "MIGRATION_SUCCEEDED",
  "APP_READY",
  "HTTPS_READY",
  "INITIAL_SMOKE_PASSED",
  "POST_DEPLOY_BACKUP_VERIFIED",
  "RESTORE_ENV_READY",
  "RESTORE_VERIFIED",
  "PRODUCTION_UNCHANGED_VERIFIED",
  "POST_RESTORE_SMOKE_PASSED",
  "DEPLOYED",
]);

export const projectAttemptState = (attempt: JsonRecord): void => {
  const log = verifyTransitionLog(attempt.transitionLog);
  const state = attempt.currentState;
  if (
    typeof state !== "string" ||
    !ATTEMPT_STATES.includes(state as AttemptState) ||
    log.at(-1)?.to !== state
  ) {
    throw new Error("ATTEMPT_STATE_PROJECTION");
  }
  if (
    requiresDatabase.has(state as AttemptState) &&
    attempt.sourceDatabase === null
  )
    throw new Error("ATTEMPT_DATABASE_IDENTITY_REQUIRED");
  if (terminal.has(state as AttemptState) !== (attempt.finishedAt !== null))
    throw new Error("ATTEMPT_FINISHED_AT");
};

export const transitionAttempt = (
  attempt: JsonRecord,
  input: {
    to: AttemptState;
    occurredAt: string;
    reasonCode: string;
    evidenceSha256: string;
    projection?: JsonRecord;
  },
): JsonRecord => {
  const updated: JsonRecord = {
    ...attempt,
    ...(input.projection ?? {}),
    currentState: input.to,
    updatedAt: input.occurredAt,
    finishedAt: terminal.has(input.to) ? input.occurredAt : null,
    transitionLog: appendTransition(
      attempt.transitionLog as JsonRecord[],
      input.to,
      input.occurredAt,
      input.reasonCode,
      input.evidenceSha256,
    ),
    attemptRecordSha256: "",
  };
  projectAttemptState(updated);
  return updated;
};
