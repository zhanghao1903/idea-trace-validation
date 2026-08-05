import { execFile } from "node:child_process";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { DeploymentConnectionHandoffV1 } from "./contracts.js";
import { skillTreeSha256 } from "./safe-files.js";
import { openapiCompatibilityDigest } from "./verify.js";

const execFileAsync = promisify(execFile);

const git = async (
  workingDirectory: string,
  args: string[],
): Promise<string> => {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", workingDirectory, ...args],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return result.stdout;
  } catch {
    throw new Error("HANDOFF_GIT_AUTHORITY_INVALID");
  }
};

const commitExists = async (
  repositoryRoot: string,
  commit: string,
  code: string,
): Promise<void> => {
  try {
    await execFileAsync(
      "git",
      ["-C", repositoryRoot, "cat-file", "-e", `${commit}^{commit}`],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw new Error(code);
  }
};

interface TrackedSkillFile {
  mode: "100644" | "100755";
  objectId: string;
  path: string;
}

const trackedSkillFiles = async (
  repositoryRoot: string,
  commit: string,
): Promise<TrackedSkillFile[]> => {
  const output = await git(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    commit,
    "--",
    "skills",
  ]);
  return output
    .split("\0")
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
      if (match === null) throw new Error("SKILL_TREE_COMMIT_INVALID");
      return {
        mode: match[1] as "100644" | "100755",
        objectId: match[2] as string,
        path: match[3] as string,
      };
    });
};

const localSkillFiles = async (
  root: string,
  current = root,
): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  )) {
    const candidate = path.join(current, entry.name);
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink()) throw new Error("SKILL_TREE_UNSAFE");
    if (metadata.isDirectory())
      files.push(...(await localSkillFiles(root, candidate)));
    else if (metadata.isFile()) files.push(path.relative(root, candidate));
    else throw new Error("SKILL_TREE_UNSAFE");
  }
  return files;
};

const repositoryForSkillRoot = async (
  skillRoot: string,
): Promise<{ repositoryRoot: string; skillRoot: string }> => {
  const resolvedSkillRoot = await realpath(skillRoot).catch(() => {
    throw new Error("SKILL_TREE_UNSAFE");
  });
  const repositoryRoot = (
    await git(resolvedSkillRoot, ["rev-parse", "--show-toplevel"])
  ).trim();
  const canonicalSkillRoot = await realpath(
    path.join(repositoryRoot, "skills"),
  ).catch(() => {
    throw new Error("SKILL_ROOT_MISMATCH");
  });
  if (resolvedSkillRoot !== canonicalSkillRoot)
    throw new Error("SKILL_ROOT_MISMATCH");
  return { repositoryRoot, skillRoot: resolvedSkillRoot };
};

const assertSkillCommit = async (input: {
  repositoryRoot: string;
  skillRoot: string;
  commit: string;
  expectedVersion: string;
  expectedTreeSha256?: string;
}): Promise<string> => {
  await commitExists(
    input.repositoryRoot,
    input.commit,
    "SKILL_COMMIT_NOT_FOUND",
  );
  const tracked = await trackedSkillFiles(input.repositoryRoot, input.commit);
  const local = await localSkillFiles(input.skillRoot);
  const trackedByPath = new Map(
    tracked.map((entry) => [path.relative("skills", entry.path), entry]),
  );
  if (
    trackedByPath.size !== local.length ||
    local.some((entry) => !trackedByPath.has(entry))
  )
    throw new Error("SKILL_TREE_COMMIT_MISMATCH");
  for (const relativePath of local) {
    const entry = trackedByPath.get(relativePath) as TrackedSkillFile;
    const absolutePath = path.join(input.skillRoot, relativePath);
    const metadata = await stat(absolutePath);
    const mode = (metadata.mode & 0o111) === 0 ? "100644" : "100755";
    const objectId = (
      await git(input.repositoryRoot, [
        "hash-object",
        "--no-filters",
        "--",
        absolutePath,
      ])
    ).trim();
    if (mode !== entry.mode || objectId !== entry.objectId)
      throw new Error("SKILL_TREE_COMMIT_MISMATCH");
  }
  const packageDocument = JSON.parse(
    await git(input.repositoryRoot, ["show", `${input.commit}:package.json`]),
  ) as Record<string, unknown>;
  if (packageDocument.version !== input.expectedVersion)
    throw new Error("SKILL_VERSION_MISMATCH");
  const treeSha256 = await skillTreeSha256(input.skillRoot);
  if (
    input.expectedTreeSha256 !== undefined &&
    treeSha256 !== input.expectedTreeSha256
  )
    throw new Error("SKILL_TREE_COMMIT_MISMATCH");
  return treeSha256;
};

const assertSourceOpenapi = async (input: {
  repositoryRoot: string;
  sourceCommit: string;
  expectedOpenapiSha256: string;
}): Promise<void> => {
  await commitExists(
    input.repositoryRoot,
    input.sourceCommit,
    "SOURCE_COMMIT_NOT_FOUND",
  );
  let document: unknown;
  try {
    document = JSON.parse(
      await git(input.repositoryRoot, [
        "show",
        `${input.sourceCommit}:openapi/lp03.v1.json`,
      ]),
    ) as unknown;
  } catch {
    throw new Error("SOURCE_OPENAPI_MISMATCH");
  }
  if (openapiCompatibilityDigest(document) !== input.expectedOpenapiSha256)
    throw new Error("SOURCE_OPENAPI_MISMATCH");
};

export const resolveDeploymentAuthority = async (input: {
  skillRoot: string;
  sourceCommit: string;
  skillCommit: string;
  skillVersion: string;
  openapiSha256: string;
  expectedSkillTreeSha256?: string;
}): Promise<{ repositoryRoot: string; skillTreeSha256: string }> => {
  const repository = await repositoryForSkillRoot(input.skillRoot);
  await assertSourceOpenapi({
    repositoryRoot: repository.repositoryRoot,
    sourceCommit: input.sourceCommit,
    expectedOpenapiSha256: input.openapiSha256,
  });
  const treeSha256 = await assertSkillCommit({
    repositoryRoot: repository.repositoryRoot,
    skillRoot: repository.skillRoot,
    commit: input.skillCommit,
    expectedVersion: input.skillVersion,
    expectedTreeSha256: input.expectedSkillTreeSha256,
  });
  return {
    repositoryRoot: repository.repositoryRoot,
    skillTreeSha256: treeSha256,
  };
};

export const assertDeploymentAuthority = async (
  handoff: DeploymentConnectionHandoffV1,
  skillRoot: string,
): Promise<void> => {
  await resolveDeploymentAuthority({
    skillRoot,
    sourceCommit: handoff.sourceCommit,
    skillCommit: handoff.skillCommit,
    skillVersion: handoff.skillVersion,
    openapiSha256: handoff.openapiSha256,
    expectedSkillTreeSha256: handoff.skillTreeSha256,
  });
};
