import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";
import { createActiveDeploymentOracles } from "./active-oracles.js";
import {
  beginResourceLifecycle,
  cleanupOwnedProject,
  executeRollbackWithCleanup,
  markResourceLifecycleReady,
  resolveRollbackCleanupReference,
  verifyCleanupResult,
  verifyDockerResourceIdentity,
  verifyHistoricalRestoreLifecycleV1,
  verifyRollbackCleanupEvidence,
  verifyTerminalRollbackEvidence,
  type CleanupDockerRunner,
} from "./rollback-cleanup.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

const candidate = {
  manifestSha256: "1".repeat(64),
  releaseId: "lp05-hotfix-test",
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

const attempt = (previousRelease: JsonRecord | null = null): JsonRecord => ({
  attemptId: "deploy_hotfix_cleanup",
  envelopeId: `auth_${"e".repeat(32)}`,
  candidate,
  target: {
    targetId: `target_${canonicalSha256(targetSeed).slice(0, 32)}`,
    ...targetSeed,
    expectedIps: ["8.8.8.8"],
    platform: "linux/amd64",
    os: { id: "ubuntu", versionId: "24.04" },
    composeProject: "idea-validation-prod",
  },
  previousRelease,
});

const authorityLabels = (
  value: JsonRecord,
  project: string,
  environment: "production" | "isolated-restore",
  role: string,
): Record<string, string> => ({
  "com.docker.compose.project": project,
  "io.idea-validation.environment": environment,
  "io.idea-validation.role": role,
  "io.idea-validation.attempt-id": String(value.attemptId),
  "io.idea-validation.target-id": String((value.target as JsonRecord).targetId),
  "io.idea-validation.candidate-manifest-sha256": String(
    (value.candidate as JsonRecord).manifestSha256,
  ),
});

type Resource = JsonRecord;

class FakeDocker {
  readonly calls: string[][] = [];
  readonly containers = new Map<string, Resource>();
  readonly networks = new Map<string, Resource>();
  readonly volumes = new Map<string, Resource>();
  onContainerRemoved?: () => void;

  addProject(
    value: JsonRecord,
    project: string,
    environment: "production" | "isolated-restore",
    seed: string,
  ): void {
    const containerId = seed.repeat(64).slice(0, 64);
    const networkId = (seed === "a" ? "b" : "d").repeat(64);
    const volumeName = `${project}-postgres-data`;
    this.containers.set(containerId, {
      Id: containerId,
      Name: `/${project}-postgres-1`,
      Created: "2026-08-04T00:00:00.000Z",
      Image: `sha256:${"9".repeat(64)}`,
      Config: {
        Labels: {
          ...authorityLabels(value, project, environment, "database"),
          "com.docker.compose.service": "postgres",
        },
      },
    });
    this.networks.set(networkId, {
      Id: networkId,
      Name: `${project}_backend`,
      Created: "2026-08-04T00:00:00.000Z",
      Driver: "bridge",
      Scope: "local",
      Labels: authorityLabels(value, project, environment, "network-backend"),
    });
    this.volumes.set(volumeName, {
      Name: volumeName,
      CreatedAt: "2026-08-04T00:00:00.000Z",
      Driver: "local",
      Scope: "local",
      Mountpoint: `/var/lib/docker/volumes/${volumeName}/_data`,
      Labels: authorityLabels(value, project, environment, "database"),
    });
  }

  projectOf(resource: Resource): string {
    const labels =
      resource.Config === undefined
        ? (resource.Labels as JsonRecord)
        : ((resource.Config as JsonRecord).Labels as JsonRecord);
    return String(labels["com.docker.compose.project"]);
  }

  run: CleanupDockerRunner = async (args) => {
    this.calls.push([...args]);
    const projectFilter = args.find((value) =>
      value.startsWith("label=com.docker.compose.project="),
    );
    const project = projectFilter?.split("=").at(-1);
    if (args[0] === "ps")
      return [...this.containers.entries()]
        .filter(([, resource]) => this.projectOf(resource) === project)
        .map(([id]) => id)
        .join("\n");
    if (args[0] === "network" && args[1] === "ls")
      return [...this.networks.entries()]
        .filter(([, resource]) => this.projectOf(resource) === project)
        .map(([id]) => id)
        .join("\n");
    if (args[0] === "volume" && args[1] === "ls")
      return [...this.volumes.entries()]
        .filter(([, resource]) => this.projectOf(resource) === project)
        .map(([name]) => name)
        .join("\n");
    if (args[0] === "inspect") {
      const resource = this.containers.get(String(args[1]));
      if (resource === undefined) throw new Error("FAKE_CONTAINER_MISSING");
      return JSON.stringify([resource]);
    }
    if (args[0] === "network" && args[1] === "inspect") {
      const resource = this.networks.get(String(args[2]));
      if (resource === undefined) throw new Error("FAKE_NETWORK_MISSING");
      return JSON.stringify([resource]);
    }
    if (args[0] === "volume" && args[1] === "inspect") {
      const resource = this.volumes.get(String(args[2]));
      if (resource === undefined) throw new Error("FAKE_VOLUME_MISSING");
      return JSON.stringify([resource]);
    }
    if (args[0] === "exec") return "[]";
    if (args[0] === "rm") {
      this.containers.delete(String(args.at(-1)));
      this.onContainerRemoved?.();
      return "";
    }
    if (args[0] === "volume" && args[1] === "rm") {
      this.volumes.delete(String(args[2]));
      return "";
    }
    if (args[0] === "network" && args[1] === "rm") {
      this.networks.delete(String(args[2]));
      return "";
    }
    throw new Error(`UNEXPECTED_DOCKER:${args.join(" ")}`);
  };
}

const clock = (): (() => Date) => {
  let milliseconds = Date.parse("2026-08-04T00:00:00.000Z");
  return () => new Date((milliseconds += 1_000));
};

const evidenceRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "lp05-hotfix-cleanup-"));
  roots.push(root);
  return join(root, "evidence");
};

