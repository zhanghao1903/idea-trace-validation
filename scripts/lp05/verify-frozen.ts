import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const frozen = new Map([
  [
    "openapi/lp03.v1.json",
    "fe853576812ae5d133f6d2880c3b2d3cb07de3f7dbe49471953d4bb6105cd18c",
  ],
  [
    "package-lock.json",
    "f5663e96e0b914c2ceb234f869f5b92bce05d15e3934091c97c06c4523123b67",
  ],
  [
    "packages/db/migrations/0001_lp01_core.sql",
    "e8edd4cea0668ece3282f3dc8fedae292b2b9d90ed16f02bfbcad9b06bf25e70",
  ],
  [
    "packages/db/migrations/0002_lp02_execution_decisions.sql",
    "2c262ea46ab82cfbc4c120c202a34600dbb69388f75383f075ec4a1870f679c8",
  ],
  [
    "packages/db/migrations/0003_lp03_reporting_experience.sql",
    "695144b211a8a8be3c3feac30f8edc0ecdf2bf5ed61571106be8e1f2996c578a",
  ],
]);

const fileSha = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolve(hash.digest("hex")));
  });

export const verifyFrozenArtifacts = async (): Promise<void> => {
  for (const [path, expected] of frozen) {
    if ((await fileSha(path)) !== expected)
      throw new Error(`FROZEN_ARTIFACT_CHANGED:${path}`);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyFrozenArtifacts()
    .then(() => process.stdout.write("LP05_FROZEN_ARTIFACTS_PASS\n"))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "FROZEN_CHECK_FAILED"}\n`,
      );
      process.exitCode = 1;
    });
}
