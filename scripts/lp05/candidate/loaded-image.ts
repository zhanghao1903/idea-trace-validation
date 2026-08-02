import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export const parseDockerSaveConfigId = (value: string): string => {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1)
    throw new Error("LOADED_IMAGE_MANIFEST_INVALID");
  const record = parsed[0] as { Config?: unknown };
  if (
    typeof record.Config !== "string" ||
    !/^blobs\/sha256\/[0-9a-f]{64}$/u.test(record.Config)
  )
    throw new Error("LOADED_IMAGE_CONFIG_INVALID");
  return `sha256:${record.Config.slice("blobs/sha256/".length)}`;
};

export const inspectLoadedImageConfigId = async (
  imageName: string,
  scratchRoot: string,
): Promise<string> => {
  const archive = join(
    scratchRoot,
    `.loaded-image-${process.pid}-${Date.now()}.tar`,
  );
  try {
    await execute("docker", ["image", "save", "--output", archive, imageName], {
      timeout: 180_000,
      maxBuffer: 256 * 1024,
    });
    const { stdout } = await execute(
      "tar",
      ["-xOf", archive, "manifest.json"],
      { timeout: 30_000, maxBuffer: 256 * 1024 },
    );
    return parseDockerSaveConfigId(stdout);
  } finally {
    await rm(archive, { force: true });
  }
};
