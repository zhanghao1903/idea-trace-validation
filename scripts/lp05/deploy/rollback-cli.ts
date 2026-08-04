import { readFile } from "node:fs/promises";

import { executeManualRollback } from "./manual-rollback.js";
import { canonicalJson } from "../shared/canonical-json.js";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

const main = async (): Promise<void> => {
  const result = await executeManualRollback(
    JSON.parse(await readFile(argument("--request"), "utf8")),
  );
  process.stdout.write(`${canonicalJson(result)}\n`);
  if (result.currentState !== "ROLLED_BACK") process.exitCode = 2;
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "ROLLBACK_FAILED"}\n`,
  );
  process.exitCode = 1;
});
