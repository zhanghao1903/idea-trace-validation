import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";

import { DemoScenarioRunner } from "../../lp04/scenario.js";
import { createEncryptedBackup } from "../database/backup.js";
import {
  finalizeRestoreEvidence,
  assertIsolatedTarget,
} from "../database/restore-evidence.js";
import {
  inspectLiveProductionDatabaseIdentity,
  inspectLiveProductionIdentity,
} from "../database/production-runtime.js";
import {
  discoverLiveIsolatedTarget,
  inspectLiveIsolatedTarget,
} from "../database/restore-runtime.js";
import { restoreEncryptedBackup } from "../database/restore.js";
import { preflight } from "./preflight.js";
import { loadDeploymentConfig } from "./config.js";
import { runExternalSmoke } from "../smoke/external.js";
import {
  syntheticResourceIdsSha256,
  syntheticStorySha256,
} from "../smoke/story.js";
import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  exactKeys,
  parseCandidateIdentity,
  parseDatabaseIdentity,
  parseIsolatedRestoreTarget,
  parseMigrationEvidence,
  parseProductionResourceIdentity,
  record,
  verifyBackupManifest,
  verifyReleaseCandidateManifest,
  verifyRestoreEvidence,
  verifySmokeEvidence,
  type JsonRecord,
} from "../shared/contracts.js";
import {
  type ActiveDeploymentOperations,
  type ActivePhase,
  finalizeActivePhaseOutput,
  verifyActivePhaseOutput,
} from "./active-oracles.js";
import type { DeploymentOracleContext } from "./controller.js";
import { atomicWrite, exists } from "../shared/filesystem.js";

const executeFile = promisify(execFile);

interface SmokeRuntime {
  smokeId: string;
  proofRoot: string;
  runId: string;
}

export interface HostActiveRuntime {
  schemaVersion: "1.0";
  evidenceRoot: string;
  candidateManifestPath: string;
  preMigrationBackupId: string;
  postDeployBackupId: string;
  initialSmoke: SmokeRuntime;
  postRestoreSmoke: SmokeRuntime;
  restore: {
    composeProject: string;
    databaseName: string;
    appPort: number;
    restoreId: string;
    proofRoot: string;
    runId: string;
  };
}

const absolutePath = (value: unknown, code: string): string => {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    path.resolve(value) === "/"
  )
    throw new Error(code);
  return path.resolve(value);
};

const smokeRuntime = (value: unknown, code: string): SmokeRuntime => {
  const input = record(value, code);
  exactKeys(input, ["smokeId", "proofRoot", "runId"], code);
  if (typeof input.smokeId !== "string" || typeof input.runId !== "string")
    throw new Error(`${code}_VALUE`);
  return {
    smokeId: input.smokeId,
    proofRoot: absolutePath(input.proofRoot, `${code}_PROOF_ROOT`),
    runId: input.runId,
  };
};

export const parseHostActiveRuntime = (value: unknown): HostActiveRuntime => {
  const input = record(value, "ACTIVE_RUNTIME");
  exactKeys(
    input,
    [
      "schemaVersion",
      "evidenceRoot",
      "candidateManifestPath",
      "preMigrationBackupId",
      "postDeployBackupId",
      "initialSmoke",
      "postRestoreSmoke",
      "restore",
    ],
    "ACTIVE_RUNTIME",
  );
  const restore = record(input.restore, "ACTIVE_RUNTIME_RESTORE");
  exactKeys(
    restore,
    [
      "composeProject",
      "databaseName",
      "appPort",
      "restoreId",
      "proofRoot",
      "runId",
    ],
    "ACTIVE_RUNTIME_RESTORE",
  );
  if (
    input.schemaVersion !== "1.0" ||
    typeof input.preMigrationBackupId !== "string" ||
    typeof input.postDeployBackupId !== "string" ||
    typeof restore.composeProject !== "string" ||
    !restore.composeProject.startsWith("lp05-restore-") ||
    typeof restore.databaseName !== "string" ||
    !restore.databaseName.endsWith("_restore") ||
    !Number.isInteger(restore.appPort) ||
    Number(restore.appPort) < 1 ||
    Number(restore.appPort) > 65_535 ||
    typeof restore.restoreId !== "string" ||
    typeof restore.runId !== "string"
  )
    throw new Error("ACTIVE_RUNTIME_VALUE");
  for (const id of [input.preMigrationBackupId, input.postDeployBackupId])
    if (!/^backup_[A-Za-z0-9_-]{6,64}$/u.test(id))
      throw new Error("ACTIVE_RUNTIME_BACKUP_ID");
  if (!/^restore_[A-Za-z0-9_-]{6,64}$/u.test(restore.restoreId))
    throw new Error("ACTIVE_RUNTIME_RESTORE_ID");
  return {
    schemaVersion: "1.0",
    evidenceRoot: absolutePath(input.evidenceRoot, "ACTIVE_EVIDENCE_ROOT"),
    candidateManifestPath: absolutePath(
      input.candidateManifestPath,
      "ACTIVE_CANDIDATE_PATH",
    ),
    preMigrationBackupId: input.preMigrationBackupId,
    postDeployBackupId: input.postDeployBackupId,
    initialSmoke: smokeRuntime(input.initialSmoke, "ACTIVE_INITIAL_SMOKE"),
    postRestoreSmoke: smokeRuntime(
      input.postRestoreSmoke,
      "ACTIVE_POST_RESTORE_SMOKE",
    ),
    restore: {
      composeProject: restore.composeProject,
      databaseName: restore.databaseName,
      appPort: Number(restore.appPort),
      restoreId: restore.restoreId,
      proofRoot: absolutePath(restore.proofRoot, "ACTIVE_RESTORE_PROOF_ROOT"),
      runId: restore.runId,
    },
  };
};

type RunDocker = (
  args: readonly string[],
  environment?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) => Promise<string>;

const defaultDocker: RunDocker = async (
  args,
  environment = process.env,
  signal,
) =>
  (
    await executeFile("docker", [...args], {
      cwd: process.cwd(),
      env: environment,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      signal,
    })
  ).stdout.trim();

const requiredEnvironment = (
  environment: NodeJS.ProcessEnv,
  key: string,
): string => {
  const value = environment[key];
  if (value === undefined || value.trim() === "")
    throw new Error(`ACTIVE_ENV_REQUIRED:${key}`);
  return value;
};

const composeArgs = (project?: string, restore = false): string[] => [
  "compose",
  "-p",
  project ?? requiredEnvironment(process.env, "COMPOSE_PROJECT_NAME"),
  "-f",
  "deploy/compose.production.yaml",
  ...(restore ? ["-f", "deploy/compose.restore.yaml"] : []),
];

