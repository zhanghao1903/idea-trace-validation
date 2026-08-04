import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finalizeAuthorizationEnvelope } from "./authorization-envelope.js";
import {
  createAttemptRecord,
  finalizeAttemptRecord,
  writeAttemptRecord,
} from "./attempt-record.js";
import { transitionAttempt } from "./attempt-state.js";
import { executeManualRollback } from "./manual-rollback.js";
import { executeRollbackWithCleanup } from "./rollback-cleanup.js";
import { createAttemptRuntimeBinding } from "./runtime-binding.js";
import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite } from "../shared/filesystem.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

const fixture = async (
  currentState: "FAILED" | "ROLLING_BACK" = "ROLLING_BACK",
) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "lp05-manual-rollback-"));
  roots.push(stateRoot);
  const evidenceRoot = join(stateRoot, "evidence");
  const targetSeed = {
    hostFingerprintSha256: "2".repeat(64),
    domain: "rollback.example.com",
    deployRoot: "/srv/idea-validation",
  };
  const candidate = {
    manifestSha256: "1".repeat(64),
    releaseId: "lp05-aaaaaaaaaaaa-amd64",
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    imageId: `sha256:${"c".repeat(64)}`,
    archiveSha256: "d".repeat(64),
    platform: "linux/amd64",
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
        observedAt: "2026-08-04T00:00:00.000Z",
      },
      proposedAt: "2026-08-04T00:00:00.000Z",
    },
    authorization: {
      authorizedBy: "Manual rollback fixture",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
      authorizedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-05T00:00:00.000Z",
      authorizationEvidenceSha256: sha256("manual rollback authority"),
    },
    createdAt: "2026-08-04T00:00:00.000Z",
  });
  const prepared = createAttemptRecord({
    attemptId: "deploy_manual_rollback",
    envelopeId: String(envelope.envelopeId),
    envelopeSha256: String(envelope.envelopeSha256),
    candidate,
    target,
    previousRelease: null,
    startedAt: "2026-08-04T00:00:00.000Z",
  });
  const failed = finalizeAttemptRecord(
    transitionAttempt(prepared, {
      to: "FAILED",
      occurredAt: "2026-08-04T00:01:00.000Z",
      reasonCode: "FIXTURE_FORWARD_FAILED",
      evidenceSha256: sha256("fixture forward failed"),
    }),
  );
  const rollingBack = finalizeAttemptRecord(
    transitionAttempt(failed, {
      to: "ROLLING_BACK",
      occurredAt: "2026-08-04T00:02:00.000Z",
      reasonCode: "INGRESS_DISABLE_AND_ROLLBACK_STARTED",
      evidenceSha256: sha256("INGRESS_DISABLE_AND_ROLLBACK_STARTED"),
      projection: { rollback: failed.rollback },
    }),
  );
  const currentAttempt = currentState === "FAILED" ? failed : rollingBack;
  const runtime = {
    schemaVersion: "1.0" as const,
    evidenceRoot,
    candidateManifestPath: join(stateRoot, "candidate.json"),
    preMigrationBackupId: "backup_manual_pre",
    postDeployBackupId: "backup_manual_post",
    initialSmoke: {
      smokeId: "smoke_manual_initial",
      proofRoot: join(stateRoot, "proofs"),
      runId: "manual-initial",
    },
    postRestoreSmoke: {
      smokeId: "smoke_manual_post",
      proofRoot: join(stateRoot, "proofs"),
      runId: "manual-post",
    },
    restore: {
      composeProject: "lp05-restore-manual",
      databaseName: "idea_validation_restore",
      appPort: 18081,
      restoreId: "restore_manual",
      proofRoot: join(stateRoot, "restore-proofs"),
      runId: "manual-restore",
    },
  };
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    DEPLOY_DOMAIN: "rollback.example.com",
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
    COMPOSE_PROJECT_NAME: "idea-validation-prod",
  };
  const attempts = join(stateRoot, "attempts");
  await mkdir(attempts, { recursive: true });
  const attemptPath = join(
    attempts,
    `${String(currentAttempt.attemptId)}.json`,
  );
  await writeAttemptRecord(attemptPath, null, currentAttempt);
  const binding = createAttemptRuntimeBinding({
    attemptId: String(currentAttempt.attemptId),
    runtime,
    productionDatabase: {
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
    },
    previousEnvironment: null,
  });
  await atomicWrite(
    join(attempts, `${String(currentAttempt.attemptId)}.runtime.json`),
    canonicalJson(binding),
    0o600,
  );
  return {
    stateRoot,
    evidenceRoot,
    attemptPath,
    attempt: currentAttempt,
    runtime,
    environment,
    envelope,
    request: {
      schemaVersion: "1.0",
      stateRoot,
      envelope,
      attemptPath,
      previousEnvironment: null,
    },
  };
};

