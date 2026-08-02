import { canonicalSha256 } from "../shared/canonical-json.js";
import { verifyRestoreEvidence, type JsonRecord } from "../shared/contracts.js";

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
  if (
    isolated.kind !== "ISOLATED" ||
    !String(isolated.composeProject).startsWith("lp05-restore-") ||
    isolated.composeProject === production.composeProject ||
    isolated.systemIdentifier ===
      (production.database as JsonRecord).systemIdentifier ||
    isolated.volumeLabelSha256 ===
      (production.database as JsonRecord).volumeLabelSha256 ||
    isolated.containerLabelSha256 ===
      (production.database as JsonRecord).containerLabelSha256
  )
    throw new Error("RESTORE_TARGET_NOT_ISOLATED");
};
