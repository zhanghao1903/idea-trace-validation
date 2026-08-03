import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { sha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";

const execute = promisify(execFile);

export const verifySyntheticJourney = async (
  runRecordPath: string,
  environment: NodeJS.ProcessEnv,
): Promise<JsonRecord> => {
  await execute(
    "npm",
    ["run", "demo:lp04:verify", "--", "--record", runRecordPath],
    {
      cwd: process.cwd(),
      env: environment,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const record = JSON.parse(
    await readFile(runRecordPath, "utf8"),
  ) as JsonRecord;
  if (
    record.result !== "PASS" ||
    typeof record.resources !== "object" ||
    record.resources === null
  )
    throw new Error("SMOKE_DEMO_INVALID");
  const resourceIds = Object.values(record.resources as JsonRecord)
    .filter((value): value is string => typeof value === "string")
    .sort();
  return {
    syntheticStorySha256: sha256(JSON.stringify(record)),
    resourceIdsSha256: sha256(JSON.stringify(resourceIds)),
    status: "PASS",
  };
};
