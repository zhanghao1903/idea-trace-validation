import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDeploymentConfig } from "./config.js";
import {
  acquireAttemptLock,
  bindEnvelopeToAttempt,
  releaseAttemptLock,
} from "./attempt-lock.js";
import { finalizeAuthorizationEnvelope } from "./authorization-envelope.js";
import {
  createAttemptRecord,
  finalizeAttemptRecord,
} from "./attempt-record.js";
import { interruptAttempt, resumeInterruptedAttempt } from "./attempt-state.js";
import {
  assertControllerInitialAttempt,
  runDeployment,
  type DeploymentOracles,
} from "./controller.js";
import {
  createActiveDeploymentOracles,
  finalizeActivePhaseOutput,
  type ActiveDeploymentOperations,
} from "./active-oracles.js";
import {
  beginRestoreLifecycle,
  cleanupIsolatedRestoreEnvironment,
  markRestoreLifecycleReady,
  parseHostActiveRuntime,
  type HostActiveRuntime,
} from "./host-active-operations.js";
import { evaluateOperations } from "./ops-status.js";
import { readValidatedRuntimeSecrets } from "./preflight.js";
import { parseSemver, inspectToolchain } from "./toolchain.js";
import { verifyPublishedPorts } from "../smoke/network.js";
import { canonicalSha256, sha256 } from "../shared/canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
  record,
  type JsonRecord,
} from "../shared/contracts.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

const environment = (): NodeJS.ProcessEnv => ({
  DEPLOY_DOMAIN: "demo.example.com",
  ACME_EMAIL: "operator@example.com",
  RELEASE_ID: "lp05-aaaaaaaaaaaa-amd64",
  SOURCE_COMMIT: "a".repeat(40),
  SOURCE_TREE: "b".repeat(40),
  APP_IMAGE_ID: `sha256:${"c".repeat(64)}`,
  APP_IMAGE: "idea-trace-validation:lp05-aaaaaaaaaaaa-amd64",
  APP_PLATFORM: "linux/amd64",
  POSTGRES_USER: "idea_validation",
  POSTGRES_DB: "idea_validation",
  DEPLOY_ROOT: "/srv/idea-validation",
  BACKUP_ROOT: "/srv/idea-validation-backups",
  SECRETS_ROOT: "/etc/idea-validation/secrets",
});

describe("LP-05 deployment config", () => {
  it("accepts distinct safe roots and an exact candidate identity", () => {
    expect(loadDeploymentConfig(environment()).composeProject).toBe(
      "idea-validation-prod",
    );
  });

  it("rejects latest images and root collisions", () => {
    expect(() =>
      loadDeploymentConfig({
        ...environment(),
        APP_IMAGE: "idea-trace-validation:latest",
      }),
    ).toThrow("CONFIG_INVALID:APP_IMAGE");
    expect(() =>
      loadDeploymentConfig({
        ...environment(),
        BACKUP_ROOT: "/srv/idea-validation",
      }),
    ).toThrow("CONFIG_ROOTS_MUST_DIFFER");
  });
});

describe("LP-05 toolchain preflight", () => {
  it("parses official version output", () =>
    expect(parseSemver("Docker version 28.2.1", "NO")).toEqual([28, 2, 1]));

  it("accepts the approved ranges and sources", async () => {
    const output = await inspectToolchain({
      platform: "linux",
      dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
      ageInstallationSource: "OS_VENDOR_PACKAGE",
      now: new Date("2026-08-03T00:00:00.000Z"),
      run: async (command, args) =>
        command === "age"
          ? "v1.2.1"
          : args.includes("compose")
            ? "2.35.0"
            : "28.2.1",
    });
    expect(output.composeVersion).toBe("2.35.0");
  });

  it("fails closed on host OS, Compose major and unknown source", async () => {
    await expect(inspectToolchain({ platform: "darwin" })).rejects.toThrow(
      "TOOLCHAIN_UNSUPPORTED:HOST_OS",
    );
    await expect(
      inspectToolchain({
        platform: "linux",
        dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
        ageInstallationSource: "OS_VENDOR_PACKAGE",
        run: async (command, args) =>
          command === "age"
            ? "1.2.1"
            : args.includes("compose")
              ? "5.1.1"
              : "28.2.1",
      }),
    ).rejects.toThrow("TOOLCHAIN_UNSUPPORTED:COMPOSE_RANGE");
  });
});

