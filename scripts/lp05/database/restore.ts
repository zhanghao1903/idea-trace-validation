import { spawn } from "node:child_process";

import { assertPostDeployBackup } from "./backup-manifest.js";
import {
  assertIsolatedTarget,
  assertLiveIsolatedTarget,
} from "./restore-evidence.js";
import { inspectLiveIsolatedTarget } from "./restore-runtime.js";
import {
  parseIsolatedRestoreTarget,
  type JsonRecord,
} from "../shared/contracts.js";

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
  restoreEnvironment: {
    PATH?: string;
    PGUSER: string;
    PGPASSWORD: string;
  };
  inspectTarget?: (
    target: JsonRecord,
    credentials: { user: string; password: string; path?: string },
  ) => Promise<JsonRecord>;
  spawnProcess?: typeof spawn;
}

export const restoreEncryptedBackup = async (
  options: RestoreOptions,
): Promise<void> => {
  assertPostDeployBackup(options.manifest, options.expected);
  assertIsolatedTarget(options.isolatedTarget, options.productionIdentity);
  const target = parseIsolatedRestoreTarget(options.isolatedTarget);
  const credentials = {
    user: options.restoreEnvironment.PGUSER,
    password: options.restoreEnvironment.PGPASSWORD,
    path: options.restoreEnvironment.PATH,
  };
  const observed = await (options.inspectTarget ?? inspectLiveIsolatedTarget)(
    target,
    credentials,
  );
  assertLiveIsolatedTarget(target, observed);
  const databaseEnvironment: NodeJS.ProcessEnv = {
    PATH: options.restoreEnvironment.PATH,
    PGHOST: String(target.databaseHost),
    PGPORT: String(target.databasePort),
    PGUSER: options.restoreEnvironment.PGUSER,
    PGPASSWORD: options.restoreEnvironment.PGPASSWORD,
    PGDATABASE: String(target.databaseName),
  };
  const spawnProcess = options.spawnProcess ?? spawn;
  const decrypt = spawnProcess(
    "age",
    ["--decrypt", "--identity", options.identityPath, options.ciphertextPath],
    {
      env: { PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const restore = spawnProcess(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      String(target.databaseName),
    ],
    {
      env: databaseEnvironment,
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
