import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  verifyReleaseCandidateManifest,
  type JsonRecord,
  type Platform,
} from "../shared/contracts.js";
import { atomicWrite } from "../shared/filesystem.js";

interface ImageLockEntry {
  role: "builder" | "database" | "proxy";
  repository: string;
  versionTag: string;
  indexDigest: string;
  platformDigests: Record<Platform, string>;
}

const root = process.cwd();
const outputRoot = join(root, ".lp05-release");
const maximumLogBytes = 4 * 1024 * 1024;

const run = async (
  command: string,
  args: readonly string[],
  capture = true,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const chunks: Buffer[] = [];
    const append = (chunk: Buffer): void => {
      chunks.push(chunk);
      if (
        chunks.reduce((sum, current) => sum + current.length, 0) >
        maximumLogBytes
      )
        child.kill("SIGTERM");
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", reject);
    child.once("exit", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `COMMAND_FAILED:${command}:${code ?? "signal"}:${output.slice(-2000)}`,
          ),
        );
    });
  });

const parsePlatform = (): Platform => {
  const index = process.argv.indexOf("--platform");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value !== "linux/amd64" && value !== "linux/arm64")
    throw new Error("PLATFORM_REQUIRED");
  return value;
};

export const loadImageLock = async (
  platform: Platform,
): Promise<ImageLockEntry[]> => {
  const parsed = JSON.parse(
    await readFile(join(root, "deploy/images.lock.json"), "utf8"),
  ) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("IMAGE_LOCK_OBJECT");
  const lock = parsed as JsonRecord;
  if (
    lock.schemaVersion !== "1.0" ||
    !Array.isArray(lock.images) ||
    lock.images.length !== 3
  )
    throw new Error("IMAGE_LOCK_SCHEMA");
  const expectedRoles = ["builder", "database", "proxy"];
  return lock.images.map((candidate, index) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    )
      throw new Error("IMAGE_LOCK_ENTRY");
    const input = candidate as JsonRecord;
    const keys = Object.keys(input).sort();
    if (
      keys.join(",") !==
      ["indexDigest", "platformDigests", "repository", "role", "versionTag"]
        .sort()
        .join(",")
    )
      throw new Error("IMAGE_LOCK_ENTRY_FIELDS");
    if (input.role !== expectedRoles[index] || input.versionTag === "latest")
      throw new Error("IMAGE_LOCK_ROLE");
    if (
      typeof input.repository !== "string" ||
      !input.repository.startsWith("docker.io/library/")
    )
      throw new Error("IMAGE_LOCK_REPOSITORY");
    if (
      typeof input.versionTag !== "string" ||
      typeof input.indexDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(input.indexDigest)
    )
      throw new Error("IMAGE_LOCK_DIGEST");
    if (
      typeof input.platformDigests !== "object" ||
      input.platformDigests === null ||
      Array.isArray(input.platformDigests)
    )
      throw new Error("IMAGE_LOCK_PLATFORMS");
    const platformDigests = input.platformDigests as Record<string, unknown>;
    if (
      Object.keys(platformDigests).sort().join(",") !==
      "linux/amd64,linux/arm64"
    )
      throw new Error("IMAGE_LOCK_PLATFORMS");
    if (
      typeof platformDigests[platform] !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(platformDigests[platform])
    )
      throw new Error("IMAGE_LOCK_PLATFORM_DIGEST");
    return {
      role: input.role as ImageLockEntry["role"],
      repository: input.repository,
      versionTag: input.versionTag,
      indexDigest: input.indexDigest,
      platformDigests: platformDigests as Record<Platform, string>,
    };
  });
};

const hashFile = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolve(hash.digest("hex")));
  });

