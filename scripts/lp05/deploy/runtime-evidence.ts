import { exactKeys, record, type JsonRecord } from "../shared/contracts.js";
import { canonicalSha256 } from "../shared/canonical-json.js";

export interface DeploymentEvidenceBundle {
  sourceDatabase: JsonRecord;
  safetyBackup: JsonRecord;
  migration: JsonRecord;
  appReady: JsonRecord;
  httpsReady: JsonRecord;
  initialSmoke: JsonRecord;
  postDeployBackup: JsonRecord;
  restoreEnvironment: JsonRecord;
  restore: JsonRecord;
  postRestoreSmoke: JsonRecord;
}

const digest = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
    throw new Error(code);
  return value;
};

export const parsePhaseObservation = (
  value: unknown,
  phase: "APP_READY" | "HTTPS_READY" | "RESTORE_ENV_READY",
): JsonRecord => {
  const input = record(value, "DEPLOYMENT_PHASE_OBSERVATION");
  exactKeys(
    input,
    [
      "schemaVersion",
      "phase",
      "attemptId",
      "targetId",
      "candidateManifestSha256",
      "observedAt",
      "detailsSha256",
      "evidenceSha256",
      "status",
    ],
    "DEPLOYMENT_PHASE_OBSERVATION",
  );
  if (
    input.schemaVersion !== "1.0" ||
    input.phase !== phase ||
    input.status !== "PASS" ||
    typeof input.attemptId !== "string" ||
    typeof input.targetId !== "string" ||
    typeof input.observedAt !== "string" ||
    Number.isNaN(Date.parse(input.observedAt))
  )
    throw new Error("DEPLOYMENT_PHASE_OBSERVATION_VALUE");
  digest(
    input.candidateManifestSha256,
    "DEPLOYMENT_PHASE_OBSERVATION_CANDIDATE",
  );
  digest(input.detailsSha256, "DEPLOYMENT_PHASE_OBSERVATION_DETAILS");
  const evidenceSha = digest(
    input.evidenceSha256,
    "DEPLOYMENT_PHASE_OBSERVATION_SHA",
  );
  if (canonicalSha256(input, ["evidenceSha256"]) !== evidenceSha)
    throw new Error("DEPLOYMENT_PHASE_OBSERVATION_DIGEST");
  return input;
};

export const verifyFreshTargetProof = (value: unknown): JsonRecord => {
  const input = record(value, "RUNTIME_FRESH_TARGET");
  exactKeys(
    input,
    ["kind", "targetId", "verifiedAt", "assertions"],
    "RUNTIME_FRESH_TARGET",
  );
  if (
    input.kind !== "FRESH_TARGET" ||
    typeof input.targetId !== "string" ||
    typeof input.verifiedAt !== "string" ||
    Number.isNaN(Date.parse(input.verifiedAt)) ||
    !Array.isArray(input.assertions)
  )
    throw new Error("RUNTIME_FRESH_TARGET_VALUE");
  const ids = input.assertions.map((value) => {
    const assertion = record(value, "RUNTIME_FRESH_ASSERTION");
    exactKeys(assertion, ["id", "status"], "RUNTIME_FRESH_ASSERTION");
    if (assertion.status !== "PASS") throw new Error("RUNTIME_FRESH_STATUS");
    return String(assertion.id);
  });
  if (
    [...ids].sort().join("\0") !==
    ["no_application_data", "no_prior_release", "no_production_volume"].join(
      "\0",
    )
  )
    throw new Error("RUNTIME_FRESH_ASSERTIONS");
  return input;
};

export const parseDeploymentEvidenceBundle = (
  value: unknown,
): DeploymentEvidenceBundle => {
  const input = record(value, "DEPLOYMENT_RUNTIME_EVIDENCE");
  exactKeys(
    input,
    [
      "sourceDatabase",
      "safetyBackup",
      "migration",
      "appReady",
      "httpsReady",
      "initialSmoke",
      "postDeployBackup",
      "restoreEnvironment",
      "restore",
      "postRestoreSmoke",
    ],
    "DEPLOYMENT_RUNTIME_EVIDENCE",
  );
  return {
    sourceDatabase: record(input.sourceDatabase, "DEPLOYMENT_SOURCE_DATABASE"),
    safetyBackup: record(input.safetyBackup, "DEPLOYMENT_SAFETY_BACKUP"),
    migration: record(input.migration, "DEPLOYMENT_MIGRATION"),
    appReady: parsePhaseObservation(input.appReady, "APP_READY"),
    httpsReady: parsePhaseObservation(input.httpsReady, "HTTPS_READY"),
    initialSmoke: record(input.initialSmoke, "DEPLOYMENT_INITIAL_SMOKE"),
    postDeployBackup: record(input.postDeployBackup, "DEPLOYMENT_POST_BACKUP"),
    restoreEnvironment: parsePhaseObservation(
      input.restoreEnvironment,
      "RESTORE_ENV_READY",
    ),
    restore: record(input.restore, "DEPLOYMENT_RESTORE"),
    postRestoreSmoke: record(
      input.postRestoreSmoke,
      "DEPLOYMENT_POST_RESTORE_SMOKE",
    ),
  };
};
