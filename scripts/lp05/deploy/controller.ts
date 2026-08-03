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
export type DeploymentOracle = (
  attempt: JsonRecord,
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
  const advance = async (next: JsonRecord): Promise<void> => {
    await input.revalidate?.(attempt);
    await input.persist?.(attempt, next);
    attempt = next;
  };
  try {
    for (const step of remainingSequence(attempt)) {
      await input.revalidate?.(attempt);
      const result = await input.oracles[step.oracle](attempt);
      if (!/^[0-9a-f]{64}$/u.test(result.evidenceSha256))
        throw new Error("CONTROLLER_EVIDENCE_DIGEST");
      await advance(
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
    await advance(
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
    if (
      ["DEPLOYED", "FAILED", "ROLLED_BACK", "ROLLBACK_FAILED"].includes(
        String(attempt.currentState),
      )
    )
      throw error;
    await advance(
      finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "FAILED",
          occurredAt: now().toISOString(),
          reasonCode: "ORACLE_FAILED",
          evidenceSha256: sha256(
            error instanceof Error ? error.message : "UNKNOWN_ORACLE_FAILURE",
          ),
        }),
      ),
    );
    await advance(
      finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "ROLLING_BACK",
          occurredAt: now().toISOString(),
          reasonCode: "INGRESS_DISABLE_AND_ROLLBACK_STARTED",
          evidenceSha256: sha256("INGRESS_DISABLE_AND_ROLLBACK_STARTED"),
          projection: { rollback: attempt.rollback },
        }),
      ),
    );
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
          occurredAt: now().toISOString(),
          reasonCode: rollback.reasonCode,
          evidenceSha256: rollback.evidenceSha256,
          projection,
        }),
      );
      await advance(next);
      return attempt;
    } catch (rollbackError) {
      const failedRollback = {
        status: "FAIL",
        reasonCode: "ROLLBACK_ORACLE_FAILED",
        previousRelease: attempt.previousRelease,
        readinessSha256: null,
        smokeSha256: null,
        startedAt: now().toISOString(),
        finishedAt: now().toISOString(),
      };
      const next = finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "ROLLBACK_FAILED",
          occurredAt: now().toISOString(),
          reasonCode: "ROLLBACK_ORACLE_FAILED",
          evidenceSha256: sha256(
            rollbackError instanceof Error
              ? rollbackError.message
              : "UNKNOWN_ROLLBACK_FAILURE",
          ),
          projection: { rollback: failedRollback },
        }),
      );
      await advance(next);
      return attempt;
    }
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
