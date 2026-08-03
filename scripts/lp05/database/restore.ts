import { spawn } from "node:child_process";

import { assertPostDeployBackup } from "./backup-manifest.js";
import {
  assertIsolatedTarget,
  assertLiveIsolatedTarget,
} from "./restore-evidence.js";
import { inspectLiveIsolatedTarget } from "./restore-runtime.js";
import { canonicalJson } from "../shared/canonical-json.js";
import {
  parseIsolatedRestoreTarget,
  parseProductionResourceIdentity,
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
  };
  inspectTarget?: (
    target: JsonRecord,
    credentials: { user: string; path?: string },
  ) => Promise<JsonRecord>;
  inspectProduction?: (identity: JsonRecord) => Promise<JsonRecord>;
  spawnProcess?: typeof spawn;
}

export const restoreEncryptedBackup = async (
  options: RestoreOptions,
): Promise<void> => {
  assertPostDeployBackup(options.manifest, options.expected);
  const expectedProduction = parseProductionResourceIdentity(
    options.productionIdentity,
  );
  const observedProduction = parseProductionResourceIdentity(
    await (
      options.inspectProduction ??
      (async () => {
        throw new Error("RESTORE_PRODUCTION_INSPECTOR_REQUIRED");
      })
    )(expectedProduction),
  );
  if (canonicalJson(expectedProduction) !== canonicalJson(observedProduction))
    throw new Error("RESTORE_PRODUCTION_IDENTITY_CHANGED");
  assertIsolatedTarget(options.isolatedTarget, observedProduction);
  const target = parseIsolatedRestoreTarget(options.isolatedTarget);
  const credentials = {
    user: options.restoreEnvironment.PGUSER,
    path: options.restoreEnvironment.PATH,
  };
  const observed = await (options.inspectTarget ?? inspectLiveIsolatedTarget)(
    target,
    credentials,
  );
  assertLiveIsolatedTarget(target, observed);
  assertIsolatedTarget(target, observedProduction);
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
    "docker",
    [
      "exec",
      "--interactive",
      "--user",
      "postgres",
      String(target.containerId),
      "pg_restore",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--username",
      options.restoreEnvironment.PGUSER,
      "--dbname",
      String(target.databaseName),
    ],
    {
      env: { PATH: options.restoreEnvironment.PATH },
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
