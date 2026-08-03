import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "../shared/canonical-json.js";
import { record } from "../shared/contracts.js";

export interface AttemptLock {
  path: string;
  attemptId: string;
  nonce: string;
  recovered: boolean;
}

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const lockPath = (stateRoot: string, targetId: string): string => {
  if (!path.isAbsolute(stateRoot) || path.resolve(stateRoot) === "/")
    throw new Error("DEPLOYMENT_STATE_ROOT_UNSAFE");
  return path.join(
    path.resolve(stateRoot),
    "locks",
    `${sha256(targetId)}.lock`,
  );
};

export const acquireAttemptLock = async (
  stateRoot: string,
  targetId: string,
  attemptId: string,
): Promise<AttemptLock> => {
  const destination = lockPath(stateRoot, targetId);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const nonce = randomBytes(16).toString("hex");
  const content = canonicalJson({
    schemaVersion: "1.0",
    targetId,
    attemptId,
    pid: process.pid,
    nonce,
  });
  const create = async (): Promise<void> => {
    const file = await open(destination, "wx", 0o600);
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
  };
  let recovered = false;
  try {
    await create();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const recoveryPath = `${destination}.recovery`;
    let recovery;
    try {
      recovery = await open(recoveryPath, "wx", 0o600);
    } catch (recoveryError) {
      if ((recoveryError as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error("DEPLOYMENT_TARGET_LOCKED");
      throw recoveryError;
    }
    try {
      let existing;
      try {
        existing = record(
          JSON.parse(await readFile(destination, "utf8")),
          "DEPLOYMENT_LOCK",
        );
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
          try {
            await create();
            return { path: destination, attemptId, nonce, recovered: false };
          } catch (createError) {
            if ((createError as NodeJS.ErrnoException).code === "EEXIST")
              throw new Error("DEPLOYMENT_TARGET_LOCKED");
            throw createError;
          }
        }
        throw new Error("DEPLOYMENT_LOCK_CORRUPT");
      }
      if (
        typeof existing.pid !== "number" ||
        !Number.isSafeInteger(existing.pid) ||
        existing.pid < 1 ||
        typeof existing.attemptId !== "string"
      )
        throw new Error("DEPLOYMENT_LOCK_CORRUPT");
      if (processAlive(existing.pid))
        throw new Error("DEPLOYMENT_TARGET_LOCKED");
      if (existing.attemptId !== attemptId)
        throw new Error("DEPLOYMENT_LOCK_ATTEMPT_MISMATCH");
      await unlink(destination);
      try {
        await create();
      } catch (createError) {
        if ((createError as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error("DEPLOYMENT_TARGET_LOCKED");
        throw createError;
      }
      recovered = true;
    } finally {
      await recovery.close();
      await unlink(recoveryPath).catch((cleanupError: unknown) => {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
          throw cleanupError;
      });
    }
  }
  return { path: destination, attemptId, nonce, recovered };
};

export const releaseAttemptLock = async (lock: AttemptLock): Promise<void> => {
  const existing = record(
    JSON.parse(await readFile(lock.path, "utf8")),
    "DEPLOYMENT_LOCK",
  );
  if (existing.attemptId !== lock.attemptId || existing.nonce !== lock.nonce)
    throw new Error("DEPLOYMENT_LOCK_OWNERSHIP");
  await unlink(lock.path);
};

export const bindEnvelopeToAttempt = async (
  stateRoot: string,
  envelopeId: string,
  attemptId: string,
): Promise<void> => {
  if (!path.isAbsolute(stateRoot) || path.resolve(stateRoot) === "/")
    throw new Error("DEPLOYMENT_STATE_ROOT_UNSAFE");
  const root = path.join(path.resolve(stateRoot), "envelopes");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const destination = path.join(root, `${sha256(envelopeId)}.json`);
  const content = canonicalJson({
    schemaVersion: "1.0",
    envelopeId,
    attemptId,
  });
  try {
    const file = await open(destination, "wx", 0o600);
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = record(
      JSON.parse(await readFile(destination, "utf8")),
      "DEPLOYMENT_ENVELOPE_BINDING",
    );
    if (existing.envelopeId !== envelopeId || existing.attemptId !== attemptId)
      throw new Error("DEPLOYMENT_ENVELOPE_ALREADY_BOUND");
  }
};
