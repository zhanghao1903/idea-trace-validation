import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  ATTEMPT_STATES,
  appendTransition,
  exactKeys,
  parseDatabaseIdentity,
  parseMigrationEvidence,
  record,
  verifyTransitionLog,
  type AttemptState,
  type JsonRecord,
} from "../shared/contracts.js";

const terminal = new Set<AttemptState>([
  "DEPLOYED",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
]);
const forward: AttemptState[] = [
  "PREPARED",
  "PREFLIGHT_PASSED",
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
];

const digest = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
    throw new Error(code);
  return value;
};
const time = (value: unknown, code: string): string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error(code);
  return value;
};
const safe = (value: unknown, code: string): string => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/u.test(value)
  )
    throw new Error(code);
  return value;
};

export const verifySmokeReference = (
  value: unknown,
  mode: "EXTERNAL_INITIAL" | "EXTERNAL_POST_RESTORE",
): JsonRecord => {
  const input = record(value, "ATTEMPT_SMOKE_REF");
  exactKeys(
    input,
    [
      "smokeId",
      "smokeSha256",
      "mode",
      "targetId",
      "candidateManifestSha256",
      "attemptId",
      "observedAt",
      "origin",
      "syntheticStorySha256",
      "resourceIdsSha256",
      "assertionSetSha256",
      "status",
    ],
    "ATTEMPT_SMOKE_REF",
  );
  safe(input.smokeId, "ATTEMPT_SMOKE_ID");
  digest(input.smokeSha256, "ATTEMPT_SMOKE_SHA");
  if (input.mode !== mode || input.status !== "PASS")
    throw new Error("ATTEMPT_SMOKE_STATUS");
  time(input.observedAt, "ATTEMPT_SMOKE_TIME");
  const origin = new URL(String(input.origin));
  if (origin.protocol !== "https:" || origin.pathname !== "/")
    throw new Error("ATTEMPT_SMOKE_ORIGIN");
  for (const field of [
    "candidateManifestSha256",
    "syntheticStorySha256",
    "resourceIdsSha256",
    "assertionSetSha256",
  ] as const)
    digest(input[field], `ATTEMPT_SMOKE_${field}`);
  return input;
};

export const verifyBackupReference = (
  value: unknown,
  purpose: "PRE_MIGRATION_SAFETY" | "POST_DEPLOY_RECOVERABILITY",
): JsonRecord => {
  const input = record(value, "ATTEMPT_BACKUP_REF");
  exactKeys(
    input,
    [
      "backupId",
      "backupManifestSha256",
      "ciphertextSha256",
      "purpose",
      "targetId",
      "databaseInstanceSha256",
      "attemptId",
      "candidateManifestSha256",
    ],
    "ATTEMPT_BACKUP_REF",
  );
  safe(input.backupId, "ATTEMPT_BACKUP_ID");
  if (input.purpose !== purpose) throw new Error("ATTEMPT_BACKUP_PURPOSE");
  for (const field of [
    "backupManifestSha256",
    "ciphertextSha256",
    "databaseInstanceSha256",
    "candidateManifestSha256",
  ] as const)
    digest(input[field], `ATTEMPT_BACKUP_${field}`);
  return input;
};

export const verifyFreshTargetProof = (value: unknown): JsonRecord => {
  const input = record(value, "ATTEMPT_FRESH_TARGET");
  exactKeys(
    input,
    ["kind", "targetId", "verifiedAt", "assertions"],
    "ATTEMPT_FRESH_TARGET",
  );
  if (input.kind !== "FRESH_TARGET") throw new Error("ATTEMPT_FRESH_KIND");
  time(input.verifiedAt, "ATTEMPT_FRESH_TIME");
  if (!Array.isArray(input.assertions))
    throw new Error("ATTEMPT_FRESH_ASSERTIONS");
  const ids = input.assertions.map((value) => {
    const assertion = record(value, "ATTEMPT_FRESH_ASSERTION");
    exactKeys(assertion, ["id", "status"], "ATTEMPT_FRESH_ASSERTION");
    if (assertion.status !== "PASS") throw new Error("ATTEMPT_FRESH_STATUS");
    return String(assertion.id);
  });
  const expected = [
    "no_application_data",
    "no_prior_release",
    "no_production_volume",
  ];
  if ([...ids].sort().join("\0") !== expected.join("\0"))
    throw new Error("ATTEMPT_FRESH_ASSERTION_SET");
  return input;
};

