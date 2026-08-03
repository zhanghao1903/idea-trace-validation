import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { backupReference } from "../database/backup-manifest.js";
import { restoreReference } from "../database/restore-evidence.js";
import { verifyProductionUnchanged } from "../database/production-identity.js";
import { smokeReference } from "../smoke/smoke-evidence.js";
import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import {
  exactKeys,
  parseDatabaseIdentity,
  parseMigrationEvidence,
  parseProductionResourceIdentity,
  record,
  verifyBackupManifest,
  verifyRestoreEvidence,
  verifySmokeEvidence,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite, exists } from "../shared/filesystem.js";
import type {
  DeploymentOracleContext,
  DeploymentOracles,
} from "./controller.js";
import { verifyFreshTargetProof } from "./runtime-evidence.js";

export const ACTIVE_PHASES = [
  "PREFLIGHT",
  "SAFETY_BACKUP",
  "MIGRATE",
  "APP_READY",
  "HTTPS_READY",
  "INITIAL_SMOKE",
  "POST_DEPLOY_BACKUP",
  "RESTORE_ENVIRONMENT",
  "RESTORE",
  "PRODUCTION_UNCHANGED",
  "POST_RESTORE_SMOKE",
] as const;
export type ActivePhase = (typeof ACTIVE_PHASES)[number];

export interface ActiveDeploymentOperations {
  execute(
    phase: ActivePhase,
    attempt: JsonRecord,
    context: DeploymentOracleContext,
  ): Promise<JsonRecord>;
  reconcile(
    phase: ActivePhase,
    attempt: JsonRecord,
    persisted: JsonRecord,
    context: DeploymentOracleContext,
  ): Promise<JsonRecord>;
  rollback(attempt: JsonRecord): Promise<JsonRecord>;
}

const activeOutputPath = (
  root: string,
  attemptId: string,
  phase: ActivePhase,
): string => {
  const resolved = path.resolve(root);
  if (!path.isAbsolute(root) || resolved === "/")
    throw new Error("ACTIVE_EVIDENCE_ROOT_UNSAFE");
  return path.join(resolved, attemptId, `${phase.toLowerCase()}.json`);
};

export const finalizeActivePhaseOutput = (input: {
  phase: ActivePhase;
  attempt: JsonRecord;
  observedAt: string;
  payload: JsonRecord;
}): JsonRecord => {
  const target = record(input.attempt.target, "ACTIVE_OUTPUT_TARGET");
  const candidate = record(input.attempt.candidate, "ACTIVE_OUTPUT_CANDIDATE");
  const output: JsonRecord = {
    schemaVersion: "1.0",
    phase: input.phase,
    attemptId: input.attempt.attemptId,
    envelopeId: input.attempt.envelopeId,
    targetId: target.targetId,
    candidateManifestSha256: candidate.manifestSha256,
    observedAt: input.observedAt,
    payload: input.payload,
    status: "PASS",
    evidenceSha256: "",
  };
  output.evidenceSha256 = canonicalSha256(output, ["evidenceSha256"]);
  return verifyActivePhaseOutput(output, input.phase, input.attempt);
};

export const verifyActivePhaseOutput = (
  value: unknown,
  phase: ActivePhase,
  attempt: JsonRecord,
): JsonRecord => {
  const input = record(value, "ACTIVE_PHASE_OUTPUT");
  exactKeys(
    input,
    [
      "schemaVersion",
      "phase",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "observedAt",
      "payload",
      "status",
      "evidenceSha256",
    ],
    "ACTIVE_PHASE_OUTPUT",
  );
  const target = record(attempt.target, "ACTIVE_OUTPUT_TARGET");
  const candidate = record(attempt.candidate, "ACTIVE_OUTPUT_CANDIDATE");
  if (
    input.schemaVersion !== "1.0" ||
    input.phase !== phase ||
    input.status !== "PASS" ||
    input.attemptId !== attempt.attemptId ||
    input.envelopeId !== attempt.envelopeId ||
    input.targetId !== target.targetId ||
    input.candidateManifestSha256 !== candidate.manifestSha256 ||
    typeof input.observedAt !== "string" ||
    Number.isNaN(Date.parse(input.observedAt)) ||
    typeof input.evidenceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(input.evidenceSha256) ||
    canonicalSha256(input, ["evidenceSha256"]) !== input.evidenceSha256
  )
    throw new Error(`ACTIVE_PHASE_OUTPUT_INVALID:${phase}`);
  record(input.payload, `ACTIVE_PHASE_PAYLOAD:${phase}`);
  return input;
};