const activeOutput = (input: {
  phase: ActivePhase;
  attempt: JsonRecord;
  payload: JsonRecord;
  now: () => Date;
}): JsonRecord =>
  finalizeActivePhaseOutput({
    phase: input.phase,
    attempt: input.attempt,
    observedAt: input.now().toISOString(),
    payload: input.payload,
  });

const readManifest = async (
  runtime: HostActiveRuntime,
  attempt: JsonRecord,
): Promise<JsonRecord> => {
  const manifest = verifyReleaseCandidateManifest(
    JSON.parse(await readFile(runtime.candidateManifestPath, "utf8")),
  );
  const candidate = parseCandidateIdentity(attempt.candidate);
  const manifestIdentity = parseCandidateIdentity({
    manifestSha256: manifest.manifestSha256,
    releaseId: manifest.releaseId,
    sourceCommit: manifest.sourceCommit,
    sourceTree: manifest.sourceTree,
    imageId: manifest.imageId,
    archiveSha256: record(manifest.ociArchive).sha256,
    platform: manifest.platform,
  });
  if (canonicalJson(candidate) !== canonicalJson(manifestIdentity))
    throw new Error("ACTIVE_CANDIDATE_MISMATCH");
  return manifest;
};

const serviceContainer = async (
  runDocker: RunDocker,
  project: string,
  service: string,
  environment: NodeJS.ProcessEnv,
): Promise<JsonRecord> => {
  const id = await runDocker(
    [
      "ps",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
      "--format",
      "{{.ID}}",
    ],
    environment,
  );
  if (id === "" || id.includes("\n"))
    throw new Error(`ACTIVE_CONTAINER_COUNT:${service}`);
  const inspected = JSON.parse(
    await runDocker(["inspect", id], environment),
  ) as unknown[];
  return record(inspected[0], `ACTIVE_CONTAINER:${service}`);
};

const assertHealthyImage = async (
  runDocker: RunDocker,
  attempt: JsonRecord,
  service: "app" | "caddy",
  environment: NodeJS.ProcessEnv,
): Promise<JsonRecord> => {
  const target = record(attempt.target, "ACTIVE_TARGET");
  const container = await serviceContainer(
    runDocker,
    String(target.composeProject),
    service,
    environment,
  );
  const state = record(container.State, `ACTIVE_STATE:${service}`);
  const health = record(state.Health, `ACTIVE_HEALTH:${service}`);
  if (state.Running !== true || health.Status !== "healthy")
    throw new Error(`ACTIVE_SERVICE_UNHEALTHY:${service}`);
  if (
    service === "app" &&
    container.Image !== record(attempt.candidate).imageId
  )
    throw new Error("ACTIVE_APP_IMAGE_MISMATCH");
  return {
    containerId: container.Id,
    imageId: container.Image,
    health: health.Status,
  };
};

const inspectMigration = async (input: {
  runDocker: RunDocker;
  containerId: string;
  databaseName: string;
  user: string;
  manifest: JsonRecord;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> => {
  const output = await input.runDocker(
    [
      "exec",
      "--user",
      "postgres",
      input.containerId,
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--field-separator",
      "|",
      "--username",
      input.user,
      "--dbname",
      input.databaseName,
      "--command",
      "SELECT id,checksum,'legacy' FROM schema_migrations UNION ALL SELECT id,checksum,'feature' FROM schema_feature_migrations ORDER BY 1",
    ],
    input.environment,
  );
  const observed = output
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => {
      const [id, checksum, ledger, ...extra] = line.split("|");
      if (
        id === undefined ||
        checksum === undefined ||
        (ledger !== "legacy" && ledger !== "feature") ||
        extra.length !== 0
      )
        throw new Error("ACTIVE_MIGRATION_ROW");
      return { id, sha256: checksum, ledger };
    });
  const expected = record(input.manifest).migrationCatalog;
  if (
    !Array.isArray(expected) ||
    canonicalJson(observed) !== canonicalJson(expected)
  )
    throw new Error("ACTIVE_MIGRATION_CATALOG_MISMATCH");
  return parseMigrationEvidence({
    catalogSha256: sha256(canonicalJson(expected)),
    appliedLedgerSha256: sha256(canonicalJson(observed)),
    entries: observed,
    status: "PASS",
    verifiedAt: input.now().toISOString(),
  });
};

const backupToolVersions = async (
  runDocker: RunDocker,
  containerId: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ pgDumpVersion: string; ageVersion: string }> => {
  const [pgOutput, ageOutput] = await Promise.all([
    runDocker(
      ["exec", containerId, "pg_dump", "--version"],
      environment,
      signal,
    ),
    executeFile("age", ["--version"], {
      env: { PATH: environment.PATH },
      timeout: 10_000,
      signal,
    }).then(({ stdout, stderr }) => `${stdout}${stderr}`.trim()),
  ]);
  const pg = /(\d+\.\d+(?:\.\d+)?)/u.exec(pgOutput)?.[1];
  const age = /v?(\d+\.\d+(?:\.\d+)?)/u.exec(ageOutput)?.[1];
  if (pg === undefined || age === undefined)
    throw new Error("ACTIVE_BACKUP_TOOL_VERSION");
  return { pgDumpVersion: pg, ageVersion: age };
};

const releaseIdentity = (
  attempt: JsonRecord,
  environment: NodeJS.ProcessEnv,
): JsonRecord => {
  const candidate = record(attempt.candidate, "ACTIVE_CANDIDATE");
  const config = loadDeploymentConfig(environment);
  return {
    releaseId: candidate.releaseId,
    sourceCommit: candidate.sourceCommit,
    imageId: candidate.imageId,
    configSha256: canonicalSha256({
      domain: config.domain,
      releaseId: config.releaseId,
      sourceCommit: config.sourceCommit,
      sourceTree: config.sourceTree,
      appImageId: config.appImageId,
      platform: config.platform,
      composeProject: config.composeProject,
      postgresUser: config.postgresUser,
      postgresDb: config.postgresDb,
    }),
  };
};

const createBackup = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  manifest: JsonRecord;
  database: JsonRecord;
  backupId: string;
  purpose: "PRE_MIGRATION_SAFETY" | "POST_DEPLOY_RECOVERABILITY";
  storySha256: string | null;
  environment: NodeJS.ProcessEnv;
  runDocker: RunDocker;
  now: () => Date;
  signal: AbortSignal;
}): Promise<JsonRecord> => {
  const target = record(input.attempt.target, "ACTIVE_TARGET");
  const candidate = record(input.attempt.candidate, "ACTIVE_CANDIDATE");
  return createEncryptedBackup({
    backupRoot: requiredEnvironment(input.environment, "BACKUP_ROOT"),
    backupId: input.backupId,
    recipient: requiredEnvironment(input.environment, "AGE_RECIPIENT"),
    identityPath: requiredEnvironment(input.environment, "AGE_IDENTITY_FILE"),
    databaseContainerId: String(input.database.containerId),
    pgEnvironment: {
      PATH: input.environment.PATH,
      PGUSER: requiredEnvironment(input.environment, "POSTGRES_USER"),
      PGDATABASE: requiredEnvironment(input.environment, "POSTGRES_DB"),
    },
    manifestFields: {
      purpose: input.purpose,
      envelopeId: input.attempt.envelopeId,
      attemptId: input.attempt.attemptId,
      targetId: target.targetId,
      sourceDatabase: input.database,
      sourceRelease:
        input.purpose === "PRE_MIGRATION_SAFETY"
          ? input.attempt.previousRelease
          : releaseIdentity(input.attempt, input.environment),
      candidateManifestSha256: candidate.manifestSha256,
      migrationCatalogSha256: sha256(
        canonicalJson(input.manifest.migrationCatalog),
      ),
      syntheticStorySha256: input.storySha256,
    },
    toolVersions: await backupToolVersions(
      input.runDocker,
      String(input.database.containerId),
      input.environment,
      input.signal,
    ),
    now: input.now(),
    signal: input.signal,
  });
};