export const verifyRestoreReference = (value: unknown): JsonRecord => {
  const input = record(value, "ATTEMPT_RESTORE_REF");
  exactKeys(
    input,
    [
      "restoreId",
      "restoreEvidenceSha256",
      "attemptId",
      "targetId",
      "candidateManifestSha256",
      "backupId",
      "backupManifestSha256",
      "ciphertextSha256",
      "sourceDatabaseInstanceSha256",
      "productionUnchangedSha256",
      "syntheticStorySha256",
      "resourceIdsSha256",
      "assertionSetSha256",
      "status",
    ],
    "ATTEMPT_RESTORE_REF",
  );
  safe(input.restoreId, "ATTEMPT_RESTORE_ID");
  if (input.status !== "PASS") throw new Error("ATTEMPT_RESTORE_STATUS");
  for (const field of [
    "restoreEvidenceSha256",
    "candidateManifestSha256",
    "backupManifestSha256",
    "ciphertextSha256",
    "sourceDatabaseInstanceSha256",
    "productionUnchangedSha256",
    "syntheticStorySha256",
    "resourceIdsSha256",
    "assertionSetSha256",
  ] as const)
    digest(input[field], `ATTEMPT_RESTORE_${field}`);
  return input;
};

const reached = (log: readonly JsonRecord[], state: AttemptState): boolean =>
  log.some((entry) => entry.to === state);

const transitionEvidence = (
  log: readonly JsonRecord[],
  state: AttemptState,
): string => {
  const entry = log.find((candidate) => candidate.to === state);
  if (entry === undefined)
    throw new Error(`ATTEMPT_TRANSITION_MISSING:${state}`);
  return String(entry.evidenceSha256);
};

const requireBound = (attempt: JsonRecord, ref: JsonRecord): void => {
  const candidate = record(attempt.candidate, "ATTEMPT_CANDIDATE");
  const target = record(attempt.target, "ATTEMPT_TARGET");
  if (
    ref.attemptId !== attempt.attemptId ||
    ref.targetId !== target.targetId ||
    ref.candidateManifestSha256 !== candidate.manifestSha256
  )
    throw new Error("ATTEMPT_EVIDENCE_AUTHORITY_MISMATCH");
  if (
    ref.origin !== undefined &&
    ref.origin !== `https://${String(target.domain)}/`
  )
    throw new Error("ATTEMPT_SMOKE_ORIGIN_MISMATCH");
};

export const completeAttemptEvidenceSha256 = (attempt: JsonRecord): string =>
  canonicalSha256({
    migration: attempt.migration,
    initialSmoke: attempt.initialSmoke,
    postDeployBackup: attempt.postDeployBackup,
    restoreEvidence: attempt.restoreEvidence,
    productionUnchangedSha256: attempt.productionUnchangedSha256,
    postRestoreSmoke: attempt.postRestoreSmoke,
  });

