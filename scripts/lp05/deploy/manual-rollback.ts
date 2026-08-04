import { readFile } from "node:fs/promises";
import path from "node:path";

import { createActiveDeploymentOracles } from "./active-oracles.js";
import { acquireAttemptLock, releaseAttemptLock } from "./attempt-lock.js";
import { verifyAttemptRecord, writeAttemptRecord } from "./attempt-record.js";
import { loadDeploymentConfig } from "./config.js";
import { recoverDeploymentFailure } from "./controller.js";
import {
  createHostActiveDeploymentOperations,
  defaultHostDockerRunner,
  type HostDockerRunner,
} from "./host-active-operations.js";
import { createHostRollbackAdapter } from "./host-rollback.js";
import { rollbackApplication } from "./rollback.js";
import { resolveReconciledPersistedTerminalRollbackEvidence } from "./rollback-cleanup.js";
import {
  assertRuntimeBindingRequest,
  readAttemptRuntimeBinding,
} from "./runtime-binding.js";
import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import {
  exactKeys,
  record,
  verifyDeploymentAuthorizationEnvelope,
  type JsonRecord,
} from "../shared/contracts.js";

export interface ManualRollbackDependencies {
  environment?: NodeJS.ProcessEnv;
  runDocker?: HostDockerRunner;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const validateTerminalAttempt = async (input: {
  attempt: JsonRecord;
  evidenceRoot: string;
  productionProject: string;
  restoreProject: string;
  restoreDatabaseName: string;
  runDocker: HostDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<void> => {
  const terminal =
    await resolveReconciledPersistedTerminalRollbackEvidence(input);
  if (terminal.terminalState !== input.attempt.currentState)
    throw new Error("MANUAL_ROLLBACK_TERMINAL_STATE_MISMATCH");
  if (
    terminal.applicationRollbackSha256 !==
    canonicalSha256(record(input.attempt.rollback, "MANUAL_ROLLBACK_EVIDENCE"))
  )
    throw new Error("MANUAL_ROLLBACK_APPLICATION_MISMATCH");
  const transitions = input.attempt.transitionLog;
  if (!Array.isArray(transitions) || transitions.length === 0)
    throw new Error("MANUAL_ROLLBACK_TRANSITION_MISSING");
  const last = record(
    transitions[transitions.length - 1],
    "MANUAL_ROLLBACK_TERMINAL_TRANSITION",
  );
  if (
    last.to !== terminal.terminalState ||
    last.evidenceSha256 !== terminal.evidenceSha256
  )
    throw new Error("MANUAL_ROLLBACK_TERMINAL_AUTHORITY_MISMATCH");
};

export const executeManualRollback = async (
  requestValue: unknown,
  dependencies: ManualRollbackDependencies = {},
): Promise<JsonRecord> => {
  const request = record(requestValue, "ROLLBACK_REQUEST");
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
  const now = dependencies.now ?? (() => new Date());
  const envelopeInput = record(request.envelope, "ROLLBACK_ENVELOPE");
  const authorization = record(
    envelopeInput.authorization,
    "ROLLBACK_AUTHORIZATION",
  );
  verifyDeploymentAuthorizationEnvelope(
    request.envelope,
    new Date(String(authorization.authorizedAt)),
    {
      workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
      featureId: "lp-05-deployment-release-8c3f1a6d5e20",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
    },
  );
  const stateRoot = path.resolve(request.stateRoot);
  const attemptPath = path.resolve(request.attemptPath);
  if (
    !path.isAbsolute(request.stateRoot) ||
    !path.isAbsolute(request.attemptPath) ||
    stateRoot === "/" ||
    !attemptPath.startsWith(`${stateRoot}${path.sep}attempts${path.sep}`)
  )
    throw new Error("ROLLBACK_PATH_UNSAFE");
  const requestedAttempt = verifyAttemptRecord(
    JSON.parse(await readFile(attemptPath, "utf8")),
  );
  if (
    attemptPath !==
    path.join(
      stateRoot,
      "attempts",
      `${String(requestedAttempt.attemptId)}.json`,
    )
  )
    throw new Error("ROLLBACK_ATTEMPT_PATH_MISMATCH");
  const target = record(requestedAttempt.target, "ROLLBACK_TARGET");
  const lock = await acquireAttemptLock(
    stateRoot,
    String(target.targetId),
    String(requestedAttempt.attemptId),
  );
  try {
    const attempt = verifyAttemptRecord(
      JSON.parse(await readFile(attemptPath, "utf8")),
    );
    const envelope = envelopeInput;
    const proposal = record(envelope.proposal, "ROLLBACK_PROPOSAL");
    if (
      attempt.attemptId !== requestedAttempt.attemptId ||
      attempt.envelopeId !== envelope.envelopeId ||
      attempt.envelopeSha256 !== envelope.envelopeSha256 ||
      canonicalJson(attempt.candidate) !==
        canonicalJson(requestedAttempt.candidate) ||
      canonicalJson(attempt.target) !==
        canonicalJson(requestedAttempt.target) ||
      canonicalJson(attempt.previousRelease) !==
        canonicalJson(requestedAttempt.previousRelease) ||
      canonicalJson(attempt.candidate) !== canonicalJson(proposal.candidate) ||
      canonicalJson(attempt.target) !== canonicalJson(proposal.target) ||
      canonicalJson(attempt.previousRelease) !==
        canonicalJson(proposal.previousRelease)
    )
      throw new Error("ROLLBACK_ENVELOPE_MISMATCH");
    if (
      (attempt.previousRelease === null) !==
      (request.previousEnvironment === null)
    )
      throw new Error("ROLLBACK_PREVIOUS_ENVIRONMENT_MISMATCH");

    const environment = dependencies.environment ?? process.env;
    const config = loadDeploymentConfig(environment);
    const binding = await readAttemptRuntimeBinding(
      stateRoot,
      String(attempt.attemptId),
    );
    assertRuntimeBindingRequest({
      binding,
      attemptId: String(attempt.attemptId),
      runtime: binding.runtime,
      productionDatabase: {
        databaseUser: config.postgresUser,
        databaseName: config.postgresDb,
      },
      previousEnvironment: request.previousEnvironment,
    });

    if (
      ["ROLLED_BACK", "ROLLBACK_FAILED"].includes(String(attempt.currentState))
    ) {
      const runtime = record(binding.runtime, "ROLLBACK_RUNTIME");
      const restore = record(runtime.restore, "ROLLBACK_RESTORE_RUNTIME");
      await validateTerminalAttempt({
        attempt,
        evidenceRoot: binding.runtime.evidenceRoot,
        productionProject: String(target.composeProject),
        restoreProject: String(restore.composeProject),
        restoreDatabaseName: String(restore.databaseName),
        runDocker: dependencies.runDocker ?? defaultHostDockerRunner,
        environment,
        now,
      });
      return attempt;
    }
    if (!["FAILED", "ROLLING_BACK"].includes(String(attempt.currentState)))
      throw new Error("ROLLBACK_STATE_INVALID");

    const rollbackAdapter = createHostRollbackAdapter({
      attempt,
      composeProject: String(target.composeProject),
      publicOrigin: `https://${String(target.domain)}/`,
      previousEnvironment:
        request.previousEnvironment === null
          ? null
          : record(
              request.previousEnvironment,
              "ROLLBACK_PREVIOUS_ENVIRONMENT",
            ),
      runDocker:
        dependencies.runDocker === undefined
          ? undefined
          : (args, commandEnvironment) =>
              dependencies.runDocker!(args, commandEnvironment),
      fetchImpl: dependencies.fetchImpl,
    });
    const rollback = (currentAttempt: JsonRecord): Promise<JsonRecord> =>
      rollbackApplication({
        previousRelease:
          currentAttempt.previousRelease === null
            ? null
            : record(
                currentAttempt.previousRelease,
                "ROLLBACK_PREVIOUS_RELEASE",
              ),
        adapter: rollbackAdapter,
      });
    const operations = createHostActiveDeploymentOperations({
      runtime: binding.runtime,
      envelope: request.envelope,
      productionDatabase: binding.productionDatabase,
      rollback,
      environment,
      runDocker: dependencies.runDocker,
      fetchImpl: dependencies.fetchImpl,
      now,
    });
    const oracles = createActiveDeploymentOracles({
      evidenceRoot: binding.runtime.evidenceRoot,
      operations,
    });
    return recoverDeploymentFailure({
      attempt,
      oracles,
      persist: (previous, next) =>
        writeAttemptRecord(attemptPath, previous, next),
      now,
      error: new Error("MANUAL_ROLLBACK_REQUESTED"),
    });
  } finally {
    await releaseAttemptLock(lock);
  }
};