const persistOrRecover = async (input: {
  evidenceRoot: string;
  phase: ActivePhase;
  attempt: JsonRecord;
  operations: ActiveDeploymentOperations;
  context: DeploymentOracleContext;
}): Promise<JsonRecord> => {
  const destination = activeOutputPath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
    input.phase,
  );
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  let output: JsonRecord;
  if (await exists(destination)) {
    const persisted = verifyActivePhaseOutput(
      JSON.parse(await readFile(destination, "utf8")),
      input.phase,
      input.attempt,
    );
    output = verifyActivePhaseOutput(
      await input.operations.reconcile(
        input.phase,
        input.attempt,
        persisted,
        input.context,
      ),
      input.phase,
      input.attempt,
    );
    if (canonicalJson(output) !== canonicalJson(persisted))
      throw new Error(`ACTIVE_PHASE_RECONCILE_MISMATCH:${input.phase}`);
  } else {
    output = verifyActivePhaseOutput(
      await input.operations.execute(input.phase, input.attempt, input.context),
      input.phase,
      input.attempt,
    );
    await atomicWrite(destination, canonicalJson(output), 0o600);
  }
  return verifyActivePhaseOutput(
    JSON.parse(await readFile(destination, "utf8")),
    input.phase,
    input.attempt,
  );
};

const payload = (output: JsonRecord, phase: ActivePhase): JsonRecord =>
  record(output.payload, `ACTIVE_PHASE_PAYLOAD:${phase}`);