export const projectAttemptState = (attempt: JsonRecord): void => {
  const log = verifyTransitionLog(attempt.transitionLog);
  const state = attempt.currentState;
  if (
    typeof state !== "string" ||
    !ATTEMPT_STATES.includes(state as AttemptState) ||
    log.at(-1)?.to !== state
  )
    throw new Error("ATTEMPT_STATE_PROJECTION");
  const stateValue = state as AttemptState;
  const resume = record(attempt.resume, "ATTEMPT_RESUME");
  if (resume.count === 1) {
    const interruptedIndex = log.findIndex(
      (entry) => entry.to === "INTERRUPTED",
    );
    const resumingIndex = log.findIndex((entry) => entry.to === "RESUMING");
    if (
      interruptedIndex < 1 ||
      resumingIndex !== interruptedIndex + 1 ||
      log[interruptedIndex]?.from !== resume.interruptedState ||
      log[interruptedIndex]?.occurredAt !== resume.interruptedAt ||
      log[interruptedIndex]?.transitionSha256 !== resume.lastTransitionSha256 ||
      log[resumingIndex]?.occurredAt !== resume.resumedAt
    )
      throw new Error("ATTEMPT_RESUME_PROJECTION");
    const next = log[resumingIndex + 1];
    const forwardIndex = forward.indexOf(
      resume.interruptedState as AttemptState,
    );
    if (
      next !== undefined &&
      next.to !== "FAILED" &&
      (forwardIndex < 0 || next.to !== forward[forwardIndex + 1])
    )
      throw new Error("ATTEMPT_RESUME_NEXT_STATE");
  }
  const targetId = record(attempt.target, "ATTEMPT_TARGET").targetId;
  let database: JsonRecord | null = null;
  if (reached(log, "SAFETY_BACKUP_RESOLVED")) {
    if (attempt.sourceDatabase === null)
      throw new Error("ATTEMPT_DATABASE_IDENTITY_REQUIRED");
    database = parseDatabaseIdentity(attempt.sourceDatabase);
    if (database.targetId !== targetId)
      throw new Error("ATTEMPT_DATABASE_TARGET_MISMATCH");
    const safety = record(attempt.safetyBackup, "ATTEMPT_SAFETY_BACKUP");
    if (attempt.previousRelease === null) {
      const fresh = verifyFreshTargetProof(safety);
      if (fresh.targetId !== targetId)
        throw new Error("ATTEMPT_FRESH_TARGET_MISMATCH");
      if (
        transitionEvidence(log, "SAFETY_BACKUP_RESOLVED") !==
        canonicalSha256(fresh)
      )
        throw new Error("ATTEMPT_FRESH_TRANSITION_MISMATCH");
    } else {
      const backup = verifyBackupReference(safety, "PRE_MIGRATION_SAFETY");
      requireBound(attempt, backup);
      if (backup.databaseInstanceSha256 !== database.databaseInstanceSha256)
        throw new Error("ATTEMPT_SAFETY_DATABASE_MISMATCH");
      if (
        transitionEvidence(log, "SAFETY_BACKUP_RESOLVED") !==
        backup.backupManifestSha256
      )
        throw new Error("ATTEMPT_SAFETY_TRANSITION_MISMATCH");
    }
  }
  if (reached(log, "MIGRATION_SUCCEEDED")) {
    const migration = parseMigrationEvidence(attempt.migration);
    if (
      transitionEvidence(log, "MIGRATION_SUCCEEDED") !==
      canonicalSha256(migration)
    )
      throw new Error("ATTEMPT_MIGRATION_TRANSITION_MISMATCH");
  }
  let initial: JsonRecord | null = null;
  if (reached(log, "INITIAL_SMOKE_PASSED")) {
    initial = verifySmokeReference(attempt.initialSmoke, "EXTERNAL_INITIAL");
    requireBound(attempt, initial);
    if (transitionEvidence(log, "INITIAL_SMOKE_PASSED") !== initial.smokeSha256)
      throw new Error("ATTEMPT_INITIAL_SMOKE_TRANSITION_MISMATCH");
  }
  let postBackup: JsonRecord | null = null;
  if (reached(log, "POST_DEPLOY_BACKUP_VERIFIED")) {
    postBackup = verifyBackupReference(
      attempt.postDeployBackup,
      "POST_DEPLOY_RECOVERABILITY",
    );
    requireBound(attempt, postBackup);
    if (
      database === null ||
      postBackup.databaseInstanceSha256 !== database.databaseInstanceSha256
    )
      throw new Error("ATTEMPT_POST_BACKUP_DATABASE_MISMATCH");
    if (
      transitionEvidence(log, "POST_DEPLOY_BACKUP_VERIFIED") !==
      postBackup.backupManifestSha256
    )
      throw new Error("ATTEMPT_POST_BACKUP_TRANSITION_MISMATCH");
  }
  let restore: JsonRecord | null = null;
  if (reached(log, "RESTORE_VERIFIED")) {
    restore = verifyRestoreReference(attempt.restoreEvidence);
    requireBound(attempt, restore);
    if (
      postBackup === null ||
      restore.backupId !== postBackup.backupId ||
      restore.backupManifestSha256 !== postBackup.backupManifestSha256 ||
      restore.ciphertextSha256 !== postBackup.ciphertextSha256 ||
      restore.sourceDatabaseInstanceSha256 !== postBackup.databaseInstanceSha256
    )
      throw new Error("ATTEMPT_RESTORE_BACKUP_MISMATCH");
    if (
      transitionEvidence(log, "RESTORE_VERIFIED") !==
      restore.restoreEvidenceSha256
    )
      throw new Error("ATTEMPT_RESTORE_TRANSITION_MISMATCH");
  }
  if (reached(log, "PRODUCTION_UNCHANGED_VERIFIED")) {
    const unchanged = digest(
      attempt.productionUnchangedSha256,
      "ATTEMPT_PRODUCTION_UNCHANGED",
    );
    if (
      restore === null ||
      restore.productionUnchangedSha256 !== unchanged ||
      transitionEvidence(log, "PRODUCTION_UNCHANGED_VERIFIED") !== unchanged
    )
      throw new Error("ATTEMPT_PRODUCTION_UNCHANGED_MISMATCH");
  }
  if (reached(log, "POST_RESTORE_SMOKE_PASSED")) {
    const post = verifySmokeReference(
      attempt.postRestoreSmoke,
      "EXTERNAL_POST_RESTORE",
    );
    requireBound(attempt, post);
    if (
      initial === null ||
      restore === null ||
      post.syntheticStorySha256 !== initial.syntheticStorySha256 ||
      post.resourceIdsSha256 !== initial.resourceIdsSha256 ||
      post.assertionSetSha256 !== initial.assertionSetSha256 ||
      restore.syntheticStorySha256 !== initial.syntheticStorySha256 ||
      restore.resourceIdsSha256 !== initial.resourceIdsSha256 ||
      restore.assertionSetSha256 !== initial.assertionSetSha256
    )
      throw new Error("ATTEMPT_STORY_CHAIN_MISMATCH");
    if (
      transitionEvidence(log, "POST_RESTORE_SMOKE_PASSED") !== post.smokeSha256
    )
      throw new Error("ATTEMPT_POST_SMOKE_TRANSITION_MISMATCH");
  }
  if (stateValue === "DEPLOYED") {
    if (!reached(log, "POST_RESTORE_SMOKE_PASSED"))
      throw new Error("ATTEMPT_DEPLOYED_EVIDENCE_REQUIRED");
    if (
      transitionEvidence(log, "DEPLOYED") !==
      completeAttemptEvidenceSha256(attempt)
    )
      throw new Error("ATTEMPT_DEPLOYED_TRANSITION_MISMATCH");
  }
  if (terminal.has(stateValue) !== (attempt.finishedAt !== null))
    throw new Error("ATTEMPT_FINISHED_AT");
};

