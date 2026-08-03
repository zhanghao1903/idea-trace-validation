import { readFile } from "node:fs/promises";

import { createEncryptedBackup } from "./backup.js";
import { canonicalJson } from "../shared/canonical-json.js";
import { record } from "../shared/contracts.js";

const requiredEnvironment = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "")
    throw new Error(`BACKUP_ENV_REQUIRED:${key}`);
  return value;
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--request");
  const path = index >= 0 ? process.argv[index + 1] : undefined;
  if (path === undefined) throw new Error("BACKUP_REQUEST_REQUIRED");
  const request = record(
    JSON.parse(await readFile(path, "utf8")),
    "BACKUP_REQUEST",
  );
  const manifest = await createEncryptedBackup({
    backupRoot: String(request.backupRoot),
    backupId: String(request.backupId),
    recipient: requiredEnvironment("AGE_RECIPIENT"),
    identityPath: requiredEnvironment("AGE_IDENTITY_FILE"),
    pgEnvironment: {
      PATH: process.env.PATH,
      PGHOST: requiredEnvironment("PGHOST"),
      PGPORT: requiredEnvironment("PGPORT"),
      PGUSER: requiredEnvironment("PGUSER"),
      PGPASSWORD: requiredEnvironment("PGPASSWORD"),
      PGDATABASE: requiredEnvironment("PGDATABASE"),
    },
    manifestFields: record(request.manifestFields, "BACKUP_MANIFEST_FIELDS"),
    toolVersions: record(request.toolVersions, "BACKUP_TOOL_VERSIONS") as {
      pgDumpVersion: string;
      ageVersion: string;
    },
  });
  process.stdout.write(`${canonicalJson(manifest)}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "BACKUP_FAILED"}\n`,
  );
  process.exitCode = 1;
});
