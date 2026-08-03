import { canonicalJson, sha256 } from "../shared/canonical-json.js";
import {
  record,
  verifyDeploymentAuthorizationEnvelope,
  type AttemptState,
  type JsonRecord,
} from "../shared/contracts.js";
import { finalizeAttemptRecord } from "./attempt-record.js";
import {
  completeAttemptEvidenceSha256,
  transitionAttempt,
} from "./attempt-state.js";

export interface DeploymentStepResult {
  reasonCode: string;
  evidenceSha256: string;
  projection?: JsonRecord;
}
export interface DeploymentOracleContext {
  deadlineAt: number;
  signal: AbortSignal;
}
export type DeploymentOracle = (
  attempt: JsonRecord,
  context?: DeploymentOracleContext,
) => Promise<DeploymentStepResult>;

export interface DeploymentOracles {
  preflight: DeploymentOracle;
  safetyBackup: DeploymentOracle;
  migrate: DeploymentOracle;
  appReady: DeploymentOracle;
  httpsReady: DeploymentOracle;
  initialSmoke: DeploymentOracle;
  postDeployBackup: DeploymentOracle;
  restoreEnvironment: DeploymentOracle;
  restore: DeploymentOracle;
  productionUnchanged: DeploymentOracle;
  postRestoreSmoke: DeploymentOracle;
  rollback: DeploymentOracle;
}

const sequence: { to: AttemptState; oracle: keyof DeploymentOracles }[] = [
  { to: "PREFLIGHT_PASSED", oracle: "preflight" },
  { to: "SAFETY_BACKUP_RESOLVED", oracle: "safetyBackup" },
  { to: "MIGRATION_SUCCEEDED", oracle: "migrate" },
  { to: "APP_READY", oracle: "appReady" },
  { to: "HTTPS_READY", oracle: "httpsReady" },
  { to: "INITIAL_SMOKE_PASSED", oracle: "initialSmoke" },
  { to: "POST_DEPLOY_BACKUP_VERIFIED", oracle: "postDeployBackup" },
  { to: "RESTORE_ENV_READY", oracle: "restoreEnvironment" },
  { to: "RESTORE_VERIFIED", oracle: "restore" },
  { to: "PRODUCTION_UNCHANGED_VERIFIED", oracle: "productionUnchanged" },
  { to: "POST_RESTORE_SMOKE_PASSED", oracle: "postRestoreSmoke" },
];

const remainingSequence = (
  attempt: JsonRecord,
): { to: AttemptState; oracle: keyof DeploymentOracles }[] => {
  const state = attempt.currentState as AttemptState;
  if (state === "RESUMING") {
    const resume = attempt.resume as JsonRecord;
    const interruptedState = resume.interruptedState as AttemptState;
    const completedIndex = sequence.findIndex(
      (step) => step.to === interruptedState,
    );
    if (interruptedState === "PREPARED") return sequence;
    if (completedIndex >= 0) return sequence.slice(completedIndex + 1);
    throw new Error(`CONTROLLER_RESUME_STATE_NOT_RUNNABLE:${interruptedState}`);
  }
  if (state === "DEPLOYED") return [];
  if (state === "PREPARED") return sequence;
  throw new Error(`CONTROLLER_STATE_NOT_RUNNABLE:${state}`);
};

export const assertControllerInitialAttempt = (
  attemptValue: unknown,
): JsonRecord => {
  const attempt = record(attemptValue, "CONTROLLER_INITIAL_ATTEMPT");
  if (attempt.currentState !== "PREPARED")
    throw new Error("CONTROLLER_INITIAL_ATTEMPT_NOT_PREPARED");
  const transitions = attempt.transitionLog;
  if (
    !Array.isArray(transitions) ||
    transitions.length !== 1 ||
    record(transitions[0], "CONTROLLER_INITIAL_TRANSITION").from !== null ||
    record(transitions[0], "CONTROLLER_INITIAL_TRANSITION").to !== "PREPARED"
  )
    throw new Error("CONTROLLER_INITIAL_ATTEMPT_HISTORY");
  return attempt;
};

