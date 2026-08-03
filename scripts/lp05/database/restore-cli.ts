import { readFile } from "node:fs/promises";

import { restoreEncryptedBackup } from "./restore.js";
import { inspectLiveProductionIdentity } from "./production-runtime.js";
import { exactKeys, record } from "../shared/contracts.js";

const requiredEnvironment = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "")
    throw new Error(`RESTORE_ENV_REQUIRED:${key}`);
  return value;
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--request");
  const path = index >= 0 ? process.argv[index + 1] : undefined;
  if (path === undefined) throw new Error("RESTORE_REQUEST_REQUIRED");
  const request = record(
    JSON.parse(await readFile(path, "utf8")),
    "RESTORE_REQUEST",
  );
  exactKeys(
    request,
    [
      "manifest",
      "expected",
      "ciphertextPath",
      "isolatedTarget",
      "productionIdentity",
      "productionTarget",
      "candidate",
    ],
    "RESTORE_REQUEST",
  );
  await restoreEncryptedBackup({
    manifest: request.manifest,
    expected: record(
      request.expected,
      "RESTORE_EXPECTED",
    ) as unknown as Parameters<typeof restoreEncryptedBackup>[0]["expected"],
    ciphertextPath: String(request.ciphertextPath),
    identityPath: requiredEnvironment("AGE_IDENTITY_FILE"),
    isolatedTarget: record(request.isolatedTarget, "RESTORE_ISOLATED_TARGET"),
    productionIdentity: record(
      request.productionIdentity,
      "RESTORE_PRODUCTION_IDENTITY",
    ),
    inspectProduction: async () =>
      inspectLiveProductionIdentity({
        target: request.productionTarget,
        candidate: request.candidate,
        databaseName: requiredEnvironment("PGDATABASE"),
      }),
    restoreEnvironment: {
      PATH: process.env.PATH,
      PGUSER: requiredEnvironment("PGUSER"),
    },
  });
  process.stdout.write("LP05_ISOLATED_RESTORE_PASS\n");
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "RESTORE_FAILED"}\n`,
  );
  process.exitCode = 1;
});
