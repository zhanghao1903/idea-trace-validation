import { readFile } from "node:fs/promises";

import { finalizeSmokeEvidence } from "./smoke-evidence.js";
import {
  REQUIRED_SMOKE_ASSERTION_IDS,
  record,
  type JsonRecord,
} from "../shared/contracts.js";

export interface SmokeObservationInput {
  mode: "LOCAL" | "EXTERNAL_INITIAL" | "EXTERNAL_POST_RESTORE";
  smokeId: string;
  attemptId: string;
  targetId: string;
  candidateManifestSha256: string;
  origin: string;
  observedAt: string;
  certificate: JsonRecord | null;
  syntheticStorySha256: string;
  resourceIdsSha256: string;
  assertions: JsonRecord[];
}

export const buildSmokeEvidence = (
  input: SmokeObservationInput,
): JsonRecord => {
  const observedIds = input.assertions
    .map((assertion) => String(assertion.id))
    .sort();
  if (observedIds.join("\0") !== [...REQUIRED_SMOKE_ASSERTION_IDS].join("\0"))
    throw new Error("SMOKE_REQUIRED_ASSERTIONS");
  return finalizeSmokeEvidence({
    schemaVersion: "1.0",
    smokeId: input.smokeId,
    mode: input.mode,
    attemptId: input.attemptId,
    targetId: input.targetId,
    candidateManifestSha256: input.candidateManifestSha256,
    origin: input.origin,
    observedAt: input.observedAt,
    certificate: input.certificate,
    syntheticStorySha256: input.syntheticStorySha256,
    resourceIdsSha256: input.resourceIdsSha256,
    assertions: input.assertions,
    status: "PASS",
  });
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--observations");
  const path = index >= 0 ? process.argv[index + 1] : undefined;
  if (path === undefined) throw new Error("SMOKE_OBSERVATIONS_REQUIRED");
  const input = record(
    JSON.parse(await readFile(path, "utf8")),
    "SMOKE_OBSERVATIONS",
  ) as unknown as SmokeObservationInput;
  process.stdout.write(`${JSON.stringify(buildSmokeEvidence(input))}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "SMOKE_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
