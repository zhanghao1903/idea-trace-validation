import { spawn } from "node:child_process";

import { assertPostDeployBackup } from "./backup-manifest.js";
import { assertIsolatedTarget } from "./restore-evidence.js";
import type { JsonRecord } from "../shared/contracts.js";

const wait = (child: ReturnType<typeof spawn>, code: string): Promise<void> =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) =>
      status === 0
        ? resolve()
        : reject(new Error(`${code}:${status ?? "signal"}`)),
    );
  });

export interface RestoreOptions {
  manifest: unknown;
  expected: Parameters<typeof assertPostDeployBackup>[1];
  ciphertextPath: string;
  identityPath: string;
  isolatedTarget: JsonRecord;
  productionIdentity: JsonRecord;
  restoreEnvironment: NodeJS.ProcessEnv;
}

export const restoreEncryptedBackup = async (
  options: RestoreOptions,
): Promise<void> => {
  assertPostDeployBackup(options.manifest, options.expected);
  assertIsolatedTarget(options.isolatedTarget, options.productionIdentity);
  if (
    options.restoreEnvironment.PGHOST === undefined ||
    !["127.0.0.1", "localhost"].includes(options.restoreEnvironment.PGHOST)
  ) {
    throw new Error("RESTORE_DATABASE_NOT_LOOPBACK");
  }
  const decrypt = spawn(
    "age",
    ["--decrypt", "--identity", options.identityPath, options.ciphertextPath],
    {
      env: { PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const restore = spawn(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      String(options.restoreEnvironment.PGDATABASE),
    ],
    {
      env: options.restoreEnvironment,
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
  if (decrypt.stdout === null || restore.stdin === null)
    throw new Error("RESTORE_PIPE_UNAVAILABLE");
  decrypt.stdout.pipe(restore.stdin);
  await Promise.all([
    wait(decrypt, "RESTORE_DECRYPT_FAILED"),
    wait(restore, "RESTORE_IMPORT_FAILED"),
  ]);
};
