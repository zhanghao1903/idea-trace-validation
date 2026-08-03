import { lstat, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { verifyBackupManifest, type JsonRecord } from "../shared/contracts.js";
import { assertContainedPath } from "../shared/filesystem.js";

export interface RetentionCandidate {
  manifest: JsonRecord;
  manifestPath: string;
  ciphertextPath: string;
}

export const planRetention = (
  candidates: readonly RetentionCandidate[],
  pinnedBackupIds: ReadonlySet<string>,
  keep = 7,
): RetentionCandidate[] => {
  if (keep !== 7) throw new Error("RETENTION_POLICY_INVALID");
  const sorted = [...candidates].sort((left, right) =>
    String(right.manifest.createdAt).localeCompare(
      String(left.manifest.createdAt),
    ),
  );
  const retained = new Set(
    sorted
      .slice(0, keep)
      .map((candidate) => String(candidate.manifest.backupId)),
  );
  return sorted.filter(
    (candidate) =>
      !retained.has(String(candidate.manifest.backupId)) &&
      !pinnedBackupIds.has(String(candidate.manifest.backupId)),
  );
};

export const discoverVerifiedBackups = async (
  root: string,
): Promise<RetentionCandidate[]> => {
  const result: RetentionCandidate[] = [];
  for (const entry of await readdir(root)) {
    if (!entry.endsWith(".manifest.json")) continue;
    const manifestPath = await assertContainedPath(root, join(root, entry));
    const manifestStat = await lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink())
      throw new Error("RETENTION_MANIFEST_INVALID");
    const manifest = verifyBackupManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const ciphertext = manifest.ciphertext as JsonRecord;
    const ciphertextPath = await assertContainedPath(
      root,
      join(root, String(ciphertext.basename)),
    );
    const ciphertextStat = await lstat(ciphertextPath);
    if (
      !ciphertextStat.isFile() ||
      ciphertextStat.isSymbolicLink() ||
      ciphertextStat.size !== ciphertext.sizeBytes
    )
      throw new Error("RETENTION_PAIR_INVALID");
    result.push({ manifest, manifestPath, ciphertextPath });
  }
  return result;
};

export const quarantineExpiredBackups = async (
  root: string,
  candidates: readonly RetentionCandidate[],
): Promise<void> => {
  for (const candidate of candidates) {
    const backupId = String(candidate.manifest.backupId);
    await rename(
      candidate.manifestPath,
      await assertContainedPath(
        root,
        join(root, `.expired-${backupId}.manifest.json`),
      ),
    );
    await rename(
      candidate.ciphertextPath,
      await assertContainedPath(
        root,
        join(root, `.expired-${backupId}.dump.age`),
      ),
    );
  }
};