const beginReady = async (input: {
  root: string;
  scope: "PRODUCTION" | "RESTORE";
  value: JsonRecord;
  project: string;
  docker: FakeDocker;
  now: () => Date;
}): Promise<void> => {
  await beginResourceLifecycle({
    evidenceRoot: input.root,
    scope: input.scope,
    attempt: input.value,
    composeProject: input.project,
    databaseName:
      input.scope === "PRODUCTION"
        ? "idea_validation"
        : "idea_validation_restore",
    runDocker: input.docker.run,
    environment: {},
    now: input.now,
  });
  input.docker.addProject(
    input.value,
    input.project,
    input.scope === "PRODUCTION" ? "production" : "isolated-restore",
    input.scope === "PRODUCTION" ? "a" : "c",
  );
  await markResourceLifecycleReady({
    evidenceRoot: input.root,
    scope: input.scope,
    attempt: input.value,
    composeProject: input.project,
    databaseName:
      input.scope === "PRODUCTION"
        ? "idea_validation"
        : "idea_validation_restore",
    isolatedTarget:
      input.scope === "RESTORE"
        ? {
            kind: "ISOLATED",
            composeProject: input.project,
            containerId: "c".repeat(64),
            volumeName: `${input.project}-postgres-data`,
            systemIdentifier: "200",
            volumeLabelSha256: "4".repeat(64),
            containerLabelSha256: "5".repeat(64),
            origin: "http://127.0.0.1:18081/",
            databaseHost: "127.0.0.1",
            databasePort: 5432,
            databaseName: "idea_validation_restore",
          }
        : undefined,
    runDocker: input.docker.run,
    environment: {},
    now: input.now,
  });
};

