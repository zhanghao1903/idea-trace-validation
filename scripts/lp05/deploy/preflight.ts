import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { loadDeploymentConfig } from "./config.js";
import { inspectToolchain, type ToolchainOptions } from "./toolchain.js";
import { sha256 } from "../shared/canonical-json.js";

export const preflight = async (
  environment: NodeJS.ProcessEnv,
  toolchain: ToolchainOptions = {},
): Promise<unknown> => {
  const config = loadDeploymentConfig(environment);
  const roots = await Promise.all(
    [config.deployRoot, config.backupRoot, config.secretsRoot].map((root) =>
      realpath(root),
    ),
  );
  if (new Set(roots).size !== roots.length)
    throw new Error("PREFLIGHT_ROOT_COLLISION");
  const secrets: string[] = [];
  for (const name of [
    "postgres_password",
    "ai_api_token",
    "human_control_token",
  ]) {
    const path = join(config.secretsRoot, name);
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.mode % 8 > 0 ||
      stat.size < 1 ||
      stat.size > 4096
    )
      throw new Error(`PREFLIGHT_SECRET_INVALID:${name}`);
    secrets.push((await readFile(path, "utf8")).trim());
  }
  if (
    secrets[0].length < 32 ||
    secrets[1].length < 32 ||
    !/^[A-Za-z0-9_-]{43}$/u.test(secrets[2]) ||
    new Set(secrets).size !== secrets.length
  ) {
    throw new Error("PREFLIGHT_SECRET_POLICY");
  }
  return {
    config: {
      releaseId: config.releaseId,
      sourceCommit: config.sourceCommit,
      platform: config.platform,
      domainSha256: sha256(config.domain),
      composeProject: config.composeProject,
    },
    toolchain: await inspectToolchain(toolchain),
    status: "PASS",
  };
};
