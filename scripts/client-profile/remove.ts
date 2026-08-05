import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, requiredValue } from "./cli-args.js";
import { removeProfile } from "./profile-store.js";

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2), ["--profile"], []);
  const profilePath = path.resolve(requiredValue(args, "--profile"));
  const removed = await removeProfile(profilePath);
  console.log(
    JSON.stringify({
      ok: true,
      code: removed ? "PROFILE_REMOVED" : "PROFILE_ABSENT",
      profilePath,
    }),
  );
};

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFile
) {
  run().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        code: error instanceof Error ? error.message : "PROFILE_REMOVE_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
