import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const assertContainedPath = async (
  root: string,
  candidate: string,
): Promise<string> => {
  if (!isAbsolute(root) || !isAbsolute(candidate) || root === "/")
    throw new Error("PATH_ROOT_UNSAFE");
  const lexicalRoot = resolve(root);
  const lexicalCandidate = resolve(candidate);
  const resolvedRoot = await realpath(root);
  const suffix = relative(lexicalRoot, lexicalCandidate);
  if (suffix === "" || suffix.startsWith("..") || isAbsolute(suffix))
    throw new Error("PATH_ESCAPE");
  return resolve(resolvedRoot, suffix);
};

export const assertRegularFile = async (
  path: string,
  maximumBytes: number,
): Promise<void> => {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > maximumBytes
  ) {
    throw new Error("FILE_INVALID");
  }
};

export const atomicWrite = async (
  path: string,
  content: string | Uint8Array,
  mode: 0o600 | 0o644,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  const file = await open(temporary, "wx", mode);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  await chmod(temporary, mode);
  await rename(temporary, path);
  const directory = await open(dirname(path), constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
};

export const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
