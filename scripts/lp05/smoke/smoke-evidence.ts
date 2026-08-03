import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  assertionSetSha256,
  verifySmokeEvidence,
  type JsonRecord,
} from "../shared/contracts.js";

export const finalizeSmokeEvidence = (
  fields: Omit<JsonRecord, "smokeSha256" | "assertionSetSha256">,
): JsonRecord => {
  const assertions = fields.assertions;
  const evidence: JsonRecord = {
    ...fields,
    assertionSetSha256: assertionSetSha256(assertions),
    smokeSha256: "",
  };
  evidence.smokeSha256 = canonicalSha256(evidence, ["smokeSha256"]);
  verifySmokeEvidence(evidence);
  return evidence;
};

export const smokeReference = (value: unknown): JsonRecord => {
  const evidence = verifySmokeEvidence(value);
  return {
    smokeId: evidence.smokeId,
    smokeSha256: evidence.smokeSha256,
    mode: evidence.mode,
    targetId: evidence.targetId,
    candidateManifestSha256: evidence.candidateManifestSha256,
    attemptId: evidence.attemptId,
    observedAt: evidence.observedAt,
    origin: evidence.origin,
    syntheticStorySha256: evidence.syntheticStorySha256,
    resourceIdsSha256: evidence.resourceIdsSha256,
    assertionSetSha256: evidence.assertionSetSha256,
    status: evidence.status,
  };
};