describe("LP-05 attempt-owned cleanup", () => {
  it("verifies historical RestoreLifecycleV1 bytes but never upgrades their cleanup authority", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const project = "lp05-restore-hotfix";
    const lifecycle: JsonRecord = {
      schemaVersion: "1.0",
      attemptId: value.attemptId,
      envelopeId: value.envelopeId,
      targetId: (value.target as JsonRecord).targetId,
      candidateManifestSha256: (value.candidate as JsonRecord).manifestSha256,
      composeProject: project,
      databaseName: "idea_validation_restore",
      state: "CREATING",
      isolatedTarget: null,
      cleanup: null,
      updatedAt: "2026-08-04T00:00:01.000Z",
      lifecycleSha256: "",
    };
    lifecycle.lifecycleSha256 = canonicalSha256(lifecycle, ["lifecycleSha256"]);
    expect(
      verifyHistoricalRestoreLifecycleV1({
        value: lifecycle,
        attempt: value,
        composeProject: project,
        databaseName: "idea_validation_restore",
      }),
    ).toEqual(lifecycle);
    const attemptDirectory = join(root, String(value.attemptId));
    await mkdir(attemptDirectory, { recursive: true });
    await writeFile(
      join(attemptDirectory, "restore-lifecycle.json"),
      canonicalJson(lifecycle),
      { mode: 0o600 },
    );
    const docker = new FakeDocker();
    await expect(
      beginResourceLifecycle({
        evidenceRoot: root,
        scope: "RESTORE",
        attempt: value,
        composeProject: project,
        databaseName: "idea_validation_restore",
        runDocker: docker.run,
        environment: {},
        now: clock(),
      }),
    ).rejects.toThrow("RESTORE_LIFECYCLE_V1_READ_ONLY");
    expect(docker.calls).toEqual([]);
  });

  it("removes only frozen IDs and proves a fresh production cleanup", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "PRODUCTION",
      value,
      project: "idea-validation-prod",
      docker,
      now,
    });
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "PRODUCTION",
      attempt: value,
      composeProject: "idea-validation-prod",
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(result.status).toBe("PASS");
    expect(result.applicationTableCount).toBe(0);
    expect(docker.containers.size).toBe(0);
    expect(docker.networks.size).toBe(0);
    expect(docker.volumes.size).toBe(0);
    expect(docker.calls.some((args) => args.includes("compose"))).toBe(false);
    expect(docker.calls).toContainEqual(["rm", "--force", "a".repeat(64)]);
    expect(docker.calls).toContainEqual(["network", "rm", "b".repeat(64)]);
  });

  it.each([
    ["attempt", "io.idea-validation.attempt-id", "deploy_other_attempt"],
    ["target", "io.idea-validation.target-id", "target_other"],
    [
      "candidate",
      "io.idea-validation.candidate-manifest-sha256",
      "0".repeat(64),
    ],
    ["environment", "io.idea-validation.environment", "development"],
    ["role", "io.idea-validation.role", ""],
  ])(
    "fails closed before deleting a resource with %s authority drift",
    async (_case, key, replacement) => {
      const root = await evidenceRoot();
      const value = attempt();
      const docker = new FakeDocker();
      const now = clock();
      await beginReady({
        root,
        scope: "PRODUCTION",
        value,
        project: "idea-validation-prod",
        docker,
        now,
      });
      const resource = [...docker.containers.values()][0] as JsonRecord;
      const labels = (resource.Config as JsonRecord).Labels as JsonRecord;
      labels[key] = replacement;
      const result = await cleanupOwnedProject({
        evidenceRoot: root,
        scope: "PRODUCTION",
        attempt: value,
        composeProject: "idea-validation-prod",
        databaseUser: "idea_validation",
        databaseName: "idea_validation",
        runDocker: docker.run,
        environment: {},
        now,
        sleep: async () => undefined,
      });
      expect(result.status).toBe("FAIL");
      expect(docker.containers.size).toBe(1);
      expect(
        docker.calls.some((args) => args[0] === "rm" || args[1] === "rm"),
      ).toBe(false);
    },
  );

  it("blocks production deletion when any application table contains rows", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "PRODUCTION",
      value,
      project: "idea-validation-prod",
      docker,
      now,
    });
    const runDocker: CleanupDockerRunner = async (args, environment) => {
      if (args[0] === "exec") {
        const command = String(args.at(-1));
        if (command.includes("json_agg")) return '["public.ideas"]';
        if (command.includes("SELECT count(*)")) return "1";
      }
      return docker.run(args, environment);
    };
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "PRODUCTION",
      attempt: value,
      composeProject: "idea-validation-prod",
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runDocker,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(result.status).toBe("FAIL");
    expect(result.applicationTableCount).toBe(1);
    expect(docker.containers.size).toBe(1);
    expect(
      docker.calls.some((args) => args[0] === "rm" || args[1] === "rm"),
    ).toBe(false);
  });

  it("preserves an upgrade resource set and emits no delete arguments", async () => {
    const root = await evidenceRoot();
    const value = attempt({ releaseId: "previous" });
    const docker = new FakeDocker();
    docker.addProject(value, "idea-validation-prod", "production", "a");
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "PRODUCTION",
      attempt: value,
      composeProject: "idea-validation-prod",
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runDocker: docker.run,
      environment: {},
      now: clock(),
    });
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.reasonCode).toBe("UPGRADE_PRODUCTION_PRESERVED");
    expect((result.observedBefore as JsonRecord).resourceSetSha256).toBe(
      (result.observedAfter as JsonRecord).resourceSetSha256,
    );
    expect((result.observedBefore as JsonRecord).counts).toEqual({
      containers: 1,
      networks: 1,
      volumes: 1,
    });
    expect(
      docker.calls.some((args) => args[0] === "rm" || args[1] === "rm"),
    ).toBe(false);
  });

  it("never deletes a late same-project resource and fails closed", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "RESTORE",
      value,
      project: "lp05-restore-hotfix",
      docker,
      now,
    });
    const lateId = "f".repeat(64);
    docker.onContainerRemoved = () => {
      docker.onContainerRemoved = undefined;
      docker.containers.set(lateId, {
        Id: lateId,
        Name: "/lp05-restore-hotfix-late-1",
        Created: "2026-08-04T00:00:05.000Z",
        Image: `sha256:${"8".repeat(64)}`,
        Config: {
          Labels: {
            ...authorityLabels(
              value,
              "lp05-restore-hotfix",
              "isolated-restore",
              "application",
            ),
            "com.docker.compose.service": "app",
          },
        },
      });
    };
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "RESTORE",
      attempt: value,
      composeProject: "lp05-restore-hotfix",
      databaseName: "idea_validation_restore",
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(result.status).toBe("FAIL");
    expect(docker.containers.has(lateId)).toBe(true);
    expect(docker.calls).not.toContainEqual(["rm", "--force", lateId]);
  });

  it("rejects a same-name volume replacement before deleting it", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "RESTORE",
      value,
      project: "lp05-restore-hotfix",
      docker,
      now,
    });
    const volumeName = "lp05-restore-hotfix-postgres-data";
    docker.onContainerRemoved = () => {
      docker.onContainerRemoved = undefined;
      const replacement = structuredClone(
        docker.volumes.get(volumeName),
      ) as JsonRecord;
      replacement.Mountpoint = "/var/lib/docker/volumes/replacement/_data";
      docker.volumes.set(volumeName, replacement);
    };
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "RESTORE",
      attempt: value,
      composeProject: "lp05-restore-hotfix",
      databaseName: "idea_validation_restore",
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(result.status).toBe("FAIL");
    expect(docker.volumes.has(volumeName)).toBe(true);
    expect(docker.calls).not.toContainEqual(["volume", "rm", volumeName]);
  });
});

