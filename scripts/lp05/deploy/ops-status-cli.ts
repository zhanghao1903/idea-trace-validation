import { readFile } from "node:fs/promises";

import {
  evaluateOperations,
  type OperationsObservation,
} from "./ops-status.js";

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--observations");
  const path = index >= 0 ? process.argv[index + 1] : undefined;
  if (path === undefined) throw new Error("OPS_OBSERVATIONS_REQUIRED");
  const observations = JSON.parse(
    await readFile(path, "utf8"),
  ) as OperationsObservation;
  const result = evaluateOperations(observations);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "OPS_STATUS_FAILED"}\n`,
  );
  process.exitCode = 1;
});