const exactOwnedContainer = (input: {
  attempt: JsonRecord;
  project: string;
  environment: "production" | "isolated-restore";
  containerId: string;
}): JsonRecord => {
  const target = input.attempt.target as JsonRecord;
  const candidate = input.attempt.candidate as JsonRecord;
  return {
    Id: input.containerId,
    Name: `/${input.project}-postgres-1`,
    Created: "2026-08-04T00:00:00.000Z",
    Image: `sha256:${"9".repeat(64)}`,
    Config: {
      Labels: {
        "com.docker.compose.project": input.project,
        "com.docker.compose.service": "postgres",
        "io.idea-validation.environment": input.environment,
        "io.idea-validation.role": "database",
        "io.idea-validation.attempt-id": input.attempt.attemptId,
        "io.idea-validation.target-id": target.targetId,
        "io.idea-validation.candidate-manifest-sha256":
          candidate.manifestSha256,
      },
    },
  };
};

const terminalReappearanceRunner = (input: {
  attempt: JsonRecord;
  project: string;
  environment: "production" | "isolated-restore";
}): {
  calls: string[][];
  run: (args: readonly string[]) => Promise<string>;
} => {
  const calls: string[][] = [];
  const containerId = "f".repeat(64);
  const container = exactOwnedContainer({ ...input, containerId });
  return {
    calls,
    run: async (args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      const projectFilter = args.find((value) =>
        value.startsWith("label=com.docker.compose.project="),
      );
      const listedProject = projectFilter?.split("=").at(-1);
      if (args[0] === "ps")
        return listedProject === input.project ? containerId : "";
      if (
        (args[0] === "network" && args[1] === "ls") ||
        (args[0] === "volume" && args[1] === "ls")
      )
        return "";
      if (args[0] === "inspect" && args[1] === containerId)
        return JSON.stringify([container]);
      throw new Error(`UNEXPECTED_TERMINAL_DOCKER:${args.join(" ")}`);
    },
  };
};

