import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  parseIsolatedRestoreTarget,
  parseProductionResourceIdentity,
  verifyRestoreEvidence,
  type JsonRecord,
} from "../shared/contracts.js";

export const finalizeRestoreEvidence = (
  fields: Omit<JsonRecord, "restoreEvidenceSha256">,
): JsonRecord => {
  const evidence: JsonRecord = { ...fields, restoreEvidenceSha256: "" };
  evidence.restoreEvidenceSha256 = canonicalSha256(evidence, [
    "restoreEvidenceSha256",
  ]);
  verifyRestoreEvidence(evidence);
  return evidence;
};

export const assertIsolatedTarget = (
  isolated: JsonRecord,
  production: JsonRecord,
): void => {
  const target = parseIsolatedRestoreTarget(isolated);
  const productionIdentity = parseProductionResourceIdentity(production);
  const productionDatabase = productionIdentity.database as JsonRecord;
  if (
    target.composeProject === productionIdentity.composeProject ||
    target.containerId === productionDatabase.containerId ||
    target.volumeName === productionDatabase.volumeName ||
    target.systemIdentifier === productionDatabase.systemIdentifier ||
    target.volumeLabelSha256 === productionDatabase.volumeLabelSha256 ||
    target.containerLabelSha256 === productionDatabase.containerLabelSha256
  )
    throw new Error("RESTORE_TARGET_NOT_ISOLATED");
};

export const assertLiveIsolatedTarget = (
  declared: JsonRecord,
  observed: JsonRecord,
): void => {
  const expected = parseIsolatedRestoreTarget(declared);
  const actual = parseIsolatedRestoreTarget(observed);
  for (const field of [
    "composeProject",
    "containerId",
    "volumeName",
    "systemIdentifier",
    "volumeLabelSha256",
    "containerLabelSha256",
    "databaseHost",
    "databasePort",
    "databaseName",
  ] as const) {
    if (actual[field] !== expected[field])
      throw new Error(`RESTORE_LIVE_TARGET_MISMATCH:${field}`);
  }
};

export const restoreReference = (value: unknown): JsonRecord => {
  const evidence = verifyRestoreEvidence(value);
  const backup = evidence.backup as JsonRecord;
  const story = evidence.restoredStory as JsonRecord;
  return {
    restoreId: evidence.restoreId,
    restoreEvidenceSha256: evidence.restoreEvidenceSha256,
    attemptId: evidence.attemptId,
    targetId: evidence.targetId,
    candidateManifestSha256: evidence.candidateManifestSha256,
    backupId: backup.backupId,
    backupManifestSha256: backup.backupManifestSha256,
    ciphertextSha256: backup.ciphertextSha256,
    sourceDatabaseInstanceSha256: evidence.sourceDatabaseInstanceSha256,
    productionUnchangedSha256: canonicalSha256(
      parseProductionResourceIdentity(evidence.productionBefore),
    ),
    syntheticStorySha256: story.syntheticStorySha256,
    resourceIdsSha256: story.resourceIdsSha256,
    assertionSetSha256: story.assertionSetSha256,
    status: evidence.status,
  };
};