describe("LP-05 runtime secret filesystem contract", () => {
  const createSecrets = async (): Promise<string> => {
    const temporary = await mkdtemp(join(tmpdir(), "lp05-secrets-"));
    roots.push(temporary);
    const root = join(temporary, "runtime");
    await mkdir(root, { mode: 0o700 });
    await Promise.all([
      writeFile(join(root, "postgres_password"), "p".repeat(32), {
        mode: 0o644,
      }),
      writeFile(join(root, "ai_api_token"), "a".repeat(32), {
        mode: 0o644,
      }),
      writeFile(join(root, "human_control_token"), "H".repeat(43), {
        mode: 0o644,
      }),
    ]);
    return root;
  };

  it("accepts a non-traversable host directory with Compose-readable files", async () => {
    const root = await createSecrets();
    expect(await readValidatedRuntimeSecrets(root)).toEqual([
      "p".repeat(32),
      "a".repeat(32),
      "H".repeat(43),
    ]);
  });

  it("rejects a traversable directory or a file unreadable by non-root containers", async () => {
    const root = await createSecrets();
    await chmod(root, 0o711);
    await expect(readValidatedRuntimeSecrets(root)).rejects.toThrow(
      "PREFLIGHT_SECRETS_ROOT_INVALID",
    );
    await chmod(root, 0o700);
    await chmod(join(root, "ai_api_token"), 0o600);
    await expect(readValidatedRuntimeSecrets(root)).rejects.toThrow(
      "PREFLIGHT_SECRET_INVALID:ai_api_token",
    );
  });
});

describe("LP-05 operational safety", () => {
  it("publishes only Caddy and restricts local ports to loopback", () => {
    verifyPublishedPorts(
      [
        {
          service: "caddy",
          hostIp: "127.0.0.1",
          published: 18080,
          target: 8080,
        },
        {
          service: "caddy",
          hostIp: "127.0.0.1",
          published: 18443,
          target: 8443,
        },
      ],
      "LOCAL",
    );
    expect(() =>
      verifyPublishedPorts(
        [
          {
            service: "postgres",
            hostIp: "0.0.0.0",
            published: 5432,
            target: 5432,
          },
        ],
        "EXTERNAL",
      ),
    ).toThrow("NETWORK_EXPOSURE");
  });

  it("emits stable operations reason codes", () => {
    expect(
      evaluateOperations({
        appHealthy: false,
        databaseHealthy: true,
        restartCount: 4,
        certificateDaysRemaining: 10,
        freeBytes: 10,
        minimumFreeBytes: 20,
        newestBackupAgeHours: 40,
        backupTimerPassed: false,
        lastSmokePassed: false,
        observedAt: "2026-08-03T00:00:00.000Z",
      }).reasonCodes,
    ).toEqual([
      "APP_UNHEALTHY",
      "RESTART_LOOP",
      "CERTIFICATE_EXPIRY_RISK",
      "DISK_SPACE_LOW",
      "BACKUP_STALE",
      "BACKUP_TIMER_FAILED",
      "SMOKE_FAILED",
    ]);
  });
});

describe("LP-05 deployment attempt lock", () => {
  it("serializes one target and releases only the owning lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-state-"));
    roots.push(root);
    const lock = await acquireAttemptLock(
      root,
      "target_production",
      "deploy_attempt_one",
    );
    await expect(
      acquireAttemptLock(root, "target_production", "deploy_attempt_two"),
    ).rejects.toThrow("DEPLOYMENT_TARGET_LOCKED");
    await releaseAttemptLock(lock);
    const next = await acquireAttemptLock(
      root,
      "target_production",
      "deploy_attempt_two",
    );
    await releaseAttemptLock(next);
  });

  it("serializes stale-lock recovery and marks the recovered owner", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-state-"));
    roots.push(root);
    const targetId = "target_production";
    const locks = join(root, "locks");
    await mkdir(locks, { recursive: true });
    const destination = join(locks, `${sha256(targetId)}.lock`);
    await writeFile(
      destination,
      JSON.stringify({
        schemaVersion: "1.0",
        targetId,
        attemptId: "deploy_attempt_one",
        pid: 2_147_483_647,
        nonce: "stale",
      }),
    );
    const lock = await acquireAttemptLock(root, targetId, "deploy_attempt_one");
    expect(lock.recovered).toBe(true);
    await releaseAttemptLock(lock);

    await writeFile(`${destination}.recovery`, "held");
    await writeFile(
      destination,
      JSON.stringify({
        schemaVersion: "1.0",
        targetId,
        attemptId: "deploy_attempt_one",
        pid: 2_147_483_647,
        nonce: "stale-again",
      }),
    );
    await expect(
      acquireAttemptLock(root, targetId, "deploy_attempt_one"),
    ).rejects.toThrow("DEPLOYMENT_TARGET_LOCKED");
  });

  it("binds one envelope idempotently to exactly one attempt", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-state-"));
    roots.push(root);
    await bindEnvelopeToAttempt(root, "auth_one", "deploy_attempt_one");
    await bindEnvelopeToAttempt(root, "auth_one", "deploy_attempt_one");
    await expect(
      bindEnvelopeToAttempt(root, "auth_one", "deploy_attempt_two"),
    ).rejects.toThrow("DEPLOYMENT_ENVELOPE_ALREADY_BOUND");
  });
});