describe("LP-05 manual rollback authority", () => {
  it("rejects database-principal drift before Docker or terminal mutation", async () => {
    const value = await fixture();
    let dockerCalls = 0;
    await expect(
      executeManualRollback(value.request, {
        environment: { ...value.environment, POSTGRES_DB: "empty_decoy" },
        runDocker: async () => {
          dockerCalls += 1;
          return "";
        },
        now: () => new Date("2026-08-04T00:03:00.000Z"),
      }),
    ).rejects.toThrow("DEPLOYMENT_RUNTIME_BINDING_CHANGED");
    expect(dockerCalls).toBe(0);
    expect(
      JSON.parse(await readFile(value.attemptPath, "utf8")).currentState,
    ).toBe("ROLLING_BACK");
  });

  it("recovers an aggregate-write crash once and requires shared terminal evidence", async () => {
    const value = await fixture();
    const dockerCalls: readonly string[][] = [];
    const calls = dockerCalls as string[][];
    const runDocker = async (args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      return "";
    };
    let applicationCalls = 0;
    await expect(
      executeRollbackWithCleanup({
        evidenceRoot: value.evidenceRoot,
        attempt: value.attempt,
        productionProject: "idea-validation-prod",
        restoreProject: value.runtime.restore.composeProject,
        restoreDatabaseName: value.runtime.restore.databaseName,
        databaseUser: "idea_validation",
        databaseName: "idea_validation",
        runApplicationRollback: async (): Promise<JsonRecord> => {
          applicationCalls += 1;
          return {
            status: "NOT_APPLICABLE",
            reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
            previousRelease: null,
            readinessSha256: null,
            smokeSha256: null,
            startedAt: "2026-08-04T00:02:01.000Z",
            finishedAt: "2026-08-04T00:02:02.000Z",
          };
        },
        runDocker,
        environment: value.environment,
        now: () => new Date("2026-08-04T00:02:03.000Z"),
        afterCleanupEvidencePersisted: async () => {
          throw new Error("FIXTURE_AGGREGATE_WRITE_CRASH");
        },
      }),
    ).rejects.toThrow("FIXTURE_AGGREGATE_WRITE_CRASH");
    const isDeletion = (args: readonly string[]): boolean =>
      args[0] === "rm" ||
      (args[0] === "network" && args[1] === "rm") ||
      (args[0] === "volume" && args[1] === "rm");
    const deletionCallsBeforeRecovery = calls.filter(isDeletion).length;

    const recovered = await executeManualRollback(value.request, {
      environment: value.environment,
      runDocker,
      now: () => new Date("2026-08-04T00:03:00.000Z"),
    });
    expect(recovered.currentState).toBe("ROLLED_BACK");
    expect(applicationCalls).toBe(1);
    expect(calls.filter(isDeletion).length).toBe(deletionCallsBeforeRecovery);
    const terminal = JSON.parse(
      await readFile(
        join(
          value.evidenceRoot,
          String(value.attempt.attemptId),
          "terminal-rollback-evidence.json",
        ),
        "utf8",
      ),
    );
    expect(terminal.terminalState).toBe("ROLLED_BACK");

    const dockerCallsBeforeReplay = calls.length;
    const replay = await executeManualRollback(value.request, {
      environment: value.environment,
      runDocker,
      now: () => new Date("2026-08-06T00:04:00.000Z"),
    });
    expect(replay.attemptRecordSha256).toBe(recovered.attemptRecordSha256);
    expect(applicationCalls).toBe(1);
    expect(calls.length).toBeGreaterThan(dockerCallsBeforeReplay);
    expect(calls.filter(isDeletion).length).toBe(deletionCallsBeforeRecovery);
  });

  it.each(["FAILED", "ROLLING_BACK"] as const)(
    "recovers persisted %s authority after the forward envelope expires",
    async (currentState) => {
      const value = await fixture(currentState);
      const calls: string[][] = [];
      const runDocker = async (args: readonly string[]): Promise<string> => {
        calls.push([...args]);
        return "";
      };
      let applicationCalls = 0;
      await expect(
        executeRollbackWithCleanup({
          evidenceRoot: value.evidenceRoot,
          attempt: value.attempt,
          productionProject: "idea-validation-prod",
          restoreProject: value.runtime.restore.composeProject,
          restoreDatabaseName: value.runtime.restore.databaseName,
          databaseUser: "idea_validation",
          databaseName: "idea_validation",
          runApplicationRollback: async (): Promise<JsonRecord> => {
            applicationCalls += 1;
            return {
              status: "NOT_APPLICABLE",
              reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
              previousRelease: null,
              readinessSha256: null,
              smokeSha256: null,
              startedAt: "2026-08-04T00:02:01.000Z",
              finishedAt: "2026-08-04T00:02:02.000Z",
            };
          },
          runDocker,
          environment: value.environment,
          now: () => new Date("2026-08-04T00:02:03.000Z"),
          afterCleanupEvidencePersisted: async () => {
            throw new Error("FIXTURE_AGGREGATE_WRITE_CRASH");
          },
        }),
      ).rejects.toThrow("FIXTURE_AGGREGATE_WRITE_CRASH");

      const recovered = await executeManualRollback(value.request, {
        environment: value.environment,
        runDocker,
        now: () => new Date("2026-08-06T00:03:00.000Z"),
      });
      expect(recovered.currentState).toBe("ROLLED_BACK");
      expect(applicationCalls).toBe(1);
    },
  );

  it("rejects a replacement envelope after expiry before Docker activity", async () => {
    const value = await fixture();
    const authorization = value.envelope.authorization as JsonRecord;
    const replacement = finalizeAuthorizationEnvelope({
      proposal: value.envelope.proposal as JsonRecord,
      authorization: {
        ...authorization,
        authorizationEvidenceSha256: sha256("replacement authority"),
      },
      createdAt: String(value.envelope.createdAt),
    });
    let dockerCalls = 0;
    await expect(
      executeManualRollback(
        { ...value.request, envelope: replacement },
        {
          environment: value.environment,
          runDocker: async () => {
            dockerCalls += 1;
            return "";
          },
          now: () => new Date("2026-08-06T00:03:00.000Z"),
        },
      ),
    ).rejects.toThrow("ROLLBACK_ENVELOPE_MISMATCH");
    expect(dockerCalls).toBe(0);
  });

  it.each(["PRODUCTION", "RESTORE"] as const)(
    "rejects terminal replay when exact-owned %s resources reappear without deleting",
    async (scope) => {
      const value = await fixture();
      const emptyDocker = async (): Promise<string> => "";
      const recovered = await executeManualRollback(value.request, {
        environment: value.environment,
        runDocker: emptyDocker,
        now: () => new Date("2026-08-04T00:03:00.000Z"),
      });
      expect(recovered.currentState).toBe("ROLLED_BACK");
      const project =
        scope === "PRODUCTION"
          ? "idea-validation-prod"
          : value.runtime.restore.composeProject;
      const docker = terminalReappearanceRunner({
        attempt: recovered,
        project,
        environment: scope === "PRODUCTION" ? "production" : "isolated-restore",
      });

      await expect(
        executeManualRollback(value.request, {
          environment: value.environment,
          runDocker: docker.run,
          now: () => new Date("2026-08-06T00:03:00.000Z"),
        }),
      ).rejects.toThrow("ROLLBACK_CLEANUP_RECOVERY_RESOURCE_REAPPEARED");
      expect(
        docker.calls.filter((args) => args[0] === "rm" || args.includes("rm")),
      ).toHaveLength(0);
    },
  );
});
