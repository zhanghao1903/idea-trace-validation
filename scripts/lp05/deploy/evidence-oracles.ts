import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import {
  parseDatabaseIdentity,
  parseMigrationEvidence,
  verifyBackupManifest,
  verifyCrossRecordEquality,
  verifyRestoreEvidence,
  verifySmokeEvidence,
  type JsonRecord,
} from "../shared/contracts.js";
import { backupReference } from "../database/backup-manifest.js";
import { restoreReference } from "../database/restore-evidence.js";
import { smokeReference } from "../smoke/smoke-evidence.js";
import {
  verifyFreshTargetProof,
  parsePhaseObservation,
  type DeploymentEvidenceBundle,
} from "./runtime-evidence.js";
import type { DeploymentOracles } from "./controller.js";

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

export const createEvidenceOracles = (input: {
  bundle: DeploymentEvidenceBundle;
  rollback: () => Promise<JsonRecord>;
}): DeploymentOracles => ({
  preflight: async () => {
    const database = parseDatabaseIdentity(input.bundle.sourceDatabase);
    return {
      reasonCode: "PREFLIGHT_ACTIVE_INSPECTION_PASS",
      evidenceSha256: String(database.databaseInstanceSha256),
      projection: { sourceDatabase: database },
    };
  },
  safetyBackup: async () => {
    if ((input.bundle.safetyBackup as JsonRecord).kind === "FRESH_TARGET") {
      const proof = verifyFreshTargetProof(input.bundle.safetyBackup);
      return {
        reasonCode: "FRESH_TARGET_ACTIVE_INSPECTION_PASS",
        evidenceSha256: canonicalSha256(proof),
        projection: { safetyBackup: proof },
      };
    }
    const manifest = verifyBackupManifest(input.bundle.safetyBackup);
    const reference = backupReference(manifest);
    return {
      reasonCode: "PRE_MIGRATION_BACKUP_VERIFIED",
      evidenceSha256: String(reference.backupManifestSha256),
      projection: { safetyBackup: reference },
    };
  },
  migrate: async () => {
    const migration = parseMigrationEvidence(input.bundle.migration);
    return {
      reasonCode: "MIGRATION_CATALOG_VERIFIED",
      evidenceSha256: canonicalSha256(migration),
      projection: { migration },
    };
  },
  appReady: async () => ({
    reasonCode: "APP_READINESS_OBSERVED",
    evidenceSha256: String(input.bundle.appReady.evidenceSha256),
  }),
  httpsReady: async () => ({
    reasonCode: "HTTPS_READINESS_OBSERVED",
    evidenceSha256: String(input.bundle.httpsReady.evidenceSha256),
  }),
  initialSmoke: async () => {
    const evidence = verifySmokeEvidence(input.bundle.initialSmoke);
    const reference = smokeReference(evidence);
    return {
      reasonCode: "EXTERNAL_INITIAL_SMOKE_VERIFIED",
      evidenceSha256: String(reference.smokeSha256),
      projection: { initialSmoke: reference },
    };
  },
  postDeployBackup: async () => {
    const manifest = verifyBackupManifest(input.bundle.postDeployBackup);
    const reference = backupReference(manifest);
    return {
      reasonCode: "POST_DEPLOY_BACKUP_VERIFIED",
      evidenceSha256: String(reference.backupManifestSha256),
      projection: { postDeployBackup: reference },
    };
  },
  restoreEnvironment: async () => ({
    reasonCode: "ISOLATED_RESTORE_ENVIRONMENT_OBSERVED",
    evidenceSha256: String(input.bundle.restoreEnvironment.evidenceSha256),
  }),
  restore: async () => {
    const evidence = verifyRestoreEvidence(input.bundle.restore);
    const reference = restoreReference(evidence);
    return {
      reasonCode: "ISOLATED_RESTORE_VERIFIED",
      evidenceSha256: String(reference.restoreEvidenceSha256),
      projection: { restoreEvidence: reference },
    };
  },
  productionUnchanged: async () => {
    const reference = restoreReference(input.bundle.restore);
    return {
      reasonCode: "PRODUCTION_RESOURCES_UNCHANGED",
      evidenceSha256: String(reference.productionUnchangedSha256),
      projection: {
        productionUnchangedSha256: reference.productionUnchangedSha256,
      },
    };
  },
  postRestoreSmoke: async (attempt) => {
    const post = verifySmokeEvidence(input.bundle.postRestoreSmoke);
    verifyCrossRecordEquality({
      candidate: attempt.candidate as Parameters<
        typeof verifyCrossRecordEquality
      >[0]["candidate"],
      targetId: String((attempt.target as JsonRecord).targetId),
      initialSmoke: input.bundle.initialSmoke,
      postDeployBackup: input.bundle.postDeployBackup,
      restore: input.bundle.restore,
      postRestoreSmoke: post,
    });
    const reference = smokeReference(post);
    return {
      reasonCode: "EXTERNAL_POST_RESTORE_SMOKE_VERIFIED",
      evidenceSha256: String(reference.smokeSha256),
      projection: { postRestoreSmoke: reference },
    };
  },
  rollback: async () => {
    const evidence = await input.rollback();
    return {
      reasonCode: String(evidence.reasonCode),
      evidenceSha256: canonicalSha256(evidence),
      projection: { rollback: evidence },
    };
  },
});