describe("LP-05 active runtime input", () => {
  it("rejects a future-complete evidence bundle at the production boundary", () => {
    expect(() =>
      parseHostActiveRuntime({
        schemaVersion: "1.0",
        evidenceRoot: "/safe/evidence",
        candidateManifestPath: "/safe/manifest.json",
        preMigrationBackupId: "backup_preflight1",
        postDeployBackupId: "backup_postdeploy1",
        initialSmoke: {
          smokeId: "smoke_initial1",
          proofRoot: "/safe/proofs",
          runId: "runtime-initial",
        },
        postRestoreSmoke: {
          smokeId: "smoke_postrestore1",
          proofRoot: "/safe/proofs",
          runId: "runtime-post",
        },
        restore: {
          composeProject: "lp05-restore-runtime",
          databaseName: "idea_validation_restore",
          appPort: 18081,
          restoreId: "restore_runtime1",
          proofRoot: "/safe/restore-proofs",
          runId: "restore-runtime",
        },
        evidence: { status: "PASS" },
      }),
    ).toThrow("ACTIVE_RUNTIME:evidence");
  });

  it("persists controller-owned phase output and actively reconciles it", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-active-evidence-"));
    roots.push(root);
    const candidate = {
      manifestSha256: "1".repeat(64),
      releaseId: "lp05-controller-test",
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      imageId: `sha256:${"c".repeat(64)}`,
      archiveSha256: "d".repeat(64),
      platform: "linux/amd64",
    };
    const seed = {
      hostFingerprintSha256: "2".repeat(64),
      domain: "demo.example.com",
      deployRoot: "/srv/idea-validation",
    };
    const attempt = createAttemptRecord({
      attemptId: "deploy_phase_output",
      envelopeId: `auth_${"e".repeat(32)}`,
      envelopeSha256: "f".repeat(64),
      candidate,
      target: {
        targetId: `target_${canonicalSha256(seed).slice(0, 32)}`,
        ...seed,
        expectedIps: ["8.8.8.8"],
        platform: "linux/amd64",
        os: { id: "ubuntu", versionId: "24.04" },
        composeProject: "idea-validation-prod",
      },
      previousRelease: null,
      startedAt: "2026-08-03T00:00:00.000Z",
    });
    let executeCalls = 0;
    let reconcileCalls = 0;
    const operations: ActiveDeploymentOperations = {
      execute: async (phase, current) => {
        executeCalls += 1;
        return finalizeActivePhaseOutput({
          phase,
          attempt: current,
          observedAt: "2026-08-03T00:01:00.000Z",
          payload: { activeRead: "performed" },
        });
      },
      reconcile: async (_phase, _current, persisted) => {
        reconcileCalls += 1;
        return persisted;
      },
      rollback: async () => {
        throw new Error("UNEXPECTED_ROLLBACK");
      },
    };
    const active = createActiveDeploymentOracles({
      evidenceRoot: root,
      operations,
    });
    const first = await active.preflight(attempt);
    const second = await active.preflight(attempt);
    expect(first.evidenceSha256).toBe(second.evidenceSha256);
    expect(executeCalls).toBe(1);
    expect(reconcileCalls).toBe(1);
    expect(() =>
      assertControllerInitialAttempt({
        ...attempt,
        currentState: "DEPLOYED",
      }),
    ).toThrow("CONTROLLER_INITIAL_ATTEMPT_NOT_PREPARED");
  });

  it("records one explicit bounded interruption and resume", () => {
    const candidate = {
      manifestSha256: "1".repeat(64),
      releaseId: "lp05-controller-test",
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      imageId: `sha256:${"c".repeat(64)}`,
      archiveSha256: "d".repeat(64),
      platform: "linux/amd64",
    };
    const seed = {
      hostFingerprintSha256: "2".repeat(64),
      domain: "demo.example.com",
      deployRoot: "/srv/idea-validation",
    };
    const attempt = createAttemptRecord({
      attemptId: "deploy_resume123",
      envelopeId: `auth_${"e".repeat(32)}`,
      envelopeSha256: "f".repeat(64),
      candidate,
      target: {
        targetId: `target_${canonicalSha256(seed).slice(0, 32)}`,
        ...seed,
        expectedIps: ["8.8.8.8"],
        platform: "linux/amd64",
        os: { id: "ubuntu", versionId: "24.04" },
        composeProject: "idea-validation-prod",
      },
      previousRelease: null,
      startedAt: "2026-08-03T00:00:00.000Z",
    });
    const interrupted = finalizeAttemptRecord(
      interruptAttempt(attempt, {
        occurredAt: "2026-08-03T00:10:00.000Z",
        reasonCode: "STALE_PROCESS_LOCK_RECOVERED",
      }),
    );
    const resumed = finalizeAttemptRecord(
      resumeInterruptedAttempt(interrupted, {
        occurredAt: "2026-08-03T00:11:00.000Z",
        reasonCode: "BOUNDED_PROCESS_RESUME",
      }),
    );
    expect(resumed.currentState).toBe("RESUMING");
    expect(record(resumed.resume).count).toBe(1);
    expect(() =>
      resumeInterruptedAttempt(interrupted, {
        occurredAt: "2026-08-03T03:00:00.000Z",
        reasonCode: "TOO_LATE",
      }),
    ).toThrow("ATTEMPT_RESUME_WINDOW");
  });
});