const restoreEnvironment = (
  runtime: HostActiveRuntime,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => ({
  ...environment,
  COMPOSE_PROJECT_NAME: runtime.restore.composeProject,
  POSTGRES_DB: runtime.restore.databaseName,
  RESTORE_APP_PORT: String(runtime.restore.appPort),
});

const verifyBackupFile = async (
  manifestValue: unknown,
  environment: NodeJS.ProcessEnv,
): Promise<void> => {
  const manifest = verifyBackupManifest(manifestValue);
  const ciphertext = record(manifest.ciphertext, "ACTIVE_BACKUP_CIPHERTEXT");
  const file = path.join(
    requiredEnvironment(environment, "BACKUP_ROOT"),
    String(ciphertext.basename),
  );
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size !== ciphertext.sizeBytes)
    throw new Error("ACTIVE_BACKUP_FILE_CHANGED");
  const digest = await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolve(hash.digest("hex")));
  });
  if (digest !== ciphertext.sha256)
    throw new Error("ACTIVE_BACKUP_FILE_CHANGED");
};

const phasePayload = async (
  runtime: HostActiveRuntime,
  phase: ActivePhase,
  attempt: JsonRecord,
): Promise<JsonRecord> => {
  const file = path.join(
    runtime.evidenceRoot,
    String(attempt.attemptId),
    `${phase.toLowerCase()}.json`,
  );

  return record(
    verifyActivePhaseOutput(
      JSON.parse(await readFile(file, "utf8")),
      phase,
      attempt,
    ).payload,
    `ACTIVE_PHASE_PAYLOAD:${phase}`,
  );
};

type RestoreLifecycleState =
  "CREATING" | "READY" | "QUIESCING" | "CLEANED" | "CLEANUP_FAILED";

const restoreLifecyclePath = (
  runtime: HostActiveRuntime,
  attempt: JsonRecord,
): string =>
  path.join(
    runtime.evidenceRoot,
    String(attempt.attemptId),
    "restore-lifecycle.json",
  );

const finalizeRestoreLifecycle = (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  state: RestoreLifecycleState;
  isolatedTarget: JsonRecord | null;
  cleanup: JsonRecord | null;
  updatedAt: string;
}): JsonRecord => {
  const target = record(input.attempt.target, "RESTORE_LIFECYCLE_TARGET");
  const candidate = record(
    input.attempt.candidate,
    "RESTORE_LIFECYCLE_CANDIDATE",
  );
  const lifecycle: JsonRecord = {
    schemaVersion: "1.0",
    attemptId: input.attempt.attemptId,
    envelopeId: input.attempt.envelopeId,
    targetId: target.targetId,
    candidateManifestSha256: candidate.manifestSha256,
    composeProject: input.runtime.restore.composeProject,
    databaseName: input.runtime.restore.databaseName,
    state: input.state,
    isolatedTarget: input.isolatedTarget,
    cleanup: input.cleanup,
    updatedAt: input.updatedAt,
    lifecycleSha256: "",
  };
  lifecycle.lifecycleSha256 = canonicalSha256(lifecycle, ["lifecycleSha256"]);
  return verifyRestoreLifecycle(lifecycle, input.runtime, input.attempt);
};

const verifyRestoreLifecycle = (
  value: unknown,
  runtime: HostActiveRuntime,
  attempt: JsonRecord,
): JsonRecord => {
  const input = record(value, "RESTORE_LIFECYCLE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "composeProject",
      "databaseName",
      "state",
      "isolatedTarget",
      "cleanup",
      "updatedAt",
      "lifecycleSha256",
    ],
    "RESTORE_LIFECYCLE",
  );
  const target = record(attempt.target, "RESTORE_LIFECYCLE_TARGET");
  const candidate = record(attempt.candidate, "RESTORE_LIFECYCLE_CANDIDATE");
  if (
    input.schemaVersion !== "1.0" ||
    input.attemptId !== attempt.attemptId ||
    input.envelopeId !== attempt.envelopeId ||
    input.targetId !== target.targetId ||
    input.candidateManifestSha256 !== candidate.manifestSha256 ||
    input.composeProject !== runtime.restore.composeProject ||
    input.databaseName !== runtime.restore.databaseName ||
    !["CREATING", "READY", "QUIESCING", "CLEANED", "CLEANUP_FAILED"].includes(
      String(input.state),
    ) ||
    typeof input.updatedAt !== "string" ||
    Number.isNaN(Date.parse(input.updatedAt)) ||
    typeof input.lifecycleSha256 !== "string" ||
    canonicalSha256(input, ["lifecycleSha256"]) !== input.lifecycleSha256
  )
    throw new Error("RESTORE_LIFECYCLE_INVALID");
  if (input.state === "CREATING" && input.isolatedTarget !== null)
    throw new Error("RESTORE_LIFECYCLE_CREATING_TARGET");
  if (input.state === "READY") parseIsolatedRestoreTarget(input.isolatedTarget);
  if (input.state === "QUIESCING" && input.isolatedTarget !== null)
    parseIsolatedRestoreTarget(input.isolatedTarget);
  if (input.state === "CLEANED" && record(input.cleanup).status !== "PASS")
    throw new Error("RESTORE_LIFECYCLE_CLEANUP_STATUS");
  return input;
};

const persistRestoreLifecycle = async (
  runtime: HostActiveRuntime,
  attempt: JsonRecord,
  lifecycle: JsonRecord,
): Promise<void> =>
  atomicWrite(
    restoreLifecyclePath(runtime, attempt),
    canonicalJson(verifyRestoreLifecycle(lifecycle, runtime, attempt)),
    0o600,
  );

