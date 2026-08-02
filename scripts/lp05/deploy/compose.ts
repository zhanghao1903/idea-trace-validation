import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { loadDeploymentConfig } from "./config.js";

const execute = promisify(execFile);

export const validateComposeStatic = async (
  root = process.cwd(),
): Promise<void> => {
  const production = await readFile(
    `${root}/deploy/compose.production.yaml`,
    "utf8",
  );
  const test = await readFile(`${root}/deploy/compose.test.yaml`, "utf8");
  const postgresSection = production.slice(
    production.indexOf("  postgres:"),
    production.indexOf("  migrate:"),
  );
  const appSection = production.slice(
    production.indexOf("  app:"),
    production.indexOf("  caddy:"),
  );
  if (/^\s+ports:/mu.test(postgresSection) || /^\s+ports:/mu.test(appSection))
    throw new Error("COMPOSE_INTERNAL_SERVICE_EXPOSED");
  for (const token of [
    "read_only: true",
    "cap_drop: [ALL]",
    "no-new-privileges:true",
    "service_completed_successfully",
    "postgres_password",
    "ai_api_token",
    "human_control_token",
  ]) {
    if (!production.includes(token))
      throw new Error(`COMPOSE_REQUIRED:${token}`);
  }
  if (!test.includes("host_ip: 127.0.0.1") || !test.includes("local-test"))
    throw new Error("COMPOSE_TEST_NOT_ISOLATED");
};

export const renderCompose = async (
  environment: NodeJS.ProcessEnv,
): Promise<string> => {
  loadDeploymentConfig(environment);
  const { stdout } = await execute(
    "docker",
    ["compose", "-f", "deploy/compose.production.yaml", "config"],
    {
      cwd: process.cwd(),
      env: environment,
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  for (const value of [
    environment.POSTGRES_PASSWORD,
    environment.AI_API_TOKEN,
    environment.HUMAN_CONTROL_TOKEN,
  ]) {
    if (value !== undefined && value.length >= 8 && stdout.includes(value))
      throw new Error("COMPOSE_SECRET_EXPOSED");
  }
  return stdout;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  validateComposeStatic()
    .then(() => process.stdout.write("LP05_COMPOSE_STATIC_PASS\n"))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "COMPOSE_VALIDATE_FAILED"}\n`,
      );
      process.exitCode = 1;
    });
}