export const runDeployment = async (input: {
  envelope: unknown;
  attempt: JsonRecord;
  oracles: DeploymentOracles;
  now?: () => Date;
  persist?: (previous: JsonRecord, next: JsonRecord) => Promise<void>;
  revalidate?: (attempt: JsonRecord) => Promise<void>;
  maximumDurationMs?: number;
}): Promise<JsonRecord> => {
  const now = input.now ?? (() => new Date());
  const envelope = verifyDeploymentAuthorizationEnvelope(
    input.envelope,
    now(),
    {
      workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
      featureId: "lp-05-deployment-release-8c3f1a6d5e20",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
    },
  );
  if (
    input.attempt.envelopeId !== envelope.envelopeId ||
    input.attempt.envelopeSha256 !== envelope.envelopeSha256
  )
    throw new Error("CONTROLLER_ENVELOPE_MISMATCH");
  const proposal = record(envelope.proposal, "CONTROLLER_PROPOSAL");
  if (
    canonicalJson(input.attempt.candidate) !==
      canonicalJson(proposal.candidate) ||
    canonicalJson(input.attempt.target) !== canonicalJson(proposal.target) ||
    canonicalJson(input.attempt.previousRelease) !==
      canonicalJson(proposal.previousRelease)
  )
    throw new Error("CONTROLLER_ATTEMPT_AUTHORITY_MISMATCH");
  let attempt = finalizeAttemptRecord(input.attempt);
  if (attempt.currentState === "DEPLOYED") return attempt;
  const maximumDurationMs = input.maximumDurationMs ?? 4 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(maximumDurationMs) || maximumDurationMs < 1)
    throw new Error("CONTROLLER_ATTEMPT_DURATION_INVALID");
  const deadlineAt = Date.parse(String(attempt.startedAt)) + maximumDurationMs;
  const assertDeadline = (): void => {
    if (now().getTime() >= deadlineAt)
      throw new Error("CONTROLLER_ATTEMPT_DEADLINE_EXCEEDED");
  };
  const runOracle = async (
    oracle: DeploymentOracle,
  ): Promise<DeploymentStepResult> => {
    assertDeadline();
    const remaining = Math.max(1, deadlineAt - now().getTime());
    const abort = new AbortController();
    let deadlineTriggered = false;
    const abortTimer = setTimeout(() => {
      deadlineTriggered = true;
      abort.abort(new Error("CONTROLLER_ATTEMPT_DEADLINE_EXCEEDED"));
    }, remaining);
    try {
      // The oracle Promise is the ownership boundary for every forward actor it
      // starts. Cancellation is cooperative, but terminal recovery must still
      // join that boundary. Racing it would allow a signal-ignoring mutation to
      // outlive rollback and invalidate the terminal journal.
      const result = await oracle(attempt, {
        deadlineAt,
        signal: abort.signal,
      });
      if (deadlineTriggered)
        throw new Error("CONTROLLER_ATTEMPT_DEADLINE_EXCEEDED");
      assertDeadline();
      return result;
    } finally {
      clearTimeout(abortTimer);
    }
  };
  const advanceForward = async (next: JsonRecord): Promise<void> => {
    assertDeadline();
    await input.revalidate?.(attempt);
    await input.persist?.(attempt, next);
    attempt = next;
  };
  try {
    for (const step of remainingSequence(attempt)) {
      assertDeadline();
      await input.revalidate?.(attempt);
      const result = await runOracle(input.oracles[step.oracle]);
      if (!/^[0-9a-f]{64}$/u.test(result.evidenceSha256))
        throw new Error("CONTROLLER_EVIDENCE_DIGEST");
      await advanceForward(
        finalizeAttemptRecord(
          transitionAttempt(attempt, {
            to: step.to,
            occurredAt: now().toISOString(),
            reasonCode: result.reasonCode,
            evidenceSha256: result.evidenceSha256,
            projection: result.projection,
          }),
        ),
      );
    }
    await advanceForward(
      finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "DEPLOYED",
          occurredAt: now().toISOString(),
          reasonCode: "COMPLETE_EQUALITY_CHAIN_VERIFIED",
          evidenceSha256: completeAttemptEvidenceSha256(attempt),
        }),
      ),
    );
    return attempt;
  } catch (error) {
    return recoverDeploymentFailure({
      attempt,
      oracles: input.oracles,
      persist: input.persist,
      now,
      error,
    });
  }
};