export const beginRestoreLifecycle = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  now: () => Date;
}): Promise<JsonRecord> => {
  const lifecycle = finalizeRestoreLifecycle({
    ...input,
    state: "CREATING",
    isolatedTarget: null,
    cleanup: null,
    updatedAt: input.now().toISOString(),
  });
  await persistRestoreLifecycle(input.runtime, input.attempt, lifecycle);
  return lifecycle;
};

export const markRestoreLifecycleReady = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  isolatedTarget: JsonRecord;
  now: () => Date;
}): Promise<JsonRecord> => {
  const lifecycle = finalizeRestoreLifecycle({
    ...input,
    state: "READY",
    isolatedTarget: parseIsolatedRestoreTarget(input.isolatedTarget),
    cleanup: null,
    updatedAt: input.now().toISOString(),
  });
  await persistRestoreLifecycle(input.runtime, input.attempt, lifecycle);
  return lifecycle;
};

const lines = (value: string): string[] =>
  value.split(/\r?\n/u).filter((entry) => entry !== "");

const assertRestoreProjectResources = async (input: {
  composeProject: string;
  containerIds: string[];
  volumeNames: string[];
  runDocker: RunDocker;
  environment: NodeJS.ProcessEnv;
}): Promise<void> => {
  for (const id of input.containerIds) {
    const inspected = JSON.parse(
      await input.runDocker(["inspect", id], input.environment),
    ) as unknown[];
    const container = record(inspected[0], "RESTORE_CLEANUP_CONTAINER");
    const labels = record(
      record(container.Config, "RESTORE_CLEANUP_CONFIG").Labels,
      "RESTORE_CLEANUP_CONTAINER_LABELS",
    );
    if (labels["com.docker.compose.project"] !== input.composeProject)
      throw new Error("RESTORE_CLEANUP_CONTAINER_AUTHORITY");
  }
  for (const name of input.volumeNames) {
    const inspected = JSON.parse(
      await input.runDocker(["volume", "inspect", name], input.environment),
    ) as unknown[];
    const volume = record(inspected[0], "RESTORE_CLEANUP_VOLUME");
    const labels = record(volume.Labels, "RESTORE_CLEANUP_VOLUME_LABELS");
    if (labels["com.docker.compose.project"] !== input.composeProject)
      throw new Error("RESTORE_CLEANUP_VOLUME_AUTHORITY");
  }
};

export const cleanupIsolatedRestoreEnvironment = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  runDocker: RunDocker;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  settleDelayMs?: number;
  requiredEmptySamples?: number;
}): Promise<JsonRecord> => {
  const lifecycleFile = restoreLifecyclePath(input.runtime, input.attempt);
  let lifecycle = (await exists(lifecycleFile))
    ? verifyRestoreLifecycle(
        JSON.parse(await readFile(lifecycleFile, "utf8")),
        input.runtime,
        input.attempt,
      )
    : null;
  const restoreEnv = restoreEnvironment(input.runtime, input.environment);
  const observe = async (): Promise<{
    containerIds: string[];
    volumeNames: string[];
  }> => ({
    containerIds: lines(
      await input.runDocker(
        [
          "ps",
          "--all",
          "--filter",
          `label=com.docker.compose.project=${input.runtime.restore.composeProject}`,
          "--format",
          "{{.ID}}",
        ],
        restoreEnv,
      ),
    ),
    volumeNames: lines(
      await input.runDocker(
        [
          "volume",
          "ls",
          "--filter",
          `label=com.docker.compose.project=${input.runtime.restore.composeProject}`,
          "--format",
          "{{.Name}}",
        ],
        restoreEnv,
      ),
    ),
  });
  let observed = await observe();
  if (
    lifecycle === null &&
    (observed.containerIds.length > 0 || observed.volumeNames.length > 0)
  )
    throw new Error("RESTORE_CLEANUP_LIFECYCLE_REQUIRED");
  if (lifecycle !== null && lifecycle.state === "CLEANED") {
    if (observed.containerIds.length === 0 && observed.volumeNames.length === 0)
      return record(lifecycle.cleanup, "RESTORE_CLEANUP_EVIDENCE");
  }
  if (lifecycle === null) {
    return {
      status: "PASS",
      reasonCode: "RESTORE_ENVIRONMENT_NOT_CREATED",
      composeProject: input.runtime.restore.composeProject,
      isolatedTargetSha256: null,
      removedResourceSetSha256: canonicalSha256(observed),
      quiescenceSamples: 1,
      settleDelayMs: 0,
      completedAt: input.now().toISOString(),
    };
  }
  lifecycle = finalizeRestoreLifecycle({
    runtime: input.runtime,
    attempt: input.attempt,
    state: "QUIESCING",
    isolatedTarget:
      lifecycle.isolatedTarget === null
        ? null
        : record(lifecycle.isolatedTarget),
    cleanup: null,
    updatedAt: input.now().toISOString(),
  });
  await persistRestoreLifecycle(input.runtime, input.attempt, lifecycle);
  const settleDelayMs = input.settleDelayMs ?? 1_000;
  const requiredEmptySamples = input.requiredEmptySamples ?? 3;
  if (
    !Number.isSafeInteger(settleDelayMs) ||
    settleDelayMs < 0 ||
    !Number.isSafeInteger(requiredEmptySamples) ||
    requiredEmptySamples < 2 ||
    requiredEmptySamples > 10
  )
    throw new Error("RESTORE_CLEANUP_QUIESCENCE_POLICY");
  const seenContainerIds = new Set<string>();
  const seenVolumeNames = new Set<string>();
  let emptySamples = 0;
  const maximumSamples = requiredEmptySamples + 12;
  for (let sample = 0; sample < maximumSamples; sample += 1) {
    observed.containerIds.forEach((value) => seenContainerIds.add(value));
    observed.volumeNames.forEach((value) => seenVolumeNames.add(value));
    await assertRestoreProjectResources({
      composeProject: input.runtime.restore.composeProject,
      ...observed,
      runDocker: input.runDocker,
      environment: restoreEnv,
    });
    if (observed.containerIds.length > 0 || observed.volumeNames.length > 0) {
      emptySamples = 0;
      await input.runDocker(
        [
          ...composeArgs(input.runtime.restore.composeProject, true),
          "down",
          "--volumes",
          "--remove-orphans",
          "--timeout",
          "30",
        ],
        restoreEnv,
      );
    } else {
      emptySamples += 1;
      if (emptySamples >= requiredEmptySamples) break;
    }
    if (settleDelayMs > 0) await delay(settleDelayMs);
    observed = await observe();
  }
  if (emptySamples < requiredEmptySamples)
    throw new Error("ACTIVE_RESTORE_CLEANUP_NOT_QUIESCENT");
  const removedResources = {
    containerIds: [...seenContainerIds].sort(),
    volumeNames: [...seenVolumeNames].sort(),
  };
  const cleanup: JsonRecord = {
    status: "PASS",
    reasonCode: "RESTORE_ENVIRONMENT_EXACT_RESOURCES_REMOVED",
    composeProject: input.runtime.restore.composeProject,
    isolatedTargetSha256:
      lifecycle.isolatedTarget === null
        ? null
        : canonicalSha256(record(lifecycle.isolatedTarget)),
    removedResourceSetSha256: canonicalSha256(removedResources),
    quiescenceSamples: requiredEmptySamples,
    settleDelayMs,
    completedAt: input.now().toISOString(),
  };
  await persistRestoreLifecycle(
    input.runtime,
    input.attempt,
    finalizeRestoreLifecycle({
      runtime: input.runtime,
      attempt: input.attempt,
      state: "CLEANED",
      isolatedTarget:
        lifecycle.isolatedTarget === null
          ? null
          : record(lifecycle.isolatedTarget),
      cleanup,
      updatedAt: input.now().toISOString(),
    }),
  );
  return cleanup;
};

