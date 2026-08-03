import { readFile } from "node:fs/promises";

import { runExternalSmoke } from "./external.js";
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
  if (input.mode !== "LOCAL")
    throw new Error("SMOKE_EXTERNAL_OBSERVATIONS_FORBIDDEN");
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
  const observationsIndex = process.argv.indexOf("--observations");
  const requestIndex = process.argv.indexOf("--request");
  const observationsPath =
    observationsIndex >= 0 ? process.argv[observationsIndex + 1] : undefined;
  const requestPath =
    requestIndex >= 0 ? process.argv[requestIndex + 1] : undefined;
  if ((observationsPath === undefined) === (requestPath === undefined))
    throw new Error("SMOKE_INPUT_EXACTLY_ONE_REQUIRED");
  const input = record(
    JSON.parse(await readFile(observationsPath ?? String(requestPath), "utf8")),
    observationsPath === undefined
      ? "SMOKE_EXTERNAL_REQUEST"
      : "SMOKE_OBSERVATIONS",
  );
  const evidence =
    observationsPath === undefined
      ? await runExternalSmoke(input)
      : buildSmokeEvidence(input as unknown as SmokeObservationInput);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "SMOKE_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