describe("LP-05 isolated restore cleanup ownership", () => {
  const fixture = async (): Promise<{
    root: string;
    runtime: HostActiveRuntime;
    attempt: JsonRecord;
  }> => {
    const root = await mkdtemp(join(tmpdir(), "lp05-restore-cleanup-"));
    roots.push(root);
    const runtime = parseHostActiveRuntime({
      schemaVersion: "1.0",
      evidenceRoot: join(root, "evidence"),
      candidateManifestPath: join(root, "manifest.json"),
      preMigrationBackupId: "backup_cleanup_pre",
      postDeployBackupId: "backup_cleanup_post",
      initialSmoke: {
        smokeId: "smoke_cleanup_initial",
        proofRoot: join(root, "initial-proof"),
        runId: "cleanup-initial",
      },
      postRestoreSmoke: {
        smokeId: "smoke_cleanup_post",
        proofRoot: join(root, "post-proof"),
        runId: "cleanup-post",
      },
      restore: {
        composeProject: "lp05-restore-cleanup",
        databaseName: "idea_validation_restore",
        appPort: 18081,
        restoreId: "restore_cleanup",
        proofRoot: join(root, "restore-proof"),
        runId: "cleanup-restore",
      },
    });
    const seed = {
      hostFingerprintSha256: "2".repeat(64),
      domain: "demo.example.com",
      deployRoot: "/srv/idea-validation",
    };
    const attempt = createAttemptRecord({
      attemptId: "deploy_restore_cleanup",
      envelopeId: `auth_${"e".repeat(32)}`,
      envelopeSha256: "f".repeat(64),
      candidate: {
        manifestSha256: "1".repeat(64),
        releaseId: "lp05-cleanup-test",
        sourceCommit: "a".repeat(40),
        sourceTree: "b".repeat(40),
        imageId: `sha256:${"c".repeat(64)}`,
        archiveSha256: "d".repeat(64),
        platform: "linux/amd64",
      },
      target: {
        targetId: `target_${canonicalSha256(seed).slice(0, 32)}`,
        ...seed,
        expectedIps: ["8.8.8.8"],
        platform: "linux/amd64",
        os: { id: "ubuntu", versionId: "24.04" },
        composeProject: "idea-validation-prod",
      },
      previousRelease: null,
      startedAt: "2026-08-03T00:00:00.000Z",
    });
    return { root, runtime, attempt };
  };

  it("cleans an intent-bound restore project after a crash and preserves backup files", async () => {
    const { root, runtime, attempt } = await fixture();
    const now = () => new Date("2026-08-03T00:05:00.000Z");
    await beginRestoreLifecycle({ runtime, attempt, now });
    const backup = join(root, "backup.dump.age");
    await writeFile(backup, "encrypted-backup", { mode: 0o600 });
    let containers = ["restore-postgres", "restore-app"];
    let volumes = ["restore-data"];
    let downCalls = 0;
    const runDocker = async (args: readonly string[]): Promise<string> => {
      if (args[0] === "ps") return containers.join("\n");
      if (args[0] === "volume" && args[1] === "ls") return volumes.join("\n");
      if (args[0] === "inspect")
        return JSON.stringify([
          {
            Id: args[1],
            Config: {
              Labels: {
                "com.docker.compose.project": runtime.restore.composeProject,
              },
            },
          },
        ]);
      if (args[0] === "volume" && args[1] === "inspect")
        return JSON.stringify([
          {
            Name: args[2],
            Labels: {
              "com.docker.compose.project": runtime.restore.composeProject,
            },
          },
        ]);
      if (args[0] === "compose" && args.includes("down")) {
        expect(args).toContain(runtime.restore.composeProject);
        downCalls += 1;
        containers = [];
        volumes = [];
        return "";
      }
      throw new Error(`UNEXPECTED_DOCKER:${args.join(" ")}`);
    };
    const cleanup = await cleanupIsolatedRestoreEnvironment({
      runtime,
      attempt,
      runDocker,
      environment: {},
      now,
    });
    expect(cleanup.status).toBe("PASS");
    expect(downCalls).toBe(1);
    expect(await readFile(backup, "utf8")).toBe("encrypted-backup");
    const lifecycle = JSON.parse(
      await readFile(
        join(
          runtime.evidenceRoot,
          String(attempt.attemptId),
          "restore-lifecycle.json",
        ),
        "utf8",
      ),
    ) as JsonRecord;
    expect(lifecycle.state).toBe("CLEANED");
  });

  it("binds cleanup to the persisted target and rejects a foreign project label", async () => {
    const { runtime, attempt } = await fixture();
    const now = () => new Date("2026-08-03T00:05:00.000Z");
    await beginRestoreLifecycle({ runtime, attempt, now });
    await markRestoreLifecycleReady({
      runtime,
      attempt,
      now,
      isolatedTarget: {
        kind: "ISOLATED",
        composeProject: runtime.restore.composeProject,
        containerId: "restore-postgres",
        volumeName: "restore-data",
        systemIdentifier: "200",
        volumeLabelSha256: "4".repeat(64),
        containerLabelSha256: "5".repeat(64),
        origin: "http://127.0.0.1:18081/",
        databaseHost: "127.0.0.1",
        databasePort: 5432,
        databaseName: runtime.restore.databaseName,
      },
    });
    let downCalls = 0;
    const runDocker = async (args: readonly string[]): Promise<string> => {
      if (args[0] === "ps") return "restore-postgres";
      if (args[0] === "volume" && args[1] === "ls") return "restore-data";
      if (args[0] === "inspect")
        return JSON.stringify([
          {
            Config: {
              Labels: { "com.docker.compose.project": "foreign-project" },
            },
          },
        ]);
      if (args[0] === "compose") downCalls += 1;
      return "[]";
    };
    await expect(
      cleanupIsolatedRestoreEnvironment({
        runtime,
        attempt,
        runDocker,
        environment: {},
        now,
      }),
    ).rejects.toThrow("RESTORE_CLEANUP_CONTAINER_AUTHORITY");
    expect(downCalls).toBe(0);
  });
});