export const recoverDeploymentFailure = async (input: {
  attempt: JsonRecord;
  oracles: DeploymentOracles;
  persist?: (previous: JsonRecord, next: JsonRecord) => Promise<void>;
  now?: () => Date;
  error: unknown;
}): Promise<JsonRecord> => {
  const now = input.now ?? (() => new Date());
  let attempt = finalizeAttemptRecord(input.attempt);
  if (
    ["DEPLOYED", "ROLLED_BACK", "ROLLBACK_FAILED"].includes(
      String(attempt.currentState),
    )
  )
    return attempt;
  const occurredAt = (): string =>
    new Date(
      Math.max(now().getTime(), Date.parse(String(attempt.updatedAt))),
    ).toISOString();
  const advanceRecovery = async (next: JsonRecord): Promise<void> => {
    await input.persist?.(attempt, next);
    attempt = next;
  };
  if (!["FAILED", "ROLLING_BACK"].includes(String(attempt.currentState))) {
    await advanceRecovery(
      finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "FAILED",
          occurredAt: occurredAt(),
          reasonCode: "ORACLE_FAILED",
          evidenceSha256: sha256(
            input.error instanceof Error
              ? input.error.message
              : "UNKNOWN_ORACLE_FAILURE",
          ),
        }),
      ),
    );
  }
  if (attempt.currentState === "FAILED") {
    await advanceRecovery(
      finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "ROLLING_BACK",
          occurredAt: occurredAt(),
          reasonCode: "INGRESS_DISABLE_AND_ROLLBACK_STARTED",
          evidenceSha256: sha256("INGRESS_DISABLE_AND_ROLLBACK_STARTED"),
          projection: { rollback: attempt.rollback },
        }),
      ),
    );
  }
  try {
    const rollback = await input.oracles.rollback(attempt);
    const projection = rollback.projection ?? {};
    const evidence = recordRollback(projection.rollback);
    const next = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to:
          evidence.status === "PASS" || evidence.status === "NOT_APPLICABLE"
            ? "ROLLED_BACK"
            : "ROLLBACK_FAILED",
        occurredAt: occurredAt(),
        reasonCode: rollback.reasonCode,
        evidenceSha256: rollback.evidenceSha256,
        projection,
      }),
    );
    await advanceRecovery(next);
    return attempt;
  } catch (rollbackError) {
    const timestamp = occurredAt();
    const failedRollback = {
      status: "FAIL",
      reasonCode: "ROLLBACK_ORACLE_FAILED",
      previousRelease: attempt.previousRelease,
      readinessSha256: null,
      smokeSha256: null,
      startedAt: timestamp,
      finishedAt: timestamp,
    };
    const next = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to: "ROLLBACK_FAILED",
        occurredAt: timestamp,
        reasonCode: "ROLLBACK_ORACLE_FAILED",
        evidenceSha256: sha256(
          rollbackError instanceof Error
            ? rollbackError.message
            : "UNKNOWN_ROLLBACK_FAILURE",
        ),
        projection: { rollback: failedRollback },
      }),
    );
    await advanceRecovery(next);
    return attempt;
  }
};

const recordRollback = (value: unknown): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("CONTROLLER_ROLLBACK_EVIDENCE");
  const result = value as JsonRecord;
  if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(String(result.status)))
    throw new Error("CONTROLLER_ROLLBACK_EVIDENCE");
  return result;
};
