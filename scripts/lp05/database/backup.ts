import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";

import { finalizeBackupManifest } from "./backup-manifest.js";
import { canonicalJson, sha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";
import { assertContainedPath, atomicWrite } from "../shared/filesystem.js";

const fileSha256 = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolve(hash.digest("hex")));
  });

const wait = (child: ReturnType<typeof spawn>, code: string): Promise<void> =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) =>
      status === 0
        ? resolve()
        : reject(new Error(`${code}:${status ?? "signal"}`)),
    );
  });

export interface EncryptedBackupOptions {
  backupRoot: string;
  backupId: string;
  recipient: string;
  identityPath: string;
  pgEnvironment: NodeJS.ProcessEnv;
  manifestFields: JsonRecord;
  toolVersions: { pgDumpVersion: string; ageVersion: string };
  databaseContainerId?: string;
  now?: Date;
}

export const createEncryptedBackup = async (
  options: EncryptedBackupOptions,
): Promise<JsonRecord> => {
  if (!/^backup_[a-zA-Z0-9_-]{6,64}$/u.test(options.backupId))
    throw new Error("BACKUP_ID_INVALID");
  if (!/^age1[0-9a-z]{20,}$/u.test(options.recipient))
    throw new Error("BACKUP_RECIPIENT_INVALID");
  await mkdir(options.backupRoot, { recursive: true, mode: 0o700 });
  const ciphertextPath = await assertContainedPath(
    options.backupRoot,
    join(options.backupRoot, `${options.backupId}.dump.age`),
  );
  const temporary = `${ciphertextPath}.tmp-${process.pid}`;
  const dump = spawn(
    options.databaseContainerId === undefined ? "pg_dump" : "docker",
    options.databaseContainerId === undefined
      ? ["--format=custom", "--no-owner", "--no-privileges"]
      : [
          "exec",
          "--user",
          "postgres",
          options.databaseContainerId,
          "pg_dump",
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          "--username",
          String(options.pgEnvironment.PGUSER),
          "--dbname",
          String(options.pgEnvironment.PGDATABASE),
        ],
    {
      env: options.pgEnvironment,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const age = spawn(
    "age",
    ["--recipient", options.recipient, "--output", temporary, "-"],
    {
      env: { PATH: process.env.PATH },
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
  if (dump.stdout === null || age.stdin === null)
    throw new Error("BACKUP_PIPE_UNAVAILABLE");
  dump.stdout.pipe(age.stdin);
  await Promise.all([
    wait(dump, "PG_DUMP_FAILED"),
    wait(age, "AGE_ENCRYPT_FAILED"),
  ]);
  await chmod(temporary, 0o600);
  await rename(temporary, ciphertextPath);
  const stat = await lstat(ciphertextPath);
  if (!stat.isFile() || stat.size < 1)
    throw new Error("BACKUP_CIPHERTEXT_INVALID");

  const decrypt = spawn(
    "age",
    ["--decrypt", "--identity", options.identityPath, ciphertextPath],
    {
      env: { PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const list = spawn("pg_restore", ["--list"], {
    env: { PATH: process.env.PATH },
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (decrypt.stdout === null || list.stdin === null || list.stdout === null)
    throw new Error("BACKUP_VERIFY_PIPE_UNAVAILABLE");
  decrypt.stdout.pipe(list.stdin);
  const listHash = createHash("sha256");
  let listBytes = 0;
  list.stdout.on("data", (chunk: Buffer) => {
    listBytes += chunk.length;
    if (listBytes > 4 * 1024 * 1024) list.kill("SIGTERM");
    else listHash.update(chunk);
  });
  await Promise.all([
    wait(decrypt, "AGE_DECRYPT_VERIFY_FAILED"),
    wait(list, "PG_RESTORE_LIST_FAILED"),
  ]);
  const now = options.now ?? new Date();
  const manifest = finalizeBackupManifest({
    ...options.manifestFields,
    schemaVersion: "1.0",
    backupId: options.backupId,
    createdAt: now.toISOString(),
    ciphertext: {
      basename: basename(ciphertextPath),
      sizeBytes: stat.size,
      sha256: await fileSha256(ciphertextPath),
    },
    encryption: {
      algorithm: "age-v1",
      recipientFingerprint: sha256(options.recipient),
    },
    tool: {
      pgDumpVersion: options.toolVersions.pgDumpVersion,
      ageVersion: options.toolVersions.ageVersion,
      format: "custom",
    },
    verification: {
      status: "PASS",
      verifiedAt: now.toISOString(),
      pgRestoreListSha256: listHash.digest("hex"),
    },
  });
  const manifestPath = await assertContainedPath(
    options.backupRoot,
    join(options.backupRoot, `${options.backupId}.manifest.json`),
  );
  await atomicWrite(manifestPath, canonicalJson(manifest), 0o600);
  return manifest;
};
