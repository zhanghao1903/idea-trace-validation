import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
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
import {
  assertProductionDatabasePrincipal,
  parseProductionDatabasePrincipal,
  type ProductionDatabasePrincipal,
} from "./database-principal.js";
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
  parseDeploymentTarget,
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
import {
  attemptAuthorityEnvironment,
  beginResourceLifecycle,
  cleanupForwardRestoreProject,
  executeRollbackWithCleanup,
  markResourceLifecycleReady,
} from "./rollback-cleanup.js";

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

export type HostDockerRunner = (
  args: readonly string[],
  environment?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) => Promise<string>;

export const defaultHostDockerRunner: HostDockerRunner = async (
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
  runDocker: HostDockerRunner,
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
  runDocker: HostDockerRunner,
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
  runDocker: HostDockerRunner;
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
  runDocker: HostDockerRunner,
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
  runDocker: HostDockerRunner;
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
  attempt: JsonRecord,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => ({
  ...attemptAuthorityEnvironment(attempt, environment),
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

export const beginRestoreLifecycle = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  runDocker: HostDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> =>
  beginResourceLifecycle({
    evidenceRoot: input.runtime.evidenceRoot,
    scope: "RESTORE",
    attempt: input.attempt,
    composeProject: input.runtime.restore.composeProject,
    databaseName: input.runtime.restore.databaseName,
    runDocker: input.runDocker,
    environment: restoreEnvironment(
      input.runtime,
      input.attempt,
      input.environment,
    ),
    now: input.now,
  });

export const markRestoreLifecycleReady = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  isolatedTarget: JsonRecord;
  runDocker: HostDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> =>
  markResourceLifecycleReady({
    evidenceRoot: input.runtime.evidenceRoot,
    scope: "RESTORE",
    attempt: input.attempt,
    composeProject: input.runtime.restore.composeProject,
    databaseName: input.runtime.restore.databaseName,
    isolatedTarget: parseIsolatedRestoreTarget(input.isolatedTarget),
    runDocker: input.runDocker,
    environment: restoreEnvironment(
      input.runtime,
      input.attempt,
      input.environment,
    ),
    now: input.now,
  });

export const cleanupIsolatedRestoreEnvironment = async (input: {
  runtime: HostActiveRuntime;
  attempt: JsonRecord;
  runDocker: HostDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  settleDelayMs?: number;
  requiredEmptySamples?: number;
}): Promise<JsonRecord> =>
  cleanupForwardRestoreProject({
    evidenceRoot: input.runtime.evidenceRoot,
    attempt: input.attempt,
    composeProject: input.runtime.restore.composeProject,
    databaseName: input.runtime.restore.databaseName,
    runDocker: input.runDocker,
    environment: restoreEnvironment(
      input.runtime,
      input.attempt,
      input.environment,
    ),
    now: input.now,
    sleep:
      input.settleDelayMs === undefined
        ? undefined
        : async () => Promise.resolve(),
  });

export const createHostActiveDeploymentOperations = (options: {
  runtime: HostActiveRuntime;
  envelope: unknown;
  productionDatabase: ProductionDatabasePrincipal;
  rollback: (attempt: JsonRecord) => Promise<JsonRecord>;
  environment?: NodeJS.ProcessEnv;
  runDocker?: HostDockerRunner;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): ActiveDeploymentOperations => {
  const runtime = parseHostActiveRuntime(options.runtime);
  const environment = options.environment ?? process.env;
  const dockerActorSignal = new AsyncLocalStorage<AbortSignal>();
  const baseDocker = options.runDocker ?? defaultHostDockerRunner;
  const runDocker: HostDockerRunner = (args, commandEnvironment, signal) =>
    baseDocker(
      args,
      commandEnvironment,
      signal ?? dockerActorSignal.getStore(),
    );
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const productionDatabase = parseProductionDatabasePrincipal(
    options.productionDatabase,
  );
  const config = (): ReturnType<typeof loadDeploymentConfig> => {
    const current = loadDeploymentConfig(environment);
    assertProductionDatabasePrincipal(productionDatabase, {
      databaseUser: current.postgresUser,
      databaseName: current.postgresDb,
    });
    return current;
  };
  config();
  const credentials = () => ({
    user: productionDatabase.databaseUser,
    path: environment.PATH,
  });

  const inspectProduction = (attempt: JsonRecord): Promise<JsonRecord> =>
    inspectLiveProductionIdentity({
      target: attempt.target,
      candidate: attempt.candidate,
      databaseUser: productionDatabase.databaseUser,
      databaseName: productionDatabase.databaseName,
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
    config();
    const operationEnvironment = {
      ...attemptAuthorityEnvironment(attempt, environment),
      POSTGRES_USER: productionDatabase.databaseUser,
      POSTGRES_DB: productionDatabase.databaseName,
    };
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
          await beginResourceLifecycle({
            evidenceRoot: runtime.evidenceRoot,
            scope: "PRODUCTION",
            attempt,
            composeProject: project,
            databaseName: config().postgresDb,
            runDocker,
            environment: operationEnvironment,
            now,
          });
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
            operationEnvironment,
          );
          const database = await inspectLiveProductionDatabaseIdentity({
            target: attempt.target,
            databaseUser: config().postgresUser,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, operationEnvironment),
          });
          await markResourceLifecycleReady({
            evidenceRoot: runtime.evidenceRoot,
            scope: "PRODUCTION",
            attempt,
            composeProject: project,
            databaseName: config().postgresDb,
            runDocker,
            environment: operationEnvironment,
            now,
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
          databaseUser: config().postgresUser,
          databaseName: config().postgresDb,
          runDocker: (args) => runDocker(args, operationEnvironment),
        });
        const backup = await createBackup({
          runtime,
          attempt,
          manifest,
          database,
          backupId: runtime.preMigrationBackupId,
          purpose: "PRE_MIGRATION_SAFETY",
          storySha256: null,
          environment: operationEnvironment,
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
          operationEnvironment,
        );
        const database = parseDatabaseIdentity(attempt.sourceDatabase);
        const migration = await inspectMigration({
          runDocker,
          containerId: String(database.containerId),
          databaseName: String(database.databaseName),
          user: config().postgresUser,
          manifest,
          environment: operationEnvironment,
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
          operationEnvironment,
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
              operationEnvironment,
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
          operationEnvironment,
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
          databaseUser: config().postgresUser,
          databaseName: config().postgresDb,
          runDocker: (args) => runDocker(args, operationEnvironment),
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
          environment: operationEnvironment,
          runDocker,
          now,
          signal: context.signal,
        });
        return activeOutput({ phase, attempt, now, payload: { backup } });
      }
      case "RESTORE_ENVIRONMENT": {
        const productionBefore = await inspectProduction(attempt);
        const restoreEnv = restoreEnvironment(runtime, attempt, environment);
        const [containers, networks, volumes] = await Promise.all([
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
              "network",
              "ls",
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
        if (containers !== "" || networks !== "" || volumes !== "")
          throw new Error("ACTIVE_RESTORE_TARGET_EXISTS");
        await beginRestoreLifecycle({
          runtime,
          attempt,
          runDocker,
          environment,
          now,
        });
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
          runDocker,
          environment,
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
        const restoreEnv = restoreEnvironment(runtime, attempt, environment);
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
        const cleanup = await cleanupIsolatedRestoreEnvironment({
          runtime,
          attempt,
          runDocker,
          environment,
          now,
        });
        if (cleanup.status !== "PASS")
          throw new Error("ACTIVE_RESTORE_CLEANUP_FAILED");
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
    execute: (phase, attempt, context) => {
      config();
      return dockerActorSignal.run(context.signal, () =>
        executePhase(phase, attempt, context),
      );
    },
    reconcile: async (phase, attempt, persisted, _context) => {
      config();
      await readManifest(runtime, attempt);
      const operationEnvironment = attemptAuthorityEnvironment(
        attempt,
        environment,
      );
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
            environment: operationEnvironment,
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
            databaseUser: config().postgresUser,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, operationEnvironment),
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
            operationEnvironment,
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
            databaseUser: config().postgresUser,
            databaseName: config().postgresDb,
            runDocker: (args) => runDocker(args, operationEnvironment),
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
            const restoreEnv = restoreEnvironment(
              runtime,
              attempt,
              environment,
            );
            const [containers, networks, volumes] = await Promise.all([
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
                  "network",
                  "ls",
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
            if (containers !== "" || networks !== "" || volumes !== "")
              throw new Error("ACTIVE_RECONCILE_RESTORE_CLEANUP");
            const cleanup = await cleanupIsolatedRestoreEnvironment({
              runtime,
              attempt,
              runDocker,
              environment,
              now,
            });
            if (cleanup.status !== "PASS")
              throw new Error("ACTIVE_RECONCILE_RESTORE_AUTHORITY");
          }
          break;
        }
        default:
          break;
      }
      return persisted;
    },
    rollback: async (attempt) => {
      config();
      const target = parseDeploymentTarget(attempt.target);
      return executeRollbackWithCleanup({
        evidenceRoot: runtime.evidenceRoot,
        attempt,
        productionProject: String(target.composeProject),
        restoreProject: runtime.restore.composeProject,
        restoreDatabaseName: runtime.restore.databaseName,
        databaseUser: productionDatabase.databaseUser,
        databaseName: productionDatabase.databaseName,
        runApplicationRollback: () => options.rollback(attempt),
        runDocker,
        environment,
        now,
      });
    },
  };
};
