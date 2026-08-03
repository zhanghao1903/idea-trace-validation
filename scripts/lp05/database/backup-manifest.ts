import { canonicalSha256 } from "../shared/canonical-json.js";
import { verifyBackupManifest, type JsonRecord } from "../shared/contracts.js";

export const finalizeBackupManifest = (
  fields: Omit<JsonRecord, "backupManifestSha256">,
): JsonRecord => {
  const manifest: JsonRecord = { ...fields, backupManifestSha256: "" };
  manifest.backupManifestSha256 = canonicalSha256(manifest, [
    "backupManifestSha256",
  ]);
  verifyBackupManifest(manifest);
  return manifest;
};

export const assertPostDeployBackup = (
  manifest: unknown,
  expected: {
    envelopeId: string;
    attemptId: string;
    targetId: string;
    candidateManifestSha256: string;
    databaseInstanceSha256: string;
    syntheticStorySha256: string;
  },
): JsonRecord => {
  const parsed = verifyBackupManifest(manifest);
  const database = parsed.sourceDatabase as JsonRecord;
  if (
    parsed.purpose !== "POST_DEPLOY_RECOVERABILITY" ||
    parsed.envelopeId !== expected.envelopeId ||
    parsed.attemptId !== expected.attemptId ||
    parsed.targetId !== expected.targetId ||
    parsed.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    database.databaseInstanceSha256 !== expected.databaseInstanceSha256 ||
    parsed.syntheticStorySha256 !== expected.syntheticStorySha256
  )
    throw new Error("POST_DEPLOY_BACKUP_MISMATCH");
  return parsed;
};

export const backupReference = (value: unknown): JsonRecord => {
  const manifest = verifyBackupManifest(value);
  const sourceDatabase = manifest.sourceDatabase as JsonRecord;
  const ciphertext = manifest.ciphertext as JsonRecord;
  return {
    backupId: manifest.backupId,
    backupManifestSha256: manifest.backupManifestSha256,
    ciphertextSha256: ciphertext.sha256,
    purpose: manifest.purpose,
    targetId: manifest.targetId,
    databaseInstanceSha256: sourceDatabase.databaseInstanceSha256,
    attemptId: manifest.attemptId,
    candidateManifestSha256: manifest.candidateManifestSha256,
  };
};
