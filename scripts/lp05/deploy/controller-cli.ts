import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  acquireAttemptLock,
  bindEnvelopeToAttempt,
  releaseAttemptLock,
} from "./attempt-lock.js";
import {
  verifyAttemptRecord,
  finalizeAttemptRecord,
  writeAttemptRecord,
} from "./attempt-record.js";
import { resumeInterruptedAttempt } from "./attempt-state.js";
import { runDeployment } from "./controller.js";
import {
  createEvidenceOracles,
  verifyCompleteEvidenceBundle,
} from "./evidence-oracles.js";
import { createHostRollbackAdapter } from "./host-rollback.js";
import { rollbackApplication } from "./rollback.js";
import { parseDeploymentEvidenceBundle } from "./runtime-evidence.js";
import { canonicalJson } from "../shared/canonical-json.js";
import { exactKeys, record } from "../shared/contracts.js";
import { exists } from "../shared/filesystem.js";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

const main = async (): Promise<void> => {
  const request = record(
    JSON.parse(await readFile(argument("--request"), "utf8")),
    "DEPLOYMENT_CONTROLLER_REQUEST",
  );
  exactKeys(
    request,
    [
      "schemaVersion",
      "stateRoot",
      "envelope",
      "attempt",
      "evidence",
      "previousEnvironment",
    ],
    "DEPLOYMENT_CONTROLLER_REQUEST",
  );
  if (request.schemaVersion !== "1.0" || typeof request.stateRoot !== "string")
    throw new Error("DEPLOYMENT_CONTROLLER_REQUEST_VALUE");
  const stateRoot = path.resolve(request.stateRoot);
  if (!path.isAbsolute(request.stateRoot) || stateRoot === "/")
    throw new Error("DEPLOYMENT_STATE_ROOT_UNSAFE");
  await mkdir(path.join(stateRoot, "attempts"), {
    recursive: true,
    mode: 0o700,
  });
  let attempt = verifyAttemptRecord(request.attempt);
  const target = record(attempt.target, "DEPLOYMENT_CONTROLLER_TARGET");
  const attemptPath = path.join(
    stateRoot,
    "attempts",
    `${String(attempt.attemptId)}.json`,
  );
  const lock = await acquireAttemptLock(
    stateRoot,
    String(target.targetId),
    String(attempt.attemptId),
  );
  try {
    await bindEnvelopeToAttempt(
      stateRoot,
      String(attempt.envelopeId),
      String(attempt.attemptId),
    );
    if (await exists(attemptPath)) {
      const existing = verifyAttemptRecord(
        JSON.parse(await readFile(attemptPath, "utf8")),
      );
      if (canonicalJson(existing) !== canonicalJson(attempt))
        throw new Error("DEPLOYMENT_ATTEMPT_STATE_MISMATCH");
    } else {
      await writeAttemptRecord(attemptPath, null, attempt);
    }
    if (attempt.currentState === "INTERRUPTED") {
      const resumed = finalizeAttemptRecord(
        resumeInterruptedAttempt(attempt, {
          occurredAt: new Date().toISOString(),
          reasonCode: "BOUNDED_PROCESS_RESUME",
        }),
      );
      await writeAttemptRecord(attemptPath, attempt, resumed);
      attempt = resumed;
    }
    const bundle = parseDeploymentEvidenceBundle(request.evidence);
    verifyCompleteEvidenceBundle(bundle, attempt);
    if (
      (attempt.previousRelease === null) !==
      (request.previousEnvironment === null)
    )
      throw new Error("DEPLOYMENT_PREVIOUS_ENVIRONMENT_MISMATCH");
    const rollbackAdapter = createHostRollbackAdapter({
      composeProject: String(target.composeProject),
      publicOrigin: `https://${String(target.domain)}/`,
      previousEnvironment:
        request.previousEnvironment === null
          ? null
          : record(
              request.previousEnvironment,
              "DEPLOYMENT_PREVIOUS_ENVIRONMENT",
            ),
    });
    const finalAttempt = await runDeployment({
      envelope: request.envelope,
      attempt,
      oracles: createEvidenceOracles({
        bundle,
        rollback: async () =>
          rollbackApplication({
            previousRelease:
              attempt.previousRelease === null
                ? null
                : record(
                    attempt.previousRelease,
                    "DEPLOYMENT_PREVIOUS_RELEASE",
                  ),
            adapter: rollbackAdapter,
          }),
      }),
      persist: async (previous, next) =>
        writeAttemptRecord(attemptPath, previous, next),
    });
    process.stdout.write(`${canonicalJson(finalAttempt)}\n`);
    if (finalAttempt.currentState !== "DEPLOYED") process.exitCode = 2;
  } finally {
    await releaseAttemptLock(lock);
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "DEPLOYMENT_CONTROLLER_FAILED"}\n`,
  );
  process.exitCode = 1;
});
