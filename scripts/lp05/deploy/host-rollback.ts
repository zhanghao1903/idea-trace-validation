import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadDeploymentConfig } from "./config.js";
import { canonicalSha256, sha256 } from "../shared/canonical-json.js";
import { exactKeys, record, type JsonRecord } from "../shared/contracts.js";
import type { RollbackAdapter } from "./rollback.js";
import { attemptAuthorityEnvironment } from "./rollback-cleanup.js";

const execute = promisify(execFile);

export type DockerRunner = (
  args: readonly string[],
  environment?: NodeJS.ProcessEnv,
) => Promise<string>;

const docker: DockerRunner = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv = { PATH: process.env.PATH },
) =>
  (
    await execute("docker", [...args], {
      env: environment,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();

const serviceContainer = async (
  runDocker: DockerRunner,
  project: string,
  service: string,
  required: boolean,
): Promise<string | null> => {
  const output = await runDocker([
    "ps",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
    "--format",
    "{{.ID}}",
  ]);
  const ids = output.split(/\r?\n/u).filter((value) => value !== "");
  if (ids.length > 1 || (required && ids.length !== 1))
    throw new Error(`ROLLBACK_CONTAINER_COUNT:${service}`);
  return ids[0] ?? null;
};

export const createHostRollbackAdapter = (input: {
  attempt: JsonRecord;
  composeProject: string;
  publicOrigin: string;
  previousEnvironment: JsonRecord | null;
  runDocker?: DockerRunner;
  fetchImpl?: typeof fetch;
}): RollbackAdapter => {
  const runDocker = input.runDocker ?? docker;
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    disableIngress: async () => {
      const ids = (
        await Promise.all(
          ["caddy", "app"].map((service) =>
            serviceContainer(runDocker, input.composeProject, service, false),
          ),
        )
      ).filter((value): value is string => value !== null);
      if (ids.length > 0) await runDocker(["stop", "--time", "15", ...ids]);
      for (const service of ["caddy", "app"])
        if (
          (await serviceContainer(
            runDocker,
            input.composeProject,
            service,
            false,
          )) !== null
        )
          throw new Error(`ROLLBACK_INGRESS_STILL_RUNNING:${service}`);
    },
    restorePreviousRelease: async (previous) => {
      const release = record(previous, "ROLLBACK_PREVIOUS_RELEASE");
      if (input.previousEnvironment === null)
        throw new Error("ROLLBACK_PREVIOUS_CONFIG_REQUIRED");
      exactKeys(
        input.previousEnvironment,
        [
          "DEPLOY_DOMAIN",
          "ACME_EMAIL",
          "RELEASE_ID",
          "SOURCE_COMMIT",
          "SOURCE_TREE",
          "APP_IMAGE_ID",
          "APP_IMAGE",
          "APP_PLATFORM",
          "POSTGRES_USER",
          "POSTGRES_DB",
          "DEPLOY_ROOT",
          "BACKUP_ROOT",
          "SECRETS_ROOT",
          "COMPOSE_PROJECT_NAME",
        ],
        "ROLLBACK_PREVIOUS_ENVIRONMENT",
      );
      if (
        Object.values(input.previousEnvironment).some(
          (value) => typeof value !== "string",
        )
      )
        throw new Error("ROLLBACK_PREVIOUS_ENVIRONMENT_VALUE");
      const environment = attemptAuthorityEnvironment(input.attempt, {
        PATH: process.env.PATH,
        ...(input.previousEnvironment as Record<string, string>),
      });
      const config = loadDeploymentConfig(environment);
      if (
        config.composeProject !== input.composeProject ||
        config.domain !== new URL(input.publicOrigin).hostname ||
        config.releaseId !== release.releaseId ||
        config.sourceCommit !== release.sourceCommit ||
        config.appImageId !== release.imageId ||
        canonicalSha256(config as unknown as JsonRecord) !==
          release.configSha256
      )
        throw new Error("ROLLBACK_PREVIOUS_CONFIG_MISMATCH");
      await runDocker(["image", "inspect", String(release.imageId)]);
      await runDocker([
        "tag",
        String(release.imageId),
        `idea-trace-validation:${String(release.releaseId)}`,
      ]);
      await runDocker(
        [
          "compose",
          "-p",
          input.composeProject,
          "-f",
          "deploy/compose.production.yaml",
          "up",
          "--detach",
          "--no-deps",
          "--force-recreate",
          "app",
          "caddy",
        ],
        environment,
      );
      const appId = await serviceContainer(
        runDocker,
        input.composeProject,
        "app",
        true,
      );
      if (appId === null) throw new Error("ROLLBACK_APP_MISSING");
      const app = record(
        (JSON.parse(await runDocker(["inspect", appId])) as unknown[])[0],
        "ROLLBACK_APP_INSPECT",
      );
      if (app.Image !== release.imageId)
        throw new Error("ROLLBACK_APP_IMAGE_MISMATCH");
    },
    verifyReadiness: async () => {
      const response = await fetchImpl(
        new URL("/health/ready", input.publicOrigin),
        { signal: AbortSignal.timeout(10_000) },
      );
      if (response.status !== 200) throw new Error("ROLLBACK_READINESS_FAILED");
      return sha256(await response.text());
    },
    verifyCoreReads: async () => {
      const responses = await Promise.all(
        ["/proposer", "/executor", "/openapi.json"].map(async (path) => {
          const response = await fetchImpl(new URL(path, input.publicOrigin), {
            signal: AbortSignal.timeout(10_000),
          });
          if (response.status !== 200)
            throw new Error(`ROLLBACK_CORE_READ_FAILED:${path}`);
          return response.text();
        }),
      );
      return sha256((await Promise.all(responses)).join("\n"));
    },
  };
};