const hashTree = async (directory: string): Promise<string> => {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("WEB_ASSET_NON_REGULAR");
    }
  };
  await visit(directory);
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(relative(directory, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const ociImageId = async (archive: string): Promise<string> => {
  const index = JSON.parse(
    await run("tar", ["-xOf", archive, "index.json"]),
  ) as { manifests?: { digest?: string }[] };
  const manifestDigest = index.manifests?.[0]?.digest;
  if (
    manifestDigest === undefined ||
    !/^sha256:[0-9a-f]{64}$/u.test(manifestDigest)
  )
    throw new Error("OCI_INDEX_INVALID");
  const manifestPath = `blobs/sha256/${manifestDigest.slice("sha256:".length)}`;
  const manifest = JSON.parse(
    await run("tar", ["-xOf", archive, manifestPath]),
  ) as { config?: { digest?: string } };
  const imageId = manifest.config?.digest;
  if (imageId === undefined || !/^sha256:[0-9a-f]{64}$/u.test(imageId))
    throw new Error("OCI_CONFIG_INVALID");
  return imageId;
};

const build = async (): Promise<void> => {
  const platform = parsePlatform();
  const dirty = await run("git", [
    "status",
    "--porcelain",
    "--untracked-files=normal",
  ]);
  if (dirty.trim() !== "") throw new Error("GIT_TREE_DIRTY");
  const sourceCommit = (await run("git", ["rev-parse", "HEAD"])).trim();
  const sourceTree = (await run("git", ["rev-parse", "HEAD^{tree}"])).trim();
  const architecture = platform === "linux/amd64" ? "amd64" : "arm64";
  const releaseId = `lp05-${sourceCommit.slice(0, 12)}-${architecture}`;
  const candidateRoot = join(outputRoot, releaseId);
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await mkdir(candidateRoot, { recursive: false, mode: 0o700 });
  const archivePath = join(candidateRoot, `${releaseId}.oci.tar`);
  const verificationStartedAt = new Date();
  const verificationLog = await run("npm", ["run", "verify"]);
  if (
    (
      await run("git", ["status", "--porcelain", "--untracked-files=normal"])
    ).trim() !== ""
  )
    throw new Error("GIT_TREE_CHANGED_BY_VERIFY");
  const lock = await loadImageLock(platform);
  await run("docker", [
    "buildx",
    "build",
    "--platform",
    platform,
    "--file",
    "deploy/Containerfile",
    "--build-arg",
    `SOURCE_COMMIT=${sourceCommit}`,
    "--build-arg",
    `SOURCE_TREE=${sourceTree}`,
    "--build-arg",
    `RELEASE_ID=${releaseId}`,
    "--tag",
    `idea-trace-validation:${releaseId}`,
    "--output",
    `type=oci,dest=${archivePath}`,
    ".",
  ]);
  const archiveStat = await lstat(archivePath);
  if (
    !archiveStat.isFile() ||
    archiveStat.size < 1 ||
    archiveStat.size > 10 * 1024 * 1024 * 1024
  )
    throw new Error("OCI_ARCHIVE_INVALID");
  const imageId = await ociImageId(archivePath);
  const migrationPaths = [
    ["0001_lp01_core", "packages/db/migrations/0001_lp01_core.sql", "legacy"],
    [
      "0002_lp02_execution_decisions",
      "packages/db/migrations/0002_lp02_execution_decisions.sql",
      "feature",
    ],
    [
      "0003_lp03_reporting_experience",
      "packages/db/migrations/0003_lp03_reporting_experience.sql",
      "feature",
    ],
  ] as const;
  const manifest: JsonRecord = {
    schemaVersion: "1.0",
    manifestSha256: "",
    releaseId,
    sourceCommit,
    sourceTree,
    createdAt: verificationStartedAt.toISOString(),
    platform,
    applicationVersion: `0.1.0+${sourceCommit.slice(0, 12)}`,
    imageName: `idea-trace-validation:${releaseId}`,
    imageId,
    ociArchive: {
      basename: basename(archivePath),
      sizeBytes: archiveStat.size,
      sha256: await hashFile(archivePath),
      mediaType: "application/vnd.oci.image.layout.v1+tar",
    },
    baseImages: lock.map((image) => ({
      role: image.role,
      repository: image.repository,
      versionTag: image.versionTag,
      digest: image.platformDigests[platform],
      platform,
    })),
    migrationCatalog: await Promise.all(
      migrationPaths.map(async ([id, path, ledger]) => ({
        id,
        sha256: await hashFile(join(root, path)),
        ledger,
      })),
    ),
    webAssetsSha256: await hashTree(join(root, "apps/web/dist")),
    openapiSha256: await hashFile(join(root, "openapi/lp03.v1.json")),
    verification: {
      command: "npm run verify",
      commit: sourceCommit,
      status: "PASS",
      completedAt: new Date().toISOString(),
      logSha256: sha256(verificationLog),
    },
    syntheticDataOnly: true,
  };
  manifest.manifestSha256 = canonicalSha256(manifest, ["manifestSha256"]);
  verifyReleaseCandidateManifest(manifest);
  const manifestPath = join(candidateRoot, "manifest.json");
  await atomicWrite(manifestPath, canonicalJson(manifest), 0o644);
  await chmod(manifestPath, 0o444);
  process.stdout.write(`${manifestPath}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "CANDIDATE_BUILD_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