export const createActiveDeploymentOracles = (input: {
  evidenceRoot: string;
  operations: ActiveDeploymentOperations;
}): DeploymentOracles => {
  const run = (
    phase: ActivePhase,
    attempt: JsonRecord,
    context?: DeploymentOracleContext,
  ): Promise<JsonRecord> =>
    persistOrRecover({
      ...input,
      phase,
      attempt,
      context:
        context ??
        ({
          deadlineAt: Date.now() + 4 * 60 * 60 * 1000,
          signal: new AbortController().signal,
        } satisfies DeploymentOracleContext),
    });
  return {
    preflight: async (attempt, context) => {
      const output = await run("PREFLIGHT", attempt, context);
      return {
        reasonCode: "PREFLIGHT_ACTIVE_INSPECTION_PASS",
        evidenceSha256: String(output.evidenceSha256),
      };
    },
    safetyBackup: async (attempt, context) => {
      const output = await run("SAFETY_BACKUP", attempt, context);
      const value = payload(output, "SAFETY_BACKUP");
      exactKeys(
        value,
        ["sourceDatabase", "safetyBackup"],
        "ACTIVE_SAFETY_PAYLOAD",
      );
      const database = parseDatabaseIdentity(value.sourceDatabase);
      const safety =
        record(value.safetyBackup).kind === "FRESH_TARGET"
          ? verifyFreshTargetProof(value.safetyBackup)
          : verifyBackupManifest(value.safetyBackup);
      return {
        reasonCode:
          safety.kind === "FRESH_TARGET"
            ? "FRESH_TARGET_ACTIVE_INSPECTION_PASS"
            : "PRE_MIGRATION_BACKUP_VERIFIED",
        evidenceSha256:
          safety.kind === "FRESH_TARGET"
            ? canonicalSha256(safety)
            : String(safety.backupManifestSha256),
        projection: {
          sourceDatabase: database,
          safetyBackup:
            safety.kind === "FRESH_TARGET" ? safety : backupReference(safety),
        },
      };
    },
    migrate: async (attempt, context) => {
      const output = await run("MIGRATE", attempt, context);
      const migration = parseMigrationEvidence(
        payload(output, "MIGRATE").migration,
      );
      return {
        reasonCode: "MIGRATION_LIVE_LEDGER_VERIFIED",
        evidenceSha256: canonicalSha256(migration),
        projection: { migration },
      };
    },
    appReady: async (attempt, context) => {
      const output = await run("APP_READY", attempt, context);
      return {
        reasonCode: "APP_READINESS_ACTIVELY_OBSERVED",
        evidenceSha256: String(output.evidenceSha256),
      };
    },
    httpsReady: async (attempt, context) => {
      const output = await run("HTTPS_READY", attempt, context);
      return {
        reasonCode: "HTTPS_READINESS_ACTIVELY_OBSERVED",
        evidenceSha256: String(output.evidenceSha256),
      };
    },
    initialSmoke: async (attempt, context) => {
      const output = await run("INITIAL_SMOKE", attempt, context);
      const evidence = verifySmokeEvidence(
        payload(output, "INITIAL_SMOKE").smoke,
      );
      const reference = smokeReference(evidence);
      return {
        reasonCode: "EXTERNAL_INITIAL_SMOKE_ACTIVELY_OBSERVED",
        evidenceSha256: String(reference.smokeSha256),
        projection: { initialSmoke: reference },
      };
    },
    postDeployBackup: async (attempt, context) => {
      const output = await run("POST_DEPLOY_BACKUP", attempt, context);
      const evidence = verifyBackupManifest(
        payload(output, "POST_DEPLOY_BACKUP").backup,
      );
      const reference = backupReference(evidence);
      return {
        reasonCode: "POST_DEPLOY_BACKUP_ACTIVELY_VERIFIED",
        evidenceSha256: String(reference.backupManifestSha256),
        projection: { postDeployBackup: reference },
      };
    },
    restoreEnvironment: async (attempt, context) => {
      const output = await run("RESTORE_ENVIRONMENT", attempt, context);
      return {
        reasonCode: "ISOLATED_RESTORE_ENVIRONMENT_ACTIVELY_OBSERVED",
        evidenceSha256: String(output.evidenceSha256),
      };
    },
    restore: async (attempt, context) => {
      const output = await run("RESTORE", attempt, context);
      const evidence = verifyRestoreEvidence(
        payload(output, "RESTORE").restore,
      );
      const reference = restoreReference(evidence);
      return {
        reasonCode: "ISOLATED_RESTORE_ACTIVELY_VERIFIED",
        evidenceSha256: String(reference.restoreEvidenceSha256),
        projection: { restoreEvidence: reference },
      };
    },
    productionUnchanged: async (attempt, context) => {
      const output = await run("PRODUCTION_UNCHANGED", attempt, context);
      const value = payload(output, "PRODUCTION_UNCHANGED");
      const before = parseProductionResourceIdentity(value.productionBefore);
      const after = parseProductionResourceIdentity(value.productionAfter);
      const digest = verifyProductionUnchanged(before, after);
      return {
        reasonCode: "PRODUCTION_RESOURCES_ACTIVELY_REINSPECTED",
        evidenceSha256: digest,
        projection: { productionUnchangedSha256: digest },
      };
    },
    postRestoreSmoke: async (attempt, context) => {
      const output = await run("POST_RESTORE_SMOKE", attempt, context);
      const evidence = verifySmokeEvidence(
        payload(output, "POST_RESTORE_SMOKE").smoke,
      );
      const reference = smokeReference(evidence);
      return {
        reasonCode: "EXTERNAL_POST_RESTORE_SMOKE_ACTIVELY_OBSERVED",
        evidenceSha256: String(reference.smokeSha256),
        projection: { postRestoreSmoke: reference },
      };
    },
    rollback: async (attempt) => {
      const evidence = await input.operations.rollback(attempt);
      return {
        reasonCode: String(evidence.reasonCode),
        evidenceSha256: canonicalSha256(evidence),
        projection: { rollback: evidence },
      };
    },
  };
};
