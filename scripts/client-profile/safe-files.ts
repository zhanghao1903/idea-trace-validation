import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.js";

export const readJsonFile = async (
  filePath: string,
  maximumBytes = 1_048_576,
): Promise<unknown> => {
  const stats = await lstat(filePath).catch(() => {
    throw new Error("FILE_INVALID");
  });
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size < 2 ||
    stats.size > maximumBytes
  )
    throw new Error("FILE_INVALID");
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error("FILE_JSON_INVALID");
  }
};

const assertSafeOutput = async (filePath: string): Promise<void> => {
  if (!isAbsolute(filePath)) throw new Error("PROFILE_PATH_ABSOLUTE_REQUIRED");
  const parent = dirname(filePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink())
    throw new Error("PROFILE_WRITE_UNSAFE");
  if (process.platform !== "win32") {
    const unsafeWrite = (parentStat.mode & 0o022) !== 0;
    const sticky = (parentStat.mode & 0o1000) !== 0;
    if (unsafeWrite && !sticky) throw new Error("PROFILE_WRITE_UNSAFE");
  }
  try {
    const outputStat = await lstat(filePath);
    if (!outputStat.isFile() || outputStat.isSymbolicLink())
      throw new Error("PROFILE_WRITE_UNSAFE");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export const atomicWrite0600 = async (
  filePath: string,
  content: string,
): Promise<void> => {
  await assertSafeOutput(filePath);
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
    const parent = await open(dirname(filePath), constants.O_RDONLY);
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export const withProfileLock = async <T>(
  outputPath: string,
  action: () => Promise<T>,
): Promise<T> => {
  if (!isAbsolute(outputPath))
    throw new Error("PROFILE_PATH_ABSOLUTE_REQUIRED");
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  const lockPath = `${outputPath}.lock`;
  const acquire = async (): Promise<Awaited<ReturnType<typeof open>>> =>
    open(lockPath, "wx", 0o600);
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await acquire();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const lockStat = await lstat(lockPath).catch(() => undefined);
    if (
      lockStat === undefined ||
      !lockStat.isFile() ||
      lockStat.isSymbolicLink()
    )
      throw new Error("PROFILE_LOCKED");
    const lock = await readFile(lockPath, "utf8").catch(() => "");
    const parsed = /^pid=(\d+)\ncreatedAt=(.+)\n$/u.exec(lock);
    const stale =
      parsed !== null && Date.now() - Date.parse(parsed[2] ?? "") > 30_000;
    const pid = parsed === null ? 0 : Number(parsed[1]);
    if (!stale || !Number.isSafeInteger(pid) || pid < 1 || processExists(pid))
      throw new Error("PROFILE_LOCKED");
    await unlink(lockPath);
    handle = await acquire();
  }
  try {
    await handle.writeFile(
      `pid=${process.pid}\ncreatedAt=${new Date().toISOString()}\n`,
    );
    await handle.sync();
    return await action();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  }
};

const walkFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  )) {
    const candidate = join(current, entry.name);
    const stats = await lstat(candidate);
    if (stats.isSymbolicLink()) throw new Error("SKILL_TREE_UNSAFE");
    if (stats.isDirectory()) files.push(...(await walkFiles(root, candidate)));
    else if (stats.isFile()) files.push(relative(root, candidate));
    else throw new Error("SKILL_TREE_UNSAFE");
  }
  return files;
};

export const skillTreeSha256 = async (skillRoot: string): Promise<string> => {
  if (!isAbsolute(skillRoot)) throw new Error("SKILL_ROOT_ABSOLUTE_REQUIRED");
  const resolved = await realpath(skillRoot);
  const stats = await stat(resolved);
  if (!stats.isDirectory()) throw new Error("SKILL_TREE_UNSAFE");
  const files = await walkFiles(resolved);
  const manifest = [];
  for (const relativePath of files) {
    const bytes = await readFile(resolve(resolved, relativePath));
    manifest.push({ path: relativePath, sha256: sha256(bytes) });
  }
  return sha256(canonicalJson(manifest));
};