const allowedProjection: Partial<Record<AttemptState, readonly string[]>> = {
  PREFLIGHT_PASSED: ["sourceDatabase"],
  SAFETY_BACKUP_RESOLVED: ["sourceDatabase", "safetyBackup"],
  MIGRATION_SUCCEEDED: ["migration"],
  INITIAL_SMOKE_PASSED: ["initialSmoke"],
  POST_DEPLOY_BACKUP_VERIFIED: ["postDeployBackup"],
  RESTORE_VERIFIED: ["restoreEvidence"],
  PRODUCTION_UNCHANGED_VERIFIED: ["productionUnchangedSha256"],
  POST_RESTORE_SMOKE_PASSED: ["postRestoreSmoke"],
  ROLLING_BACK: ["rollback"],
  RESUMING: ["resume"],
  ROLLED_BACK: ["rollback"],
  ROLLBACK_FAILED: ["rollback"],
};

export const resumeInterruptedAttempt = (
  attempt: JsonRecord,
  input: { occurredAt: string; reasonCode: string },
): JsonRecord => {
  projectAttemptState(attempt);
  if (attempt.currentState !== "INTERRUPTED")
    throw new Error("ATTEMPT_RESUME_STATE");
  const resume = record(attempt.resume, "ATTEMPT_RESUME");
  if (resume.count !== 0) throw new Error("ATTEMPT_RESUME_LIMIT");
  const log = verifyTransitionLog(attempt.transitionLog);
  const interrupted = log.at(-1);
  if (interrupted === undefined || interrupted.to !== "INTERRUPTED")
    throw new Error("ATTEMPT_RESUME_TRANSITION");
  const occurred = time(input.occurredAt, "ATTEMPT_RESUME_TIME");
  const interruptedAt = String(interrupted.occurredAt);
  if (
    Date.parse(occurred) - Date.parse(interruptedAt) > 2 * 60 * 60 * 1000 ||
    Date.parse(occurred) - Date.parse(String(attempt.startedAt)) >
      4 * 60 * 60 * 1000
  )
    throw new Error("ATTEMPT_RESUME_WINDOW");
  const projection = {
    resume: {
      count: 1,
      interruptedState: interrupted.from,
      interruptedAt,
      reasonCode: input.reasonCode,
      lastTransitionSha256: interrupted.transitionSha256,
      resumedAt: occurred,
    },
  };
  return transitionAttempt(attempt, {
    to: "RESUMING",
    occurredAt: occurred,
    reasonCode: input.reasonCode,
    evidenceSha256: canonicalSha256(projection),
    projection,
  });
};

export const interruptAttempt = (
  attempt: JsonRecord,
  input: { occurredAt: string; reasonCode: string },
): JsonRecord => {
  projectAttemptState(attempt);
  const state = attempt.currentState as AttemptState;
  if (!forward.slice(0, -1).includes(state))
    throw new Error("ATTEMPT_INTERRUPT_STATE");
  const resume = record(attempt.resume, "ATTEMPT_RESUME");
  if (resume.count !== 0) throw new Error("ATTEMPT_RESUME_LIMIT");
  return transitionAttempt(attempt, {
    to: "INTERRUPTED",
    occurredAt: time(input.occurredAt, "ATTEMPT_INTERRUPT_TIME"),
    reasonCode: input.reasonCode,
    evidenceSha256: canonicalSha256({
      state,
      reasonCode: input.reasonCode,
      lastTransitionSha256: verifyTransitionLog(attempt.transitionLog).at(-1)
        ?.transitionSha256,
    }),
  });
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
  const projection = input.projection ?? {};
  const allowed = allowedProjection[input.to] ?? [];
  if (Object.keys(projection).some((key) => !allowed.includes(key)))
    throw new Error(`ATTEMPT_PROJECTION_FORBIDDEN:${input.to}`);
  const updated: JsonRecord = {
    ...attempt,
    ...projection,
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
