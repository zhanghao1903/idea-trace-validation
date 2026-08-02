import { homedir } from "node:os";
import { isAbsolute, normalize } from "node:path";

import type { Platform } from "../shared/contracts.js";

export interface DeploymentConfig {
  domain: string;
  acmeEmail: string;
  releaseId: string;
  sourceCommit: string;
  sourceTree: string;
  appImageId: string;
  appImage: string;
  platform: Platform;
  postgresUser: string;
  postgresDb: string;
  deployRoot: string;
  backupRoot: string;
  secretsRoot: string;
  composeProject: string;
}

const required = (environment: NodeJS.ProcessEnv, key: string): string => {
  const value = environment[key]?.trim();
  if (value === undefined || value === "")
    throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
};
const safeName = (value: string, key: string): string => {
  if (!/^[a-z][a-z0-9_-]{0,62}$/u.test(value))
    throw new Error(`CONFIG_INVALID:${key}`);
  return value;
};
const safeRoot = (value: string, key: string): string => {
  if (
    !isAbsolute(value) ||
    normalize(value) !== value ||
    value === "/" ||
    value === homedir() ||
    value === process.cwd() ||
    value.startsWith(`${process.cwd()}/`) ||
    value.includes("..")
  )
    throw new Error(`CONFIG_INVALID:${key}`);
  return value;
};

export const loadDeploymentConfig = (
  environment: NodeJS.ProcessEnv,
): DeploymentConfig => {
  const domain = required(environment, "DEPLOY_DOMAIN");
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
      domain,
    )
  )
    throw new Error("CONFIG_INVALID:DEPLOY_DOMAIN");
  const acmeEmail = required(environment, "ACME_EMAIL");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(acmeEmail))
    throw new Error("CONFIG_INVALID:ACME_EMAIL");
  const releaseId = required(environment, "RELEASE_ID");
  if (!/^lp05-[0-9a-f]{12}-(?:amd64|arm64)$/u.test(releaseId))
    throw new Error("CONFIG_INVALID:RELEASE_ID");
  const sourceCommit = required(environment, "SOURCE_COMMIT");
  const sourceTree = required(environment, "SOURCE_TREE");
  if (
    !/^[0-9a-f]{40}$/u.test(sourceCommit) ||
    !/^[0-9a-f]{40}$/u.test(sourceTree)
  )
    throw new Error("CONFIG_INVALID:SOURCE_REF");
  const appImageId = required(environment, "APP_IMAGE_ID");
  if (!/^sha256:[0-9a-f]{64}$/u.test(appImageId))
    throw new Error("CONFIG_INVALID:APP_IMAGE_ID");
  const appImage = required(environment, "APP_IMAGE");
  if (
    appImage.endsWith(":latest") ||
    appImage !== `idea-trace-validation:${releaseId}`
  )
    throw new Error("CONFIG_INVALID:APP_IMAGE");
  const platform = required(environment, "APP_PLATFORM");
  if (platform !== "linux/amd64" && platform !== "linux/arm64")
    throw new Error("CONFIG_INVALID:APP_PLATFORM");
  const deployRoot = safeRoot(
    required(environment, "DEPLOY_ROOT"),
    "DEPLOY_ROOT",
  );
  const backupRoot = safeRoot(
    required(environment, "BACKUP_ROOT"),
    "BACKUP_ROOT",
  );
  const secretsRoot = safeRoot(
    required(environment, "SECRETS_ROOT"),
    "SECRETS_ROOT",
  );
  if (new Set([deployRoot, backupRoot, secretsRoot]).size !== 3)
    throw new Error("CONFIG_ROOTS_MUST_DIFFER");
  return {
    domain,
    acmeEmail,
    releaseId,
    sourceCommit,
    sourceTree,
    appImageId,
    appImage,
    platform,
    postgresUser: safeName(
      required(environment, "POSTGRES_USER"),
      "POSTGRES_USER",
    ),
    postgresDb: safeName(required(environment, "POSTGRES_DB"), "POSTGRES_DB"),
    deployRoot,
    backupRoot,
    secretsRoot,
    composeProject: safeName(
      environment.COMPOSE_PROJECT_NAME?.trim() || "idea-validation-prod",
      "COMPOSE_PROJECT_NAME",
    ),
  };
};
