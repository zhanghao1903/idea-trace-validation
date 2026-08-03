import { canonicalJson } from "../shared/canonical-json.js";
import {
  parseDatabaseIdentity,
  parseMigrationEvidence,
  verifyBackupManifest,
  verifyCrossRecordEquality,
  verifyRestoreEvidence,
  verifySmokeEvidence,
  type JsonRecord,
} from "../shared/contracts.js";
import {
  verifyFreshTargetProof,
  parsePhaseObservation,
  type DeploymentEvidenceBundle,
} from "./runtime-evidence.js";

export const verifyCompleteEvidenceBundle = (
  bundle: DeploymentEvidenceBundle,
  attempt: JsonRecord,
): void => {
  const database = parseDatabaseIdentity(bundle.sourceDatabase);
  const safety =
    (bundle.safetyBackup as JsonRecord).kind === "FRESH_TARGET"
      ? verifyFreshTargetProof(bundle.safetyBackup)
      : verifyBackupManifest(bundle.safetyBackup);
  const migration = parseMigrationEvidence(bundle.migration);
  const initial = verifySmokeEvidence(bundle.initialSmoke);
  const backup = verifyBackupManifest(bundle.postDeployBackup);
  const restore = verifyRestoreEvidence(bundle.restore);
  const post = verifySmokeEvidence(bundle.postRestoreSmoke);
  const phaseObservations = [
    parsePhaseObservation(bundle.appReady, "APP_READY"),
    parsePhaseObservation(bundle.httpsReady, "HTTPS_READY"),
    parsePhaseObservation(bundle.restoreEnvironment, "RESTORE_ENV_READY"),
  ];
  verifyCrossRecordEquality({
    candidate: attempt.candidate as Parameters<
      typeof verifyCrossRecordEquality
    >[0]["candidate"],
    targetId: String((attempt.target as JsonRecord).targetId),
    initialSmoke: initial,
    postDeployBackup: backup,
    restore,
    postRestoreSmoke: post,
  });
  const authorityRecords = [initial, backup, restore, post];
  if (
    authorityRecords.some(
      (record) =>
        record.attemptId !== attempt.attemptId ||
        record.targetId !== (attempt.target as JsonRecord).targetId ||
        record.candidateManifestSha256 !==
          (attempt.candidate as JsonRecord).manifestSha256,
    ) ||
    backup.envelopeId !== attempt.envelopeId ||
    restore.envelopeId !== attempt.envelopeId ||
    (backup.sourceDatabase as JsonRecord).databaseInstanceSha256 !==
      database.databaseInstanceSha256 ||
    canonicalJson(restore.migration) !== canonicalJson(migration)
  )
    throw new Error("DEPLOYMENT_BUNDLE_AUTHORITY_MISMATCH");
  if (
    phaseObservations.some(
      (observation) =>
        observation.attemptId !== attempt.attemptId ||
        observation.targetId !== (attempt.target as JsonRecord).targetId ||
        observation.candidateManifestSha256 !==
          (attempt.candidate as JsonRecord).manifestSha256,
    )
  )
    throw new Error("DEPLOYMENT_PHASE_AUTHORITY_MISMATCH");
  if (attempt.previousRelease === null) {
    if (
      safety.kind !== "FRESH_TARGET" ||
      safety.targetId !== (attempt.target as JsonRecord).targetId
    )
      throw new Error("DEPLOYMENT_BUNDLE_FRESH_TARGET_MISMATCH");
  } else {
    if (
      safety.purpose !== "PRE_MIGRATION_SAFETY" ||
      safety.envelopeId !== attempt.envelopeId ||
      safety.attemptId !== attempt.attemptId ||
      safety.targetId !== (attempt.target as JsonRecord).targetId ||
      (safety.sourceDatabase as JsonRecord).databaseInstanceSha256 !==
        database.databaseInstanceSha256
    )
      throw new Error("DEPLOYMENT_BUNDLE_SAFETY_BACKUP_MISMATCH");
  }
};