const recordRestoreCleanupFailure = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  now: () => Date;
  error: unknown;
}): Promise<void> => {
  const lifecycleFile = restoreLifecyclePath(input.runtime, input.attempt);
  if (!(await exists(lifecycleFile))) return;
  const lifecycle = verifyRestoreLifecycle(
    JSON.parse(await readFile(lifecycleFile, "utf8")),
    input.runtime,
    input.attempt,
  );
  await persistRestoreLifecycle(
    input.runtime,
    input.attempt,
    finalizeRestoreLifecycle({
      runtime: input.runtime,
      attempt: input.attempt,
      state: "CLEANUP_FAILED",
      isolatedTarget:
        lifecycle.isolatedTarget === null
          ? null
          : record(lifecycle.isolatedTarget),
      cleanup: {
        status: "FAIL",
        reasonCode: "RESTORE_ENVIRONMENT_CLEANUP_FAILED",
        errorSha256: sha256(
          input.error instanceof Error
            ? input.error.message
            : "UNKNOWN_RESTORE_CLEANUP_FAILURE",
        ),
        completedAt: input.now().toISOString(),
      },
      updatedAt: input.now().toISOString(),
    }),
  );
};

export const createHostActiveDeploymentOperations = (options: {
  runtime: HostActiveRuntime;
  envelope: unknown;
  rollback: (attempt: JsonRecord) => Promise<JsonRecord>;
  environment?: NodeJS.ProcessEnv;
  runDocker?: RunDocker;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): ActiveDeploymentOperations => {
  const runtime = parseHostActiveRuntime(options.runtime);
  const environment = options.environment ?? process.env;
  const dockerActorSignal = new AsyncLocalStorage<AbortSignal>();
  const baseDocker = options.runDocker ?? defaultDocker;
  const runDocker: RunDocker = (args, commandEnvironment, signal) =>
    baseDocker(
      args,
      commandEnvironment,
      signal ?? dockerActorSignal.getStore(),
    );
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const config = (): ReturnType<typeof loadDeploymentConfig> =>
    loadDeploymentConfig(environment);
  const credentials = () => ({
    user: requiredEnvironment(environment, "POSTGRES_USER"),
    path: environment.PATH,
  });

  const inspectProduction = (attempt: JsonRecord): Promise<JsonRecord> =>
    inspectLiveProductionIdentity({
      target: attempt.target,
      candidate: attempt.candidate,
      databaseName: requiredEnvironment(environment, "POSTGRES_DB"),
      runDocker: (args) => runDocker(args, environment),
      fetchImpl,
    });

  const proposal = record(record(options.envelope, "ACTIVE_ENVELOPE").proposal);
  const authorizedToolchain = record(
    proposal.toolchain,
    "ACTIVE_AUTHORIZED_TOOLCHAIN",
  );
  const stableToolchain = (value: unknown): JsonRecord => {
    const toolchain = record(value, "ACTIVE_TOOLCHAIN");
    return {
      dockerEngineVersion: toolchain.dockerEngineVersion,
      composeVersion: toolchain.composeVersion,
      ageVersion: toolchain.ageVersion,
      dockerInstallationSource: toolchain.dockerInstallationSource,
      ageInstallationSource: toolchain.ageInstallationSource,
    };
  };
  const activePreflight = async (attempt: JsonRecord): Promise<JsonRecord> => {
    const result = record(
      await preflight(environment, {
        dockerInstallationSource: String(
          authorizedToolchain.dockerInstallationSource,
        ) as "OFFICIAL_DOCKER_PACKAGE",
        ageInstallationSource: String(
          authorizedToolchain.ageInstallationSource,
        ) as "OS_VENDOR_PACKAGE" | "OFFICIAL_RELEASE_CHECKSUM_VERIFIED",
        now: now(),
      }),
      "ACTIVE_PREFLIGHT",
    );
    if (
      canonicalJson(stableToolchain(result.toolchain)) !==
      canonicalJson(stableToolchain(authorizedToolchain))
    )
      throw new Error("ACTIVE_TOOLCHAIN_AUTHORITY_MISMATCH");
    const liveConfig = config();
    const target = record(attempt.target, "ACTIVE_PREFLIGHT_TARGET");
    const candidate = record(attempt.candidate, "ACTIVE_PREFLIGHT_CANDIDATE");
    const backupPolicy = record(
      proposal.backupPolicy,
      "ACTIVE_PREFLIGHT_BACKUP_POLICY",
    );
    if (
      liveConfig.releaseId !== candidate.releaseId ||
      liveConfig.sourceCommit !== candidate.sourceCommit ||
      liveConfig.sourceTree !== candidate.sourceTree ||
      liveConfig.appImageId !== candidate.imageId ||
      liveConfig.platform !== candidate.platform ||
      liveConfig.domain !== target.domain ||
      liveConfig.composeProject !== target.composeProject ||
      liveConfig.deployRoot !== target.deployRoot ||
      liveConfig.backupRoot !== backupPolicy.backupRoot
    )
      throw new Error("ACTIVE_PREFLIGHT_AUTHORITY_MISMATCH");
    return result;
  };

  const inspectHttpsReady = async (
    attempt: JsonRecord,
  ): Promise<JsonRecord> => {
    const target = record(attempt.target, "ACTIVE_HTTPS_TARGET");
    const response = await fetchImpl(
      `https://${String(target.domain)}/health/ready`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status !== 200) throw new Error("ACTIVE_HTTPS_NOT_READY");
    return {
      caddy: await assertHealthyImage(runDocker, attempt, "caddy", environment),
      readinessSha256: sha256(await response.text()),
    };
  };

  const stableMigration = (value: unknown): JsonRecord => {
    const migration = parseMigrationEvidence(value);
    return {
      catalogSha256: migration.catalogSha256,
      appliedLedgerSha256: migration.appliedLedgerSha256,
      entries: migration.entries,
      status: migration.status,
    };
  };

  const stableSmoke = (value: unknown): JsonRecord => {
    const smoke = verifySmokeEvidence(value);
    return {
      smokeId: smoke.smokeId,
      mode: smoke.mode,
      envelopeId: smoke.envelopeId,
      attemptId: smoke.attemptId,
      targetId: smoke.targetId,
      candidateManifestSha256: smoke.candidateManifestSha256,
      origin: smoke.origin,
      certificate: smoke.certificate,
      syntheticStorySha256: smoke.syntheticStorySha256,
      resourceIdsSha256: smoke.resourceIdsSha256,
      assertionSetSha256: smoke.assertionSetSha256,
      status: smoke.status,
    };
  };

  const observeSmoke = (
    phase: "INITIAL_SMOKE" | "POST_RESTORE_SMOKE",
    attempt: JsonRecord,
  ): Promise<JsonRecord> => {
    const smoke =
      phase === "INITIAL_SMOKE"
        ? runtime.initialSmoke
        : runtime.postRestoreSmoke;
    return runExternalSmoke({
      schemaVersion: "1.0",
      mode:
        phase === "INITIAL_SMOKE"
          ? "EXTERNAL_INITIAL"
          : "EXTERNAL_POST_RESTORE",
      smokeId: smoke.smokeId,
      envelope: options.envelope,
      attempt,
      proofRoot: smoke.proofRoot,
      runId: smoke.runId,
    });
  };

  const executePhase = async (
    phase: ActivePhase,
    attempt: JsonRecord,
    context: DeploymentOracleContext,
  ): Promise<JsonRecord> => {
    const manifest = await readManifest(runtime, attempt);
    const target = record(attempt.target, "ACTIVE_TARGET");
    const candidate = record(attempt.candidate, "ACTIVE_CANDIDATE");
    switch (phase) {
      case "PREFLIGHT":
        return activeOutput({
          phase,
          attempt,
          now,
          payload: { preflight: await activePreflight(attempt) },
        });
      case "SAFETY_BACKUP": {
        if (attempt.previousRelease === null) {
          const project = String(target.composeProject);
          const [containers, volumes] = await Promise.all([
            runDocker(
              [
                "ps",
                "--all",
                "--filter",
                `label=com.docker.compose.project=${project}`,
                "--format",
                "{{.ID}}",
              ],
              environment,
            ),
            runDocker(
              [
                "volume",
                "ls",
                "--filter",
                `label=com.docker.compose.project=${project}`,
                "--format",
                "{{.Name}}",
              ],
              environment,
            ),
          ]);
          if (containers !== "" || volumes !== "")
            throw new Error("ACTIVE_FRESH_TARGET_NOT_EMPTY");
          await runDocker(
            [
              ...composeArgs(config().composeProject),
              "up",
              "--detach",
              "--wait",
              "--wait-timeout",
              "120",
              "postgres",
            ],
            environment,
          );
          const database = await inspectLiveProductionDatabaseIdentity({
            target: attempt.target,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, environment),
          });
          return activeOutput({
            phase,
            attempt,
            now,
            payload: {
              sourceDatabase: database,
              safetyBackup: {
                kind: "FRESH_TARGET",
                targetId: target.targetId,
                verifiedAt: now().toISOString(),
                assertions: [
                  { id: "no_application_data", status: "PASS" },
                  { id: "no_prior_release", status: "PASS" },
                  { id: "no_production_volume", status: "PASS" },
                ],
              },
            },
          });
        }
        const database = await inspectLiveProductionDatabaseIdentity({
          target: attempt.target,
          databaseName: config().postgresDb,
          runDocker: (args) => runDocker(args, environment),
        });
        const backup = await createBackup({
          runtime,
          attempt,
          manifest,
          database,
          backupId: runtime.preMigrationBackupId,
          purpose: "PRE_MIGRATION_SAFETY",
          storySha256: null,
          environment,
          runDocker,
          now,
          signal: context.signal,
        });
        return activeOutput({
          phase,
          attempt,
          now,
          payload: { sourceDatabase: database, safetyBackup: backup },
        });
      }
      case "MIGRATE": {
        await runDocker(
          [...composeArgs(config().composeProject), "run", "--rm", "migrate"],
          environment,
        );
        const database = parseDatabaseIdentity(attempt.sourceDatabase);
        const migration = await inspectMigration({
          runDocker,
          containerId: String(database.containerId),
          databaseName: String(database.databaseName),
          user: config().postgresUser,
          manifest,
          environment,
          now,
        });
        return activeOutput({ phase, attempt, now, payload: { migration } });
      }
      case "APP_READY": {
        await runDocker(
          [
            ...composeArgs(config().composeProject),
            "up",
            "--detach",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "120",
            "app",
          ],
          environment,
        );
        return activeOutput({
          phase,
          attempt,
          now,
          payload: {
            app: await assertHealthyImage(
              runDocker,
              attempt,
              "app",
              environment,
            ),
          },
        });
      }
      case "HTTPS_READY": {
        await runDocker(
          [
            ...composeArgs(config().composeProject),
            "up",
            "--detach",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "120",
            "caddy",
          ],
          environment,
        );
        return activeOutput({
          phase,
          attempt,
          now,
          payload: await inspectHttpsReady(attempt),
        });
      }
      case "INITIAL_SMOKE": {
        const smoke = await observeSmoke(phase, attempt);
        return activeOutput({ phase, attempt, now, payload: { smoke } });
      }
      case "POST_DEPLOY_BACKUP": {
        const database = await inspectLiveProductionDatabaseIdentity({
          target: attempt.target,
          databaseName: config().postgresDb,
          runDocker: (args) => runDocker(args, environment),
        });
        const initial = record(
          attempt.initialSmoke,
          "ACTIVE_INITIAL_SMOKE_REF",
        );
        const backup = await createBackup({
          runtime,
          attempt,
          manifest,
          database,
          backupId: runtime.postDeployBackupId,
          purpose: "POST_DEPLOY_RECOVERABILITY",
          storySha256: String(initial.syntheticStorySha256),
          environment,
          runDocker,
          now,
          signal: context.signal,
        });
        return activeOutput({ phase, attempt, now, payload: { backup } });
      }
      case "RESTORE_ENVIRONMENT": {
        const productionBefore = await inspectProduction(attempt);
        const restoreEnv = restoreEnvironment(runtime, environment);
        const [containers, volumes] = await Promise.all([
          runDocker(
            [
              "ps",
              "--all",
              "--filter",
              `label=com.docker.compose.project=${runtime.restore.composeProject}`,
              "--format",
              "{{.ID}}",
            ],
            restoreEnv,
          ),
          runDocker(
            [
              "volume",
              "ls",
              "--filter",
              `label=com.docker.compose.project=${runtime.restore.composeProject}`,
              "--format",
              "{{.Name}}",
            ],
            restoreEnv,
          ),
        ]);
        if (containers !== "" || volumes !== "")
          throw new Error("ACTIVE_RESTORE_TARGET_EXISTS");
        await beginRestoreLifecycle({ runtime, attempt, now });
        await runDocker(
          [
            ...composeArgs(runtime.restore.composeProject, true),
            "up",
            "--detach",
            "--wait",
            "--wait-timeout",
            "120",
            "postgres",
          ],
          restoreEnv,
        );
        const isolatedTarget = await discoverLiveIsolatedTarget({
          composeProject: runtime.restore.composeProject,
          origin: `http://127.0.0.1:${runtime.restore.appPort}/`,
          databaseHost: "127.0.0.1",
          databasePort: 5432,
          databaseName: runtime.restore.databaseName,
          credentials: credentials(),
        });
        assertIsolatedTarget(isolatedTarget, productionBefore);
        await markRestoreLifecycleReady({
          runtime,
          attempt,
          isolatedTarget,
          now,
        });
        return activeOutput({
          phase,
          attempt,
          now,
          payload: { isolatedTarget, productionBefore },
        });
      }
      case "RESTORE": {
        const environmentPayload = await phasePayload(
          runtime,
          "RESTORE_ENVIRONMENT",
          attempt,
        );
        const backupPayload = await phasePayload(
          runtime,
          "POST_DEPLOY_BACKUP",
          attempt,
        );
        const isolatedTarget = parseIsolatedRestoreTarget(
          environmentPayload.isolatedTarget,
        );
        const productionBefore = parseProductionResourceIdentity(
          environmentPayload.productionBefore,
        );
        const backup = verifyBackupManifest(backupPayload.backup);
        const startedAt = now().toISOString();
        await restoreEncryptedBackup({
          manifest: backup,
          expected: {
            envelopeId: String(attempt.envelopeId),
            attemptId: String(attempt.attemptId),
            targetId: String(target.targetId),
            candidateManifestSha256: String(candidate.manifestSha256),
            databaseInstanceSha256: String(
              record(attempt.sourceDatabase).databaseInstanceSha256,
            ),
            syntheticStorySha256: String(
              record(attempt.initialSmoke).syntheticStorySha256,
            ),
          },
          ciphertextPath: path.join(
            requiredEnvironment(environment, "BACKUP_ROOT"),
            String(record(backup.ciphertext).basename),
          ),
          identityPath: requiredEnvironment(environment, "AGE_IDENTITY_FILE"),
          isolatedTarget,
          productionIdentity: productionBefore,
          inspectProduction: async () => inspectProduction(attempt),
          restoreEnvironment: {
            PATH: environment.PATH,
            PGUSER: config().postgresUser,
          },
          signal: context.signal,
        });
        const restoreEnv = restoreEnvironment(runtime, environment);
        await runDocker(
          [
            ...composeArgs(runtime.restore.composeProject, true),
            "run",
            "--rm",
            "migrate",
          ],
          restoreEnv,
        );
        await runDocker(
          [
            ...composeArgs(runtime.restore.composeProject, true),
            "up",
            "--detach",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "120",
            "app",
          ],
          restoreEnv,
        );
        const runner = await DemoScenarioRunner.create({
          repoRoot: process.cwd(),
          proofRoot: runtime.restore.proofRoot,
          baseOrigin: String(isolatedTarget.origin),
          runId: runtime.restore.runId,
          skillCommitSha: String(candidate.sourceCommit),
          aiToken: requiredEnvironment(environment, "AI_API_TOKEN"),
        });
        await runner.run();
        const restoredJourney = runner.record;
        const initial = record(
          attempt.initialSmoke,
          "ACTIVE_INITIAL_SMOKE_REF",
        );
        const restoredStory = {
          syntheticStorySha256: syntheticStorySha256(restoredJourney),
          resourceIdsSha256: syntheticResourceIdsSha256(restoredJourney),
          assertionSetSha256: initial.assertionSetSha256,
          status: "PASS",
        };
        if (
          restoredStory.syntheticStorySha256 !== initial.syntheticStorySha256 ||
          restoredStory.resourceIdsSha256 !== initial.resourceIdsSha256
        )
          throw new Error("ACTIVE_RESTORED_STORY_MISMATCH");
        const liveTarget = await inspectLiveIsolatedTarget(
          isolatedTarget,
          credentials(),
        );
        const migration = await inspectMigration({
          runDocker,
          containerId: String(liveTarget.containerId),
          databaseName: String(liveTarget.databaseName),
          user: config().postgresUser,
          manifest,
          environment: restoreEnv,
          now,
        });
        const resourceLabelSha256 = canonicalSha256({
          composeProject: liveTarget.composeProject,
          containerLabelSha256: liveTarget.containerLabelSha256,
          volumeLabelSha256: liveTarget.volumeLabelSha256,
        });
        await cleanupIsolatedRestoreEnvironment({
          runtime,
          attempt,
          runDocker,
          environment,
          now,
        });
        const productionAfter = await inspectProduction(attempt);
        if (canonicalJson(productionBefore) !== canonicalJson(productionAfter))
          throw new Error("ACTIVE_PRODUCTION_CHANGED");
        const restore = finalizeRestoreEvidence({
          schemaVersion: "1.0",
          restoreId: runtime.restore.restoreId,
          envelopeId: attempt.envelopeId,
          attemptId: attempt.attemptId,
          targetId: target.targetId,
          candidateManifestSha256: candidate.manifestSha256,
          backup: {
            backupId: backup.backupId,
            backupManifestSha256: backup.backupManifestSha256,
            ciphertextSha256: record(backup.ciphertext).sha256,
            purpose: backup.purpose,
          },
          sourceDatabaseInstanceSha256: record(backup.sourceDatabase)
            .databaseInstanceSha256,
          isolatedTarget,
          startedAt,
          finishedAt: now().toISOString(),
          migration,
          restoredStory,
          productionBefore,
          productionAfter,
          cleanup: {
            status: "PASS",
            completedAt: now().toISOString(),
            resourceLabelSha256,
          },
          status: "PASS",
        });
        return activeOutput({ phase, attempt, now, payload: { restore } });
      }
      case "PRODUCTION_UNCHANGED": {
        const restorePayload = await phasePayload(runtime, "RESTORE", attempt);
        const restore = verifyRestoreEvidence(restorePayload.restore);
        const before = parseProductionResourceIdentity(
          restore.productionBefore,
        );
        const after = await inspectProduction(attempt);
        if (canonicalJson(before) !== canonicalJson(after))
          throw new Error("ACTIVE_PRODUCTION_CHANGED_AFTER_RESTORE");
        return activeOutput({
          phase,
          attempt,
          now,
          payload: { productionBefore: before, productionAfter: after },
        });
      }
      case "POST_RESTORE_SMOKE": {
        const smoke = await observeSmoke(phase, attempt);
        return activeOutput({ phase, attempt, now, payload: { smoke } });
      }
    }
  };

  return {
    execute: (phase, attempt, context) =>
      dockerActorSignal.run(context.signal, () =>
        executePhase(phase, attempt, context),
      ),
    reconcile: async (phase, attempt, persisted, _context) => {
      await readManifest(runtime, attempt);
      switch (phase) {
        case "PREFLIGHT":
          {
            const observed = await activePreflight(attempt);
            const expected = record(
              record(record(persisted).payload).preflight,
              "ACTIVE_RECONCILE_PREFLIGHT",
            );
            if (
              canonicalJson(record(observed.config)) !==
                canonicalJson(record(expected.config)) ||
              canonicalJson(stableToolchain(observed.toolchain)) !==
                canonicalJson(stableToolchain(expected.toolchain)) ||
              expected.status !== "PASS"
            )
              throw new Error("ACTIVE_RECONCILE_PREFLIGHT_CHANGED");
          }
          break;
        case "MIGRATE": {
          const database = parseDatabaseIdentity(attempt.sourceDatabase);
          const observed = await inspectMigration({
            runDocker,
            containerId: String(database.containerId),
            databaseName: String(database.databaseName),
            user: config().postgresUser,
            manifest: await readManifest(runtime, attempt),
            environment,
            now,
          });
          const expected = record(record(persisted).payload).migration;
          if (
            canonicalJson(stableMigration(observed)) !==
            canonicalJson(stableMigration(expected))
          )
            throw new Error("ACTIVE_RECONCILE_MIGRATION_CHANGED");
          break;
        }
        case "SAFETY_BACKUP": {
          const value = record(record(persisted).payload);
          const expected = parseDatabaseIdentity(value.sourceDatabase);
          const observed = await inspectLiveProductionDatabaseIdentity({
            target: attempt.target,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, environment),
          });
          if (canonicalJson(expected) !== canonicalJson(observed))
            throw new Error("ACTIVE_RECONCILE_DATABASE_CHANGED");
          if (record(value.safetyBackup).kind !== "FRESH_TARGET")
            await verifyBackupFile(value.safetyBackup, environment);
          break;
        }
        case "APP_READY": {
          const observed = await assertHealthyImage(
            runDocker,
            attempt,
            "app",
            environment,
          );
          if (
            canonicalJson(observed) !==
            canonicalJson(record(record(persisted).payload).app)
          )
            throw new Error("ACTIVE_RECONCILE_APP_CHANGED");
          break;
        }
        case "HTTPS_READY": {
          const observed = await inspectHttpsReady(attempt);
          if (
            canonicalJson(observed) !== canonicalJson(record(persisted.payload))
          )
            throw new Error("ACTIVE_RECONCILE_HTTPS_CHANGED");
          break;
        }
        case "INITIAL_SMOKE":
        case "POST_RESTORE_SMOKE": {
          const observed = await observeSmoke(phase, attempt);
          const expected = record(record(persisted).payload).smoke;
          if (
            canonicalJson(stableSmoke(observed)) !==
            canonicalJson(stableSmoke(expected))
          )
            throw new Error("ACTIVE_RECONCILE_SMOKE_CHANGED");
          break;
        }
        case "POST_DEPLOY_BACKUP": {
          const backup = verifyBackupManifest(
            record(record(persisted).payload).backup,
          );
          await verifyBackupFile(backup, environment);
          const observed = await inspectLiveProductionDatabaseIdentity({
            target: attempt.target,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, environment),
          });
          if (
            canonicalJson(parseDatabaseIdentity(backup.sourceDatabase)) !==
            canonicalJson(observed)
          )
            throw new Error("ACTIVE_RECONCILE_BACKUP_SOURCE_CHANGED");
          break;
        }
        case "RESTORE_ENVIRONMENT":
          await inspectLiveIsolatedTarget(
            record(record(persisted).payload).isolatedTarget as JsonRecord,
            credentials(),
          );
          break;
        case "PRODUCTION_UNCHANGED":
        case "RESTORE": {
          const restore =
            phase === "RESTORE"
              ? verifyRestoreEvidence(record(record(persisted).payload).restore)
              : null;
          const before =
            restore?.productionBefore ??
            record(record(persisted).payload).productionBefore;
          if (
            canonicalJson(parseProductionResourceIdentity(before)) !==
            canonicalJson(await inspectProduction(attempt))
          )
            throw new Error("ACTIVE_RECONCILE_PRODUCTION_CHANGED");
          if (restore !== null) {
            const isolated = parseIsolatedRestoreTarget(restore.isolatedTarget);
            const restoreEnv = restoreEnvironment(runtime, environment);
            const [containers, volumes] = await Promise.all([
              runDocker(
                [
                  "ps",
                  "--all",
                  "--filter",
                  `label=com.docker.compose.project=${String(isolated.composeProject)}`,
                  "--format",
                  "{{.ID}}",
                ],
                restoreEnv,
              ),
              runDocker(
                [
                  "volume",
                  "ls",
                  "--filter",
                  `label=com.docker.compose.project=${String(isolated.composeProject)}`,
                  "--format",
                  "{{.Name}}",
                ],
                restoreEnv,
              ),
            ]);
            if (containers !== "" || volumes !== "")
              throw new Error("ACTIVE_RECONCILE_RESTORE_CLEANUP");
          }
          break;
        }
        default:
          break;
      }
      return persisted;
    },
    rollback: async (attempt) => {
      let applicationError: unknown;
      let application: JsonRecord | null = null;
      try {
        application = await options.rollback(attempt);
      } catch (error) {
        applicationError = error;
      }
      let cleanupError: unknown;
      let cleanup: JsonRecord | null = null;
      try {
        cleanup = await cleanupIsolatedRestoreEnvironment({
          runtime,
          attempt,
          runDocker,
          environment,
          now,
        });
      } catch (error) {
        cleanupError = error;
        try {
          await recordRestoreCleanupFailure({
            runtime,
            attempt,
            now,
            error,
          });
        } catch (recordError) {
          cleanupError = new AggregateError(
            [error, recordError],
            "ACTIVE_RESTORE_CLEANUP_RECORD_FAILED",
          );
        }
      }
      if (cleanupError !== undefined || applicationError !== undefined)
        throw new AggregateError(
          [cleanupError, applicationError].filter(
            (value): value is NonNullable<unknown> => value !== undefined,
          ),
          "ACTIVE_ROLLBACK_FAILED",
        );
      return { ...record(application), restoreCleanup: cleanup };
    },
  };
};
