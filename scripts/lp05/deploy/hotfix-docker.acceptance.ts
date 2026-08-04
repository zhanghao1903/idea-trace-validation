import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
} from "../shared/contracts.js";
import {
  inspectLiveProductionDatabaseIdentity,
  inspectLiveProductionIdentity,
} from "../database/production-runtime.js";
import { finalizeAuthorizationEnvelope } from "./authorization-envelope.js";
import {
  createAttemptRecord,
  finalizeAttemptRecord,
  writeAttemptRecord,
} from "./attempt-record.js";
import { transitionAttempt } from "./attempt-state.js";
import { runDeployment, type DeploymentOracles } from "./controller.js";
import { executeManualRollback } from "./manual-rollback.js";
import { createAttemptRuntimeBinding } from "./runtime-binding.js";
import {
  attemptAuthorityEnvironment,
  beginResourceLifecycle,
  cleanupForwardRestoreProject,
  cleanupOwnedProject,
  executeRollbackWithCleanup,
  markResourceLifecycleReady,
  type CleanupDockerRunner,
} from "./rollback-cleanup.js";
import { atomicWrite } from "../shared/filesystem.js";

const execute = promisify(execFile);
const POSTGRES_IMAGE =
  "docker.io/library/postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";

const docker: CleanupDockerRunner = async (args, environment) =>
  (
    await execute("docker", [...args], {
      cwd: process.cwd(),
      env: environment,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  ).stdout.trim();

const exactOne = (value: string, code: string): string => {
  const entries = value.split(/\r?\n/u).filter((entry) => entry !== "");
  if (entries.length !== 1 || entries[0] === undefined) throw new Error(code);
  return entries[0];
};

const projectCounts = async (
  project: string,
  environment: NodeJS.ProcessEnv,
): Promise<{ containers: number; networks: number; volumes: number }> => {
  const [containers, networks, volumes] = await Promise.all([
    docker(
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
    docker(
      [
        "network",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--format",
        "{{.ID}}",
      ],
      environment,
    ),
    docker(
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
  const count = (value: string): number =>
    value.split(/\r?\n/u).filter((entry) => entry !== "").length;
  return {
    containers: count(containers),
    networks: count(networks),
    volumes: count(volumes),
  };
};

const compose = (project: string, restore = false): string[] => [
  "compose",
  "-p",
  project,
  "-f",
  "deploy/compose.production.yaml",
  ...(restore ? ["-f", "deploy/compose.restore.yaml"] : []),
];

const main = async (): Promise<void> => {
  const postgresImageId = exactOne(
    await docker(["image", "inspect", "--format", "{{.Id}}", POSTGRES_IMAGE], {
      PATH: process.env.PATH,
    }),
    "HOTFIX_POSTGRES_IMAGE_ID",
  );
  const nonce = `${process.pid}-${Date.now().toString(36)}`;
  const productionProject = `lp05-hotfix-prod-${nonce}`;
  const restoreProject = `lp05-restore-hotfix-${nonce}`;
  if (
    [productionProject, restoreProject].some(
      (project) =>
        project === "idea-validation-prod" ||
        (!project.startsWith("lp05-hotfix-") &&
          !project.startsWith("lp05-restore-hotfix-")),
    )
  )
    throw new Error("HOTFIX_ACCEPTANCE_PROJECT_UNSAFE");
  const root = await mkdtemp(join(tmpdir(), "lp05-hotfix-docker-"));
  const secretsRoot = join(root, "secrets");
  await mkdir(secretsRoot, { mode: 0o700 });
  await Promise.all([
    writeFile(join(secretsRoot, "postgres_password"), "hotfix-test-password", {
      mode: 0o644,
    }),
    writeFile(
      join(secretsRoot, "ai_api_token"),
      "hotfix-test-ai-token-with-at-least-32-characters",
      { mode: 0o644 },
    ),
    writeFile(
      join(secretsRoot, "human_control_token"),
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      { mode: 0o644 },
    ),
  ]);
  const targetSeed = {
    hostFingerprintSha256: "2".repeat(64),
    domain: "hotfix.example.com",
    deployRoot: join(root, "deploy"),
  };
  const candidate = {
    manifestSha256: "1".repeat(64),
    releaseId: "lp05-99734e8e6c45-amd64",
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    imageId: postgresImageId,
    archiveSha256: "d".repeat(64),
    platform: "linux/amd64",
  };
  const target = {
    targetId: `target_${canonicalSha256(targetSeed).slice(0, 32)}`,
    ...targetSeed,
    expectedIps: ["8.8.8.8"],
    platform: "linux/amd64",
    os: { id: "ubuntu", versionId: "24.04" },
    composeProject: productionProject,
  };
  const envelope = finalizeAuthorizationEnvelope({
    proposal: {
      workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
      featureId: "lp-05-deployment-release-8c3f1a6d5e20",
      mergeCommitSha: candidate.sourceCommit,
      candidate,
      target,
      backupPolicy: {
        backupRoot: join(root, "backups"),
        retentionCount: 7,
        schedule: "daily",
        ageRecipientFingerprint: "3".repeat(64),
        minimumFreeBytes: 10_000_000,
        responsibleOperator: "hotfix-acceptance",
      },
      operations: [...REQUIRED_OPERATIONS],
      excludedOperations: [...REQUIRED_EXCLUSIONS],
      syntheticPublicReadConsent: true,
      previousRelease: null,
      toolchain: {
        dockerEngineVersion: "28.0.0",
        composeVersion: "2.35.0",
        ageVersion: "1.2.1",
        dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
        ageInstallationSource: "OS_VENDOR_PACKAGE",
        observedAt: "2026-08-04T00:00:00.000Z",
      },
      proposedAt: "2026-08-04T00:00:00.000Z",
    },
    authorization: {
      authorizedBy: "Hotfix acceptance fixture",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
      authorizedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-05T00:00:00.000Z",
      authorizationEvidenceSha256: sha256("hotfix acceptance authority"),
    },
    createdAt: "2026-08-04T00:00:00.000Z",
  });
  const value = createAttemptRecord({
    attemptId: `deploy_hotfix_${nonce}`,
    envelopeId: String(envelope.envelopeId),
    envelopeSha256: String(envelope.envelopeSha256),
    candidate,
    target,
    previousRelease: null,
    startedAt: "2026-08-04T00:00:00.000Z",
  });
  const baseEnvironment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    ACME_EMAIL: "operator@example.com",
    APP_IMAGE: POSTGRES_IMAGE,
    APP_IMAGE_ID: postgresImageId,
    APP_PLATFORM: "linux/amd64",
    BACKUP_ROOT: join(root, "backups"),
    COMPOSE_PROJECT_NAME: productionProject,
    DEPLOY_DOMAIN: "hotfix.example.com",
    DEPLOY_ROOT: join(root, "deploy"),
    POSTGRES_DB: "idea_validation",
    POSTGRES_USER: "idea_validation",
    RELEASE_ID: "lp05-99734e8e6c45-amd64",
    SECRETS_ROOT: secretsRoot,
    SOURCE_COMMIT: "a".repeat(40),
    SOURCE_TREE: "b".repeat(40),
  };
  const productionEnvironment = attemptAuthorityEnvironment(
    value,
    baseEnvironment,
  );
  const restoreEnvironment: NodeJS.ProcessEnv = {
    ...productionEnvironment,
    COMPOSE_PROJECT_NAME: restoreProject,
    POSTGRES_DB: "idea_validation_restore",
    RESTORE_APP_PORT: "18081",
  };
  const foreignNetwork = `lp05-hotfix-foreign-network-${nonce}`;
  const foreignVolume = `lp05-hotfix-foreign-volume-${nonce}`;
  let foreignNetworkId: string | null = null;
  let foreignVolumeCreated = false;
  const auxiliaryContainerIds: string[] = [];
  let milliseconds = Date.parse("2026-08-04T00:00:00.000Z");
  const now = () => new Date((milliseconds += 1_000));
  try {
    foreignNetworkId = await docker(
      [
        "network",
        "create",
        "--label",
        "com.docker.compose.project=lp05-hotfix-foreign",
        foreignNetwork,
      ],
      baseEnvironment,
    );
    await docker(
      [
        "volume",
        "create",
        "--label",
        "com.docker.compose.project=lp05-hotfix-foreign",
        foreignVolume,
      ],
      baseEnvironment,
    );
    foreignVolumeCreated = true;

    await beginResourceLifecycle({
      evidenceRoot: join(root, "evidence"),
      scope: "PRODUCTION",
      attempt: value,
      composeProject: productionProject,
      databaseName: "idea_validation",
      runDocker: docker,
      environment: productionEnvironment,
      now,
    });
    await docker(
      [
        ...compose(productionProject),
        "up",
        "--pull",
        "never",
        "--detach",
        "--wait",
        "--wait-timeout",
        "120",
        "postgres",
      ],
      productionEnvironment,
    );
    await markResourceLifecycleReady({
      evidenceRoot: join(root, "evidence"),
      scope: "PRODUCTION",
      attempt: value,
      composeProject: productionProject,
      databaseName: "idea_validation",
      runDocker: docker,
      environment: productionEnvironment,
      now,
    });
    const productionContainer = exactOne(
      await docker(
        [...compose(productionProject), "ps", "--quiet", "postgres"],
        productionEnvironment,
      ),
      "HOTFIX_PRODUCTION_CONTAINER",
    );
    const roleCount = exactOne(
      await docker(
        [
          "exec",
          "--user",
          "postgres",
          productionContainer,
          "psql",
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--username",
          "idea_validation",
          "--dbname",
          "idea_validation",
          "--command",
          "SELECT count(*) FROM pg_roles WHERE rolname='postgres'",
        ],
        productionEnvironment,
      ),
      "HOTFIX_POSTGRES_ROLE_COUNT",
    );
    if (roleCount !== "0") throw new Error("HOTFIX_POSTGRES_ROLE_PRESENT");
    const authorityLabels = [
      "--label",
      `io.idea-validation.attempt-id=${String(value.attemptId)}`,
      "--label",
      `io.idea-validation.target-id=${String(target.targetId)}`,
      "--label",
      `io.idea-validation.candidate-manifest-sha256=${String(candidate.manifestSha256)}`,
      "--label",
      "io.idea-validation.environment=production",
    ];
    for (const [service, role] of [
      ["app", "application"],
      ["caddy", "edge"],
    ] as const) {
      auxiliaryContainerIds.push(
        exactOne(
          await docker(
            [
              "run",
              "--detach",
              "--name",
              `${productionProject}-${service}-identity`,
              "--label",
              `com.docker.compose.project=${productionProject}`,
              "--label",
              `com.docker.compose.service=${service}`,
              ...authorityLabels,
              "--label",
              `io.idea-validation.role=${role}`,
              "--entrypoint",
              "sh",
              POSTGRES_IMAGE,
              "-c",
              "while true; do sleep 3600; done",
            ],
            productionEnvironment,
          ),
          `HOTFIX_${service.toUpperCase()}_CONTAINER`,
        ),
      );
    }
    const runProductionDocker = (args: readonly string[]): Promise<string> =>
      docker(args, productionEnvironment);
    const sourceDatabase = await inspectLiveProductionDatabaseIdentity({
      target,
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runDocker: runProductionDocker,
    });
    const fullProduction = await inspectLiveProductionIdentity({
      target,
      candidate,
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runDocker: runProductionDocker,
      fetchImpl: async () => new Response("hotfix-release-marker"),
      certificateSha256: async () => "7".repeat(64),
    });
    const fullDatabase = fullProduction.database as Record<string, unknown>;
    const comparableFields = [
      "containerId",
      "volumeName",
      "volumeMountId",
      "systemIdentifier",
      "databaseName",
      "postgresVersion",
    ] as const;
    if (
      comparableFields.some(
        (field) => sourceDatabase[field] !== fullDatabase[field],
      )
    )
      throw new Error("HOTFIX_IDENTITY_READER_MISMATCH");

    await docker(
      [
        "exec",
        productionContainer,
        "psql",
        "--no-psqlrc",
        "--username",
        "idea_validation",
        "--dbname",
        "idea_validation",
        "--command",
        "CREATE TABLE recovery_binding_probe (id integer PRIMARY KEY)",
      ],
      productionEnvironment,
    );
    await docker(
      [
        "exec",
        productionContainer,
        "psql",
        "--no-psqlrc",
        "--username",
        "idea_validation",
        "--dbname",
        "idea_validation",
        "--command",
        "CREATE DATABASE empty_decoy",
      ],
      productionEnvironment,
    );
    const driftFailed = finalizeAttemptRecord(
      transitionAttempt(value, {
        to: "FAILED",
        occurredAt: now().toISOString(),
        reasonCode: "HOTFIX_RECOVERY_DRIFT_FIXTURE",
        evidenceSha256: sha256("HOTFIX_RECOVERY_DRIFT_FIXTURE"),
      }),
    );
    const driftAttempt = finalizeAttemptRecord(
      transitionAttempt(driftFailed, {
        to: "ROLLING_BACK",
        occurredAt: now().toISOString(),
        reasonCode: "INGRESS_DISABLE_AND_ROLLBACK_STARTED",
        evidenceSha256: sha256("INGRESS_DISABLE_AND_ROLLBACK_STARTED"),
        projection: { rollback: driftFailed.rollback },
      }),
    );
    const driftStateRoot = join(root, "drift-state");
    const driftAttemptsRoot = join(driftStateRoot, "attempts");
    await mkdir(driftAttemptsRoot, { recursive: true, mode: 0o700 });
    const driftAttemptPath = join(
      driftAttemptsRoot,
      `${String(driftAttempt.attemptId)}.json`,
    );
    await writeAttemptRecord(driftAttemptPath, null, driftAttempt);
    const driftRuntime = {
      schemaVersion: "1.0" as const,
      evidenceRoot: join(root, "drift-evidence"),
      candidateManifestPath: join(root, "drift-candidate.json"),
      preMigrationBackupId: "backup_drift_pre",
      postDeployBackupId: "backup_drift_post",
      initialSmoke: {
        smokeId: "smoke_drift_initial",
        proofRoot: join(root, "drift-proofs"),
        runId: "drift-initial",
      },
      postRestoreSmoke: {
        smokeId: "smoke_drift_post",
        proofRoot: join(root, "drift-proofs"),
        runId: "drift-post",
      },
      restore: {
        composeProject: `lp05-restore-drift-${nonce}`,
        databaseName: "idea_validation_restore",
        appPort: 18082,
        restoreId: "restore_drift_fixture",
        proofRoot: join(root, "drift-restore-proofs"),
        runId: "drift-restore",
      },
    };
    const driftBinding = createAttemptRuntimeBinding({
      attemptId: String(driftAttempt.attemptId),
      runtime: driftRuntime,
      productionDatabase: {
        databaseUser: "idea_validation",
        databaseName: "idea_validation",
      },
      previousEnvironment: null,
    });
    await atomicWrite(
      join(driftAttemptsRoot, `${String(driftAttempt.attemptId)}.runtime.json`),
      canonicalJson(driftBinding),
      0o600,
    );
    let recoveryDockerCalls = 0;
    let driftRejected = false;
    try {
      await executeManualRollback(
        {
          schemaVersion: "1.0",
          stateRoot: driftStateRoot,
          envelope,
          attemptPath: driftAttemptPath,
          previousEnvironment: null,
        },
        {
          environment: {
            ...productionEnvironment,
            APP_IMAGE: "idea-trace-validation:lp05-99734e8e6c45-amd64",
            POSTGRES_DB: "empty_decoy",
          },
          runDocker: async (args, commandEnvironment, signal) => {
            recoveryDockerCalls += 1;
            return docker(args, commandEnvironment, signal);
          },
          now,
        },
      );
    } catch (error) {
      driftRejected =
        error instanceof Error &&
        error.message === "DEPLOYMENT_RUNTIME_BINDING_CHANGED";
    }
    const boundProbeCount = exactOne(
      await docker(
        [
          "exec",
          productionContainer,
          "psql",
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--username",
          "idea_validation",
          "--dbname",
          "idea_validation",
          "--command",
          "SELECT count(*) FROM pg_class WHERE relname='recovery_binding_probe'",
        ],
        productionEnvironment,
      ),
      "HOTFIX_BOUND_DATABASE_PROBE",
    );
    const decoyProbeCount = exactOne(
      await docker(
        [
          "exec",
          productionContainer,
          "psql",
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--username",
          "idea_validation",
          "--dbname",
          "empty_decoy",
          "--command",
          "SELECT count(*) FROM pg_class WHERE relname='recovery_binding_probe'",
        ],
        productionEnvironment,
      ),
      "HOTFIX_DECOY_DATABASE_PROBE",
    );
    if (
      !driftRejected ||
      recoveryDockerCalls !== 0 ||
      boundProbeCount !== "1" ||
      decoyProbeCount !== "0" ||
      JSON.parse(await readFile(driftAttemptPath, "utf8")).currentState !==
        "ROLLING_BACK"
    )
      throw new Error("HOTFIX_DATABASE_PRINCIPAL_DRIFT_NOT_REJECTED");
    await docker(
      [
        "exec",
        productionContainer,
        "psql",
        "--no-psqlrc",
        "--username",
        "idea_validation",
        "--dbname",
        "idea_validation",
        "--command",
        "DROP TABLE recovery_binding_probe",
      ],
      productionEnvironment,
    );
    await docker(
      [
        "exec",
        productionContainer,
        "psql",
        "--no-psqlrc",
        "--username",
        "idea_validation",
        "--dbname",
        "idea_validation",
        "--command",
        "DROP DATABASE empty_decoy",
      ],
      productionEnvironment,
    );

    await beginResourceLifecycle({
      evidenceRoot: join(root, "evidence"),
      scope: "RESTORE",
      attempt: value,
      composeProject: restoreProject,
      databaseName: "idea_validation_restore",
      runDocker: docker,
      environment: restoreEnvironment,
      now,
    });
    await docker(
      [
        ...compose(restoreProject, true),
        "up",
        "--pull",
        "never",
        "--detach",
        "--wait",
        "--wait-timeout",
        "120",
        "postgres",
      ],
      restoreEnvironment,
    );
    const restoreContainer = exactOne(
      await docker(
        [...compose(restoreProject, true), "ps", "--quiet", "postgres"],
        restoreEnvironment,
      ),
      "HOTFIX_RESTORE_CONTAINER",
    );
    const restoreVolume = exactOne(
      await docker(
        [
          "volume",
          "ls",
          "--filter",
          `label=com.docker.compose.project=${restoreProject}`,
          "--format",
          "{{.Name}}",
        ],
        restoreEnvironment,
      ),
      "HOTFIX_RESTORE_VOLUME",
    );
    await markResourceLifecycleReady({
      evidenceRoot: join(root, "evidence"),
      scope: "RESTORE",
      attempt: value,
      composeProject: restoreProject,
      databaseName: "idea_validation_restore",
      isolatedTarget: {
        kind: "ISOLATED",
        composeProject: restoreProject,
        containerId: restoreContainer,
        volumeName: restoreVolume,
        systemIdentifier: "200",
        volumeLabelSha256: "4".repeat(64),
        containerLabelSha256: "5".repeat(64),
        origin: "http://127.0.0.1:18081/",
        databaseHost: "127.0.0.1",
        databasePort: 5432,
        databaseName: "idea_validation_restore",
      },
      runDocker: docker,
      environment: restoreEnvironment,
      now,
    });
    const deletionBeforeEvidence = await cleanupOwnedProject({
      evidenceRoot: join(root, "evidence"),
      scope: "RESTORE",
      attempt: value,
      composeProject: restoreProject,
      databaseName: "idea_validation_restore",
      runDocker: docker,
      environment: restoreEnvironment,
      now,
    });
    if (deletionBeforeEvidence.status !== "PASS")
      throw new Error("HOTFIX_RESTORE_DELETION_BEFORE_EVIDENCE");
    const forwardRestoreCleanup = await cleanupForwardRestoreProject({
      evidenceRoot: join(root, "evidence"),
      attempt: value,
      composeProject: restoreProject,
      databaseName: "idea_validation_restore",
      runDocker: docker,
      environment: restoreEnvironment,
      now,
    });
    const forwardRestoreLifecycle = JSON.parse(
      await readFile(
        join(
          root,
          "evidence",
          String(value.attemptId),
          "restore-lifecycle.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    if (
      forwardRestoreCleanup.status !== "PASS" ||
      forwardRestoreLifecycle.state !== "CLEANED" ||
      Object.values(
        await projectCounts(restoreProject, restoreEnvironment),
      ).some((count) => count !== 0)
    )
      throw new Error("HOTFIX_FORWARD_RESTORE_CLEANUP");

    const unexpected = async (): Promise<never> => {
      throw new Error("HOTFIX_UNEXPECTED_FORWARD_PHASE");
    };
    const oracles: DeploymentOracles = {
      preflight: async () => ({
        reasonCode: "HOTFIX_DATABASE_IDENTITY_VERIFIED",
        evidenceSha256: canonicalSha256({ sourceDatabase, fullProduction }),
        projection: { sourceDatabase },
      }),
      safetyBackup: async () => {
        throw new Error("HOTFIX_DETERMINISTIC_NEXT_PHASE_FAILURE");
      },
      migrate: unexpected,
      appReady: unexpected,
      httpsReady: unexpected,
      initialSmoke: unexpected,
      postDeployBackup: unexpected,
      restoreEnvironment: unexpected,
      restore: unexpected,
      productionUnchanged: unexpected,
      postRestoreSmoke: unexpected,
      rollback: async (attempt) => {
        const result = await executeRollbackWithCleanup({
          evidenceRoot: join(root, "evidence"),
          attempt,
          productionProject,
          restoreProject,
          restoreDatabaseName: "idea_validation_restore",
          databaseUser: "idea_validation",
          databaseName: "idea_validation",
          runApplicationRollback: async () => ({
            status: "NOT_APPLICABLE",
            reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
            previousRelease: null,
            readinessSha256: null,
            smokeSha256: null,
            startedAt: now().toISOString(),
            finishedAt: now().toISOString(),
          }),
          runDocker: docker,
          environment: productionEnvironment,
          now,
        });
        if (
          result.applicationRollback.status !== "NOT_APPLICABLE" ||
          result.cleanupReference.status !== "PASS" ||
          result.terminalEvidence.terminalState !== "ROLLED_BACK"
        )
          throw new Error("HOTFIX_ROLLBACK_RESULT");
        return {
          reasonCode: String(result.terminalEvidence.reasonCode),
          evidenceSha256: String(result.terminalEvidence.evidenceSha256),
          terminalState: "ROLLED_BACK",
          projection: { rollback: result.applicationRollback },
        };
      },
    };
    const persistedStates: string[] = [];
    const result = await runDeployment({
      envelope,
      attempt: value,
      oracles,
      now,
      persist: async (_previous, next) => {
        persistedStates.push(String(next.currentState));
      },
    });
    if (
      result.currentState !== "ROLLED_BACK" ||
      persistedStates.join(",") !==
        "PREFLIGHT_PASSED,FAILED,ROLLING_BACK,ROLLED_BACK"
    )
      throw new Error("HOTFIX_CONTROLLER_RECOVERY");
    if (
      Object.values(
        await projectCounts(productionProject, productionEnvironment),
      ).some((count) => count !== 0) ||
      Object.values(
        await projectCounts(restoreProject, restoreEnvironment),
      ).some((count) => count !== 0)
    )
      throw new Error("HOTFIX_PROJECT_RESOURCES_REMAIN");
    await Promise.all([
      docker(["network", "inspect", foreignNetwork], baseEnvironment),
      docker(["volume", "inspect", foreignVolume], baseEnvironment),
    ]);
  } finally {
    for (const containerId of auxiliaryContainerIds)
      await docker(["rm", "--force", containerId], baseEnvironment).catch(
        () => undefined,
      );
    await docker(
      [...compose(productionProject), "down", "--volumes", "--remove-orphans"],
      productionEnvironment,
    ).catch(() => undefined);
    await docker(
      [
        ...compose(restoreProject, true),
        "down",
        "--volumes",
        "--remove-orphans",
      ],
      restoreEnvironment,
    ).catch(() => undefined);
    if (foreignNetworkId !== null)
      await docker(["network", "rm", foreignNetworkId], baseEnvironment).catch(
        () => undefined,
      );
    if (foreignVolumeCreated)
      await docker(["volume", "rm", foreignVolume], baseEnvironment).catch(
        () => undefined,
      );
    await rm(root, { recursive: true, force: true });
  }
  process.stdout.write("LP05_HOTFIX_DOCKER_ACCEPTANCE_PASS\n");
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "HOTFIX_DOCKER_ACCEPTANCE_FAILED"}\n`,
  );
  process.exitCode = 1;
});
