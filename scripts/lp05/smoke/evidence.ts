import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  verifyCrossRecordEquality,
  verifyDeploymentEvidence,
  type CandidateIdentityV1,
  type JsonRecord,
} from "../shared/contracts.js";

export const finalizeDeploymentEvidence = (
  fields: Omit<JsonRecord, "deploymentEvidenceSha256">,
  linked: {
    candidate: CandidateIdentityV1;
    targetId: string;
    initialSmoke: JsonRecord;
    postDeployBackup: JsonRecord;
    restore: JsonRecord;
    postRestoreSmoke: JsonRecord;
  },
): JsonRecord => {
  verifyCrossRecordEquality(linked);
  const evidence: JsonRecord = { ...fields, deploymentEvidenceSha256: "" };
  evidence.deploymentEvidenceSha256 = canonicalSha256(evidence, [
    "deploymentEvidenceSha256",
  ]);
  verifyDeploymentEvidence(evidence);
  return evidence;
};
