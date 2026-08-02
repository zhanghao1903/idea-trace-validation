import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadImageLock } from "./build.js";
import {
  verifyCandidateProvenance,
  verifyReleaseCandidateManifest,
  type CandidateIdentityV1,
  type JsonRecord,
  type Platform,
} from "../shared/contracts.js";
import {
  assertContainedPath,
  assertRegularFile,
} from "../shared/filesystem.js";

const hashFile = async (path: string): Promise<string> =>
  new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolveHash(hash.digest("hex")));
  });

export const verifyStaticCandidateConfiguration = async (
  root = process.cwd(),
): Promise<void> => {
  await Promise.all([
    loadImageLock("linux/amd64"),
    loadImageLock("linux/arm64"),
  ]);
  const containerfile = await readFile(
    join(root, "deploy/Containerfile"),
    "utf8",
  );
  const from = [...containerfile.matchAll(/^FROM\s+([^\s]+).*$/gmu)].map(
    (match) => match[1],
  );
  if (
    from.length !== 2 ||
    from.some(
      (reference) =>
        reference.includes(":latest") || !reference.includes("@sha256:"),
    )
  )
    throw new Error("CONTAINERFILE_FROM_UNPINNED");
  if (
    !/^USER\s+10001:10001$/mu.test(containerfile) ||
    /\b(?:ARG|ENV)\s+[^\n]*(?:TOKEN|PASSWORD|SECRET)/iu.test(containerfile)
  )
    throw new Error("CONTAINERFILE_HARDENING");
  if (
    !containerfile.includes(
      "npm install --omit=dev --ignore-scripts --no-save --package-lock=false ajv@8.20.0",
    )
  )
    throw new Error("CONTAINERFILE_RUNTIME_AJV_PIN");
  const dockerignore = await readFile(join(root, ".dockerignore"), "utf8");
  for (const required of [
    ".git",
    ".idea",
    ".lp04-demo",
    ".lp05-release",
    ".env",
    "node_modules",
    "**/*.test.ts",
  ]) {
    if (!dockerignore.split("\n").includes(required))
      throw new Error(`DOCKERIGNORE_MISSING:${required}`);
  }
  const healthcheck = await readFile(
    join(root, "deploy/runtime/healthcheck.mjs"),
    "utf8",
  );
  if (
    !healthcheck.includes("body?.ok !== true") ||
    !healthcheck.includes('body?.data?.status !== "ready"')
  )
    throw new Error("RUNTIME_HEALTHCHECK_CONTRACT");
};

export const verifyCandidateFiles = async (
  manifestPath: string,
  options: {
    phase: "PRE_MERGE" | "PRODUCTION";
    reviewedHead: string;
    mergeCommitSha?: string;
    reachableFromBase?: boolean;
  },
): Promise<JsonRecord> => {
  const releaseRoot = resolve(process.cwd(), ".lp05-release");
  const resolvedManifest = await assertContainedPath(
    releaseRoot,
    resolve(manifestPath),
  );
  await assertRegularFile(resolvedManifest, 1024 * 1024);
  const manifest = verifyReleaseCandidateManifest(
    JSON.parse(await readFile(resolvedManifest, "utf8")),
  ) as JsonRecord;
  const archive = manifest.ociArchive as JsonRecord;
  const archivePath = await assertContainedPath(
    dirname(resolvedManifest),
    join(dirname(resolvedManifest), String(archive.basename)),
  );
  await assertRegularFile(archivePath, 10 * 1024 * 1024 * 1024);
  if ((await hashFile(archivePath)) !== archive.sha256)
    throw new Error("CANDIDATE_ARCHIVE_DIGEST");
  const identity: CandidateIdentityV1 = {
    manifestSha256: String(manifest.manifestSha256),
    releaseId: String(manifest.releaseId),
    sourceCommit: String(manifest.sourceCommit),
    sourceTree: String(manifest.sourceTree),
    imageId: String(manifest.imageId),
    archiveSha256: String(archive.sha256),
    platform: manifest.platform as Platform,
  };
  verifyCandidateProvenance({ candidate: identity, ...options });
  return manifest;
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--static")) {
    await verifyStaticCandidateConfiguration();
    process.stdout.write("LP05_CANDIDATE_STATIC_PASS\n");
    return;
  }
  const index = process.argv.indexOf("--manifest");
  if (index < 0 || process.argv[index + 1] === undefined)
    throw new Error("MANIFEST_REQUIRED");
  const phase = process.argv.includes("--production")
    ? "PRODUCTION"
    : "PRE_MERGE";
  const reviewedIndex = process.argv.indexOf("--reviewed-head");
  const reviewedHead = process.argv[reviewedIndex + 1];
  if (reviewedIndex < 0 || reviewedHead === undefined)
    throw new Error("REVIEWED_HEAD_REQUIRED");
  const mergeIndex = process.argv.indexOf("--merge-commit");
  await verifyCandidateFiles(process.argv[index + 1], {
    phase,
    reviewedHead,
    mergeCommitSha: mergeIndex >= 0 ? process.argv[mergeIndex + 1] : undefined,
    reachableFromBase: process.argv.includes("--reachable-from-base"),
  });
  process.stdout.write("LP05_CANDIDATE_PASS\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "CANDIDATE_VERIFY_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
