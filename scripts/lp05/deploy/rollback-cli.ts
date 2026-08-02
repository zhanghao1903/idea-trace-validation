import { readFile } from "node:fs/promises";
import path from "node:path";

import { acquireAttemptLock, releaseAttemptLock } from "./attempt-lock.js";
import {
  finalizeAttemptRecord,
  verifyAttemptRecord,
  writeAttemptRecord,
} from "./attempt-record.js";
import { transitionAttempt } from "./attempt-state.js";
import { createHostRollbackAdapter } from "./host-rollback.js";
import { rollbackApplication } from "./rollback.js";
import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  exactKeys,
  record,
  verifyDeploymentAuthorizationEnvelope,
} from "../shared/contracts.js";

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
    "ROLLBACK_REQUEST",
  );
  exactKeys(
    request,
    [
      "schemaVersion",
      "stateRoot",
      "envelope",
      "attemptPath",
      "previousEnvironment",
    ],
    "ROLLBACK_REQUEST",
  );
  if (
    request.schemaVersion !== "1.0" ||
    typeof request.stateRoot !== "string" ||
    typeof request.attemptPath !== "string"
  )
    throw new Error("ROLLBACK_REQUEST_VALUE");
  verifyDeploymentAuthorizationEnvelope(request.envelope, new Date());
  const stateRoot = path.resolve(request.stateRoot);
  const attemptPath = path.resolve(request.attemptPath);
  if (
    !path.isAbsolute(request.stateRoot) ||
    !path.isAbsolute(request.attemptPath) ||
    stateRoot === "/" ||
    !attemptPath.startsWith(`${stateRoot}${path.sep}attempts${path.sep}`)
  )
    throw new Error("ROLLBACK_PATH_UNSAFE");
  let attempt = verifyAttemptRecord(
    JSON.parse(await readFile(attemptPath, "utf8")),
  );
  const envelope = record(request.envelope, "ROLLBACK_ENVELOPE");
  if (
    attempt.envelopeId !== envelope.envelopeId ||
    attempt.envelopeSha256 !== envelope.envelopeSha256
  )
    throw new Error("ROLLBACK_ENVELOPE_MISMATCH");
  if (attempt.currentState === "ROLLED_BACK") {
    process.stdout.write(`${canonicalJson(attempt)}\n`);
    return;
  }
  if (!["FAILED", "ROLLING_BACK"].includes(String(attempt.currentState)))
    throw new Error("ROLLBACK_STATE_INVALID");
  const target = record(attempt.target, "ROLLBACK_TARGET");
  if (
    (attempt.previousRelease === null) !==
    (request.previousEnvironment === null)
  )
    throw new Error("ROLLBACK_PREVIOUS_ENVIRONMENT_MISMATCH");
  const lock = await acquireAttemptLock(
    stateRoot,
    String(target.targetId),
    String(attempt.attemptId),
  );
  try {
    if (attempt.currentState === "FAILED") {
      const next = finalizeAttemptRecord(
        transitionAttempt(attempt, {
          to: "ROLLING_BACK",
          occurredAt: new Date().toISOString(),
          reasonCode: "MANUAL_ROLLBACK_STARTED",
          evidenceSha256: sha256("MANUAL_ROLLBACK_STARTED"),
          projection: { rollback: attempt.rollback },
        }),
      );
      await writeAttemptRecord(attemptPath, attempt, next);
      attempt = next;
    }
    const evidence = await rollbackApplication({
      previousRelease:
        attempt.previousRelease === null
          ? null
          : record(attempt.previousRelease, "ROLLBACK_PREVIOUS_RELEASE"),
      adapter: createHostRollbackAdapter({
        composeProject: String(target.composeProject),
        publicOrigin: `https://${String(target.domain)}/`,
        previousEnvironment:
          request.previousEnvironment === null
            ? null
            : record(
                request.previousEnvironment,
                "ROLLBACK_PREVIOUS_ENVIRONMENT",
              ),
      }),
    });
    const next = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to:
          evidence.status === "PASS" || evidence.status === "NOT_APPLICABLE"
            ? "ROLLED_BACK"
            : "ROLLBACK_FAILED",
        occurredAt: new Date().toISOString(),
        reasonCode: String(evidence.reasonCode),
        evidenceSha256: canonicalSha256(evidence),
        projection: { rollback: evidence },
      }),
    );
    await writeAttemptRecord(attemptPath, attempt, next);
    process.stdout.write(`${canonicalJson(next)}\n`);
  } finally {
    await releaseAttemptLock(lock);
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "ROLLBACK_FAILED"}\n`,
  );
  process.exitCode = 1;
});