describe("LP-05 deployment failure recovery", () => {
  it("persists failure and invokes ingress-disable rollback", async () => {
    const candidate = {
      manifestSha256: "1".repeat(64),
      releaseId: "lp05-controller-test",
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      imageId: `sha256:${"c".repeat(64)}`,
      archiveSha256: "d".repeat(64),
      platform: "linux/amd64",
    };
    const targetSeed = {
      hostFingerprintSha256: "2".repeat(64),
      domain: "demo.example.com",
      deployRoot: "/srv/idea-validation",
    };
    const target = {
      targetId: `target_${canonicalSha256(targetSeed).slice(0, 32)}`,
      ...targetSeed,
      expectedIps: ["8.8.8.8"],
      platform: "linux/amd64",
      os: { id: "ubuntu", versionId: "24.04" },
      composeProject: "idea-validation-prod",
    };
    const envelope = finalizeAuthorizationEnvelope({
      proposal: {
        workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
        featureId: "lp-05-deployment-release-8c3f1a6d5e20",
        mergeCommitSha: "a".repeat(40),
        candidate,
        target,
        backupPolicy: {
          backupRoot: "/srv/idea-validation-backups",
          retentionCount: 7,
          schedule: "daily",
          ageRecipientFingerprint: "3".repeat(64),
          minimumFreeBytes: 10_000_000,
          responsibleOperator: "operator",
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
          observedAt: "2026-08-03T00:00:00.000Z",
        },
        proposedAt: "2026-08-03T00:00:00.000Z",
      },
      authorization: {
        authorizedBy: "User",
        sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
        authorizedAt: "2026-08-03T00:01:00.000Z",
        expiresAt: "2026-08-03T12:01:00.000Z",
        authorizationEvidenceSha256: sha256("controller authority"),
      },
      createdAt: "2026-08-03T00:01:00.000Z",
    });
    const attempt = createAttemptRecord({
      attemptId: "deploy_controller123",
      envelopeId: String(envelope.envelopeId),
      envelopeSha256: String(envelope.envelopeSha256),
      candidate,
      target,
      previousRelease: null,
      startedAt: "2026-08-03T00:01:00.000Z",
    });
    const unexpected = async (): Promise<never> => {
      throw new Error("UNEXPECTED_ORACLE");
    };
    let rollbackCalls = 0;
    const rollback = {
      status: "NOT_APPLICABLE",
      reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
      previousRelease: null,
      readinessSha256: null,
      smokeSha256: null,
      startedAt: "2026-08-03T00:02:00.000Z",
      finishedAt: "2026-08-03T00:02:01.000Z",
    };
    const oracles: DeploymentOracles = {
      preflight: async () => {
        throw new Error("PREFLIGHT_FAULT");
      },
      safetyBackup: unexpected,
      migrate: unexpected,
      appReady: unexpected,
      httpsReady: unexpected,
      initialSmoke: unexpected,
      postDeployBackup: unexpected,
      restoreEnvironment: unexpected,
      restore: unexpected,
      productionUnchanged: unexpected,
      postRestoreSmoke: unexpected,
      rollback: async () => {
        rollbackCalls += 1;
        return {
          reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
          evidenceSha256: canonicalSha256(rollback),
          projection: { rollback },
        };
      },
    };
    const persisted: JsonRecord[] = [];
    const result = await runDeployment({
      envelope,
      attempt,
      oracles,
      now: () => new Date("2026-08-03T00:02:00.000Z"),
      persist: async (_previous, next) => {
        persisted.push(next);
      },
    });
    expect(result.currentState).toBe("ROLLED_BACK");
    expect(rollbackCalls).toBe(1);
    expect(persisted.map((entry) => entry.currentState)).toEqual([
      "FAILED",
      "ROLLING_BACK",
      "ROLLED_BACK",
    ]);
  });
});

