import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { createAttemptRecord } from "./attempt-record.js";
import { runDeployment, type DeploymentOracles } from "./controller.js";
import { evaluateOperations } from "./ops-status.js";
import { readValidatedRuntimeSecrets } from "./preflight.js";
import { parseSemver, inspectToolchain } from "./toolchain.js";
import { verifyPublishedPorts } from "../smoke/network.js";
import { canonicalSha256, sha256 } from "../shared/canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
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