describe("LP-05 rollback evidence separation", () => {
  it("materializes one application failure and binds the same digest throughout", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "PRODUCTION",
      value,
      project: "idea-validation-prod",
      docker,
      now,
    });
    const output = await executeRollbackWithCleanup({
      evidenceRoot: root,
      attempt: value,
      productionProject: "idea-validation-prod",
      restoreProject: "lp05-restore-hotfix",
      restoreDatabaseName: "idea_validation_restore",
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runApplicationRollback: async () => {
        throw new Error("INGRESS_DISABLE_FAILED");
      },
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(output.applicationRollback.status).toBe("FAIL");
    expect(output.terminalEvidence.terminalState).toBe("ROLLBACK_FAILED");
    expect(output.terminalEvidence.applicationRollbackSha256).toBe(
      canonicalSha256(output.applicationRollback),
    );
    const aggregate = verifyRollbackCleanupEvidence(
      JSON.parse(
        await readFile(
          join(root, String(value.attemptId), "rollback-cleanup.json"),
          "utf8",
        ),
      ),
    );
    expect(aggregate.applicationRollbackSha256).toBe(
      output.terminalEvidence.applicationRollbackSha256,
    );
    verifyTerminalRollbackEvidence(output.terminalEvidence);
  });

  it("produces ROLLED_BACK for a fresh empty install and keeps rollback closed", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "PRODUCTION",
      value,
      project: "idea-validation-prod",
      docker,
      now,
    });
    const output = await executeRollbackWithCleanup({
      evidenceRoot: root,
      attempt: value,
      productionProject: "idea-validation-prod",
      restoreProject: "lp05-restore-hotfix",
      restoreDatabaseName: "idea_validation_restore",
      databaseUser: "idea_validation",
      databaseName: "idea_validation",
      runApplicationRollback: async () => ({
        status: "NOT_APPLICABLE",
        reasonCode: "NO_PREVIOUS_RELEASE",
        previousRelease: null,
        readinessSha256: null,
        smokeSha256: null,
        startedAt: now().toISOString(),
        finishedAt: now().toISOString(),
      }),
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    expect(output.applicationRollback).not.toHaveProperty("restoreCleanup");
    expect(output.cleanupReference.status).toBe("PASS");
    expect(output.terminalEvidence.terminalState).toBe("ROLLED_BACK");
    const active = createActiveDeploymentOracles({
      evidenceRoot: root,
      operations: {
        execute: async () => ({}),
        reconcile: async (_phase, _attempt, persisted) => persisted,
        rollback: async () => output,
      },
    });
    const oracle = await active.rollback(value, {
      signal: new AbortController().signal,
      deadlineAt: now().toISOString(),
    });
    expect(oracle.projection).toEqual({
      rollback: output.applicationRollback,
    });
    expect(oracle.evidenceSha256).toBe(output.terminalEvidence.evidenceSha256);

    await expect(
      resolveRollbackCleanupReference({
        evidenceRoot: root,
        attempt: value,
        reference: {
          ...output.cleanupReference,
          cleanupSha256: "0".repeat(64),
        },
      }),
    ).rejects.toThrow("CLEANUP_REFERENCE_MISMATCH");
    await expect(
      resolveRollbackCleanupReference({
        evidenceRoot: root,
        attempt: value,
        reference: {
          ...output.cleanupReference,
          relativePath: "../rollback-cleanup.json",
        },
      }),
    ).rejects.toThrow("CLEANUP_REFERENCE_VALUE");

    const forgedTerminal = {
      ...output.terminalEvidence,
      targetId: "target_other",
      evidenceSha256: "",
    };
    forgedTerminal.evidenceSha256 = canonicalSha256(forgedTerminal, [
      "evidenceSha256",
    ]);
    await expect(
      createActiveDeploymentOracles({
        evidenceRoot: root,
        operations: {
          execute: async () => ({}),
          reconcile: async (_phase, _attempt, persisted) => persisted,
          rollback: async () => ({
            ...output,
            terminalEvidence: forgedTerminal,
          }),
        },
      }).rollback(value, {
        signal: new AbortController().signal,
        deadlineAt: now().toISOString(),
      }),
    ).rejects.toThrow("ACTIVE_ROLLBACK_AUTHORITY_MISMATCH");

    await expect(
      createActiveDeploymentOracles({
        evidenceRoot: root,
        operations: {
          execute: async () => ({}),
          reconcile: async (_phase, _attempt, persisted) => persisted,
          rollback: async () => ({
            ...output,
            applicationRollback: {
              ...output.applicationRollback,
              restoreCleanup: output.cleanupReference,
            },
          }),
        },
      }).rollback(value, {
        signal: new AbortController().signal,
        deadlineAt: now().toISOString(),
      }),
    ).rejects.toThrow("APPLICATION_ROLLBACK");
  });

  it("rejects extra identity fields and a changed digest", async () => {
    const root = await evidenceRoot();
    const value = attempt();
    const docker = new FakeDocker();
    const now = clock();
    await beginReady({
      root,
      scope: "RESTORE",
      value,
      project: "lp05-restore-hotfix",
      docker,
      now,
    });
    const result = await cleanupOwnedProject({
      evidenceRoot: root,
      scope: "RESTORE",
      attempt: value,
      composeProject: "lp05-restore-hotfix",
      databaseName: "idea_validation_restore",
      runDocker: docker.run,
      environment: {},
      now,
      sleep: async () => undefined,
    });
    const identity = structuredClone(
      ((result.observedBefore as JsonRecord).containers as JsonRecord[])[0],
    ) as JsonRecord;
    expect(() =>
      verifyDockerResourceIdentity({ ...identity, extra: true }),
    ).toThrow("DOCKER_RESOURCE_IDENTITY");
    identity.identitySha256 = "0".repeat(64);
    expect(() => verifyDockerResourceIdentity(identity)).toThrow(
      "DOCKER_RESOURCE_IDENTITY_DIGEST",
    );
    expect(() =>
      verifyCleanupResult({
        ...result,
        observedAfter: {
          ...(result.observedAfter as JsonRecord),
          resourceSetSha256: "0".repeat(64),
        },
      }),
    ).toThrow("DOCKER_RESOURCE_SET_DIGEST");
  });
});