describe("LP-05 ordered active deployment", () => {
  const fixture = (upgrade: boolean) => {
    const candidate = {
      manifestSha256: "1".repeat(64),
      releaseId: "lp05-controller-test",
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      imageId: `sha256:${"c".repeat(64)}`,
      archiveSha256: "d".repeat(64),
      platform: "linux/amd64",
    };
    const targetSeed = {
      hostFingerprintSha256: "2".repeat(64),
      domain: "demo.example.com",
      deployRoot: "/srv/idea-validation",
    };
    const target = {
      targetId: `target_${canonicalSha256(targetSeed).slice(0, 32)}`,
      ...targetSeed,
      expectedIps: ["8.8.8.8"],
      platform: "linux/amd64",
      os: { id: "ubuntu", versionId: "24.04" },
      composeProject: "idea-validation-prod",
    };
    const previousRelease = upgrade
      ? {
          releaseId: "lp04-previous",
          sourceCommit: "9".repeat(40),
          imageId: `sha256:${"8".repeat(64)}`,
          configSha256: "7".repeat(64),
        }
      : null;
    const envelope = finalizeAuthorizationEnvelope({
      proposal: {
        workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
        featureId: "lp-05-deployment-release-8c3f1a6d5e20",
        mergeCommitSha: "a".repeat(40),
        candidate,
        target,
        backupPolicy: {
          backupRoot: "/srv/idea-validation-backups",
          retentionCount: 7,
          schedule: "daily",
          ageRecipientFingerprint: "3".repeat(64),
          minimumFreeBytes: 10_000_000,
          responsibleOperator: "operator",
        },
        operations: [...REQUIRED_OPERATIONS],
        excludedOperations: [...REQUIRED_EXCLUSIONS],
        syntheticPublicReadConsent: true,
        previousRelease,
        toolchain: {
          dockerEngineVersion: "28.0.0",
          composeVersion: "2.35.0",
          ageVersion: "1.2.1",
          dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
          ageInstallationSource: "OS_VENDOR_PACKAGE",
          observedAt: "2026-08-03T00:00:00.000Z",
        },
        proposedAt: "2026-08-03T00:00:00.000Z",
      },
      authorization: {
        authorizedBy: "User",
        sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
        authorizedAt: "2026-08-03T00:01:00.000Z",
        expiresAt: "2026-08-03T12:01:00.000Z",
        authorizationEvidenceSha256: sha256("active controller authority"),
      },
      createdAt: "2026-08-03T00:01:00.000Z",
    });
    const attemptId = upgrade ? "deploy_active_upgrade" : "deploy_active_fresh";
    const database: JsonRecord = {
      targetId: target.targetId,
      project: target.composeProject,
      containerId: "postgres-active",
      volumeName: "postgres-data-active",
      volumeMountId: "mount-active",
      systemIdentifier: "123456789",
      databaseName: "idea_validation",
      postgresVersion: "17.10",
      databaseInstanceSha256: "",
    };
    database.databaseInstanceSha256 = canonicalSha256(database, [
      "databaseInstanceSha256",
    ]);
    const safety: JsonRecord = upgrade
      ? {
          backupId: "backup_safety_active",
          backupManifestSha256: "4".repeat(64),
          ciphertextSha256: "5".repeat(64),
          purpose: "PRE_MIGRATION_SAFETY",
          targetId: target.targetId,
          databaseInstanceSha256: database.databaseInstanceSha256,
          attemptId,
          candidateManifestSha256: candidate.manifestSha256,
        }
      : {
          kind: "FRESH_TARGET",
          targetId: target.targetId,
          verifiedAt: "2026-08-03T00:02:00.000Z",
          assertions: [
            { id: "no_application_data", status: "PASS" },
            { id: "no_prior_release", status: "PASS" },
            { id: "no_production_volume", status: "PASS" },
          ],
        };
    const migration: JsonRecord = {
      catalogSha256: "6".repeat(64),
      appliedLedgerSha256: "7".repeat(64),
      entries: [
        { id: "0001_lp01_core", sha256: "8".repeat(64), ledger: "legacy" },
        {
          id: "0002_lp02_execution_decisions",
          sha256: "9".repeat(64),
          ledger: "legacy",
        },
        {
          id: "0003_lp03_reporting_experience",
          sha256: "a".repeat(64),
          ledger: "feature",
        },
      ],
      status: "PASS",
      verifiedAt: "2026-08-03T00:03:00.000Z",
    };
    const smokeRef = (
      mode: "EXTERNAL_INITIAL" | "EXTERNAL_POST_RESTORE",
      digest: string,
    ): JsonRecord => ({
      smokeId: `smoke_${mode.toLowerCase()}`,
      smokeSha256: digest,
      mode,
      targetId: target.targetId,
      candidateManifestSha256: candidate.manifestSha256,
      attemptId,
      observedAt: "2026-08-03T00:06:00.000Z",
      origin: "https://demo.example.com/",
      syntheticStorySha256: "b".repeat(64),
      resourceIdsSha256: "c".repeat(64),
      assertionSetSha256: "d".repeat(64),
      status: "PASS",
    });
    const initial = smokeRef("EXTERNAL_INITIAL", "e".repeat(64));
    const postBackup: JsonRecord = {
      backupId: "backup_post_active",
      backupManifestSha256: "f".repeat(64),
      ciphertextSha256: "1".repeat(64),
      purpose: "POST_DEPLOY_RECOVERABILITY",
      targetId: target.targetId,
      databaseInstanceSha256: database.databaseInstanceSha256,
      attemptId,
      candidateManifestSha256: candidate.manifestSha256,
    };
    const unchanged = "2".repeat(64);
    const restore: JsonRecord = {
      restoreId: "restore_active",
      restoreEvidenceSha256: "3".repeat(64),
      attemptId,
      targetId: target.targetId,
      candidateManifestSha256: candidate.manifestSha256,
      backupId: postBackup.backupId,
      backupManifestSha256: postBackup.backupManifestSha256,
      ciphertextSha256: postBackup.ciphertextSha256,
      sourceDatabaseInstanceSha256: database.databaseInstanceSha256,
      productionUnchangedSha256: unchanged,
      syntheticStorySha256: initial.syntheticStorySha256,
      resourceIdsSha256: initial.resourceIdsSha256,
      assertionSetSha256: initial.assertionSetSha256,
      status: "PASS",
    };
    const post = smokeRef("EXTERNAL_POST_RESTORE", "4".repeat(64));
    const rollbackEvidence = {
      status: "NOT_APPLICABLE",
      reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
      previousRelease: null,
      readinessSha256: null,
      smokeSha256: null,
      startedAt: "2026-08-03T00:20:00.000Z",
      finishedAt: "2026-08-03T00:20:01.000Z",
    };
    return {
      envelope,
      attempt: createAttemptRecord({
        attemptId,
        envelopeId: String(envelope.envelopeId),
        envelopeSha256: String(envelope.envelopeSha256),
        candidate,
        target,
        previousRelease,
        startedAt: "2026-08-03T00:01:00.000Z",
      }),
      records: {
        database,
        safety,
        migration,
        initial,
        postBackup,
        restore,
        unchanged,
        post,
        rollbackEvidence,
      },
    };
  };

  const oracles = (
    records: ReturnType<typeof fixture>["records"],
    calls: string[],
    failAt = -1,
  ): DeploymentOracles => {
    const invoke = async <T>(
      name: string,
      index: number,
      value: T,
    ): Promise<T> => {
      calls.push(name);
      if (index === failAt) throw new Error(`FAULT_AT:${name}`);
      return value;
    };
    return {
      preflight: () =>
        invoke("preflight", 0, {
          reasonCode: "ACTIVE_PREFLIGHT",
          evidenceSha256: "5".repeat(64),
          projection: { sourceDatabase: records.database },
        }),
      safetyBackup: () =>
        invoke("safetyBackup", 1, {
          reasonCode: "ACTIVE_SAFETY",
          evidenceSha256:
            records.safety.kind === "FRESH_TARGET"
              ? canonicalSha256(records.safety)
              : String(records.safety.backupManifestSha256),
          projection: { safetyBackup: records.safety },
        }),
      migrate: () =>
        invoke("migrate", 2, {
          reasonCode: "ACTIVE_MIGRATE",
          evidenceSha256: canonicalSha256(records.migration),
          projection: { migration: records.migration },
        }),
      appReady: () =>
        invoke("appReady", 3, {
          reasonCode: "ACTIVE_APP_READY",
          evidenceSha256: "6".repeat(64),
        }),
      httpsReady: () =>
        invoke("httpsReady", 4, {
          reasonCode: "ACTIVE_HTTPS_READY",
          evidenceSha256: "7".repeat(64),
        }),
      initialSmoke: () =>
        invoke("initialSmoke", 5, {
          reasonCode: "ACTIVE_INITIAL_SMOKE",
          evidenceSha256: String(records.initial.smokeSha256),
          projection: { initialSmoke: records.initial },
        }),
      postDeployBackup: () =>
        invoke("postDeployBackup", 6, {
          reasonCode: "ACTIVE_POST_BACKUP",
          evidenceSha256: String(records.postBackup.backupManifestSha256),
          projection: { postDeployBackup: records.postBackup },
        }),
      restoreEnvironment: () =>
        invoke("restoreEnvironment", 7, {
          reasonCode: "ACTIVE_RESTORE_ENV",
          evidenceSha256: "8".repeat(64),
        }),
      restore: () =>
        invoke("restore", 8, {
          reasonCode: "ACTIVE_RESTORE",
          evidenceSha256: String(records.restore.restoreEvidenceSha256),
          projection: { restoreEvidence: records.restore },
        }),
      productionUnchanged: () =>
        invoke("productionUnchanged", 9, {
          reasonCode: "ACTIVE_PRODUCTION_UNCHANGED",
          evidenceSha256: records.unchanged,
          projection: { productionUnchangedSha256: records.unchanged },
        }),
      postRestoreSmoke: () =>
        invoke("postRestoreSmoke", 10, {
          reasonCode: "ACTIVE_POST_SMOKE",
          evidenceSha256: String(records.post.smokeSha256),
          projection: { postRestoreSmoke: records.post },
        }),
      rollback: async () => {
        calls.push("rollback");
        return {
          reasonCode: String(records.rollbackEvidence.reasonCode),
          evidenceSha256: canonicalSha256(records.rollbackEvidence),
          projection: { rollback: records.rollbackEvidence },
        };
      },
    };
  };

  it.each([false, true])(
    "executes every live phase before DEPLOYED (upgrade=%s)",
    async (upgrade) => {
      const current = fixture(upgrade);
      const calls: string[] = [];
      let revalidations = 0;
      const result = await runDeployment({
        envelope: current.envelope,
        attempt: current.attempt,
        oracles: oracles(current.records, calls),
        now: () => new Date("2026-08-03T00:10:00.000Z"),
        revalidate: async () => {
          revalidations += 1;
        },
      });
      expect(result.currentState).toBe("DEPLOYED");
      expect(calls).toEqual([
        "preflight",
        "safetyBackup",
        "migrate",
        "appReady",
        "httpsReady",
        "initialSmoke",
        "postDeployBackup",
        "restoreEnvironment",
        "restore",
        "productionUnchanged",
        "postRestoreSmoke",
      ]);
      expect(revalidations).toBeGreaterThanOrEqual(12);
    },
  );

  it("stops at every failed phase and never executes a later phase", async () => {
    for (let failAt = 0; failAt < 11; failAt += 1) {
      const current = fixture(false);
      const calls: string[] = [];
      const result = await runDeployment({
        envelope: current.envelope,
        attempt: current.attempt,
        oracles: oracles(current.records, calls, failAt),
        now: () => new Date("2026-08-03T00:20:00.000Z"),
      });
      expect(result.currentState).toBe("ROLLED_BACK");
      expect(calls).toHaveLength(failAt + 2);
      expect(calls.at(-1)).toBe("rollback");
    }
  });

  it("terminally journals and rolls back every post-phase authority failure", async () => {
    for (let phaseIndex = 0; phaseIndex < 11; phaseIndex += 1) {
      const current = fixture(false);
      const calls: string[] = [];
      const persisted: JsonRecord[] = [];
      let revalidations = 0;
      const result = await runDeployment({
        envelope: current.envelope,
        attempt: current.attempt,
        oracles: oracles(current.records, calls),
        now: () => new Date("2026-08-03T00:20:00.000Z"),
        revalidate: async () => {
          revalidations += 1;
          if (revalidations === (phaseIndex + 1) * 2)
            throw new Error(`AUTHORITY_EXPIRED_AFTER_PHASE:${phaseIndex}`);
        },
        persist: async (_previous, next) => {
          persisted.push(next);
        },
      });
      expect(result.currentState).toBe("ROLLED_BACK");
      expect(calls.slice(0, -1)).toHaveLength(phaseIndex + 1);
      expect(calls.at(-1)).toBe("rollback");
      expect(calls.filter((value) => value === "rollback")).toHaveLength(1);
      expect(persisted.slice(-3).map((entry) => entry.currentState)).toEqual([
        "FAILED",
        "ROLLING_BACK",
        "ROLLED_BACK",
      ]);
      expect(revalidations).toBe((phaseIndex + 1) * 2);
    }
  });

  it("aborts a hung phase at the attempt deadline and follows the same recovery path", async () => {
    const current = fixture(false);
    const calls: string[] = [];
    const persisted: JsonRecord[] = [];
    let aborted = false;
    const active = oracles(current.records, calls);
    active.preflight = async (_attempt, context) =>
      new Promise((_resolve, reject) => {
        if (context === undefined) return reject(new Error("MISSING_CONTEXT"));
        context.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("ACTIVE_CHILD_ABORTED"));
          },
          { once: true },
        );
      });
    const result = await runDeployment({
      envelope: current.envelope,
      attempt: current.attempt,
      oracles: active,
      now: () => new Date("2026-08-03T00:01:00.000Z"),
      maximumDurationMs: 5,
      persist: async (_previous, next) => {
        persisted.push(next);
      },
    });
    expect(aborted).toBe(true);
    expect(result.currentState).toBe("ROLLED_BACK");
    expect(calls).toEqual(["rollback"]);
    expect(persisted.map((entry) => entry.currentState)).toEqual([
      "FAILED",
      "ROLLING_BACK",
      "ROLLED_BACK",
    ]);
  });
});
