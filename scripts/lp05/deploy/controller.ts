import { sha256 } from "../shared/canonical-json.js";
import {
  verifyDeploymentAuthorizationEnvelope,
  type AttemptState,
  type JsonRecord,
} from "../shared/contracts.js";
import { finalizeAttemptRecord } from "./attempt-record.js";
import { transitionAttempt } from "./attempt-state.js";

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

export const runDeployment = async (input: {
  envelope: unknown;
  attempt: JsonRecord;
  oracles: DeploymentOracles;
  now?: () => Date;
}): Promise<JsonRecord> => {
  const envelope = verifyDeploymentAuthorizationEnvelope(
    input.envelope,
    new Date(),
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
  const now = input.now ?? (() => new Date());
  let attempt = finalizeAttemptRecord(input.attempt);
  try {
    for (const step of sequence) {
      const result = await input.oracles[step.oracle](attempt);
      if (!/^[0-9a-f]{64}$/u.test(result.evidenceSha256))
        throw new Error("CONTROLLER_EVIDENCE_DIGEST");
      attempt = finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: step.to,
          occurredAt: now().toISOString(),
          reasonCode: result.reasonCode,
          evidenceSha256: result.evidenceSha256,
          projection: result.projection,
        }),
      );
    }
    const tail = (attempt.transitionLog as JsonRecord[]).at(-1);
    attempt = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to: "DEPLOYED",
        occurredAt: now().toISOString(),
        reasonCode: "COMPLETE_EQUALITY_CHAIN_VERIFIED",
        evidenceSha256: sha256(JSON.stringify(tail)),
      }),
    );
    return attempt;
  } catch (error) {
    if (
      ["DEPLOYED", "FAILED", "ROLLED_BACK", "ROLLBACK_FAILED"].includes(
        String(attempt.currentState),
      )
    )
      throw error;
    return finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to: "FAILED",
        occurredAt: now().toISOString(),
        reasonCode: "ORACLE_FAILED",
        evidenceSha256: sha256(
          error instanceof Error ? error.message : "UNKNOWN_ORACLE_FAILURE",
        ),
      }),
    );
  }
};
