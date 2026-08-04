import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  acquireAttemptLock,
  bindEnvelopeToAttempt,
  releaseAttemptLock,
} from "./attempt-lock.js";
import {
  finalizeAttemptRecord,
  verifyAttemptRecord,
  writeAttemptRecord,
} from "./attempt-record.js";
import { interruptAttempt, resumeInterruptedAttempt } from "./attempt-state.js";
import {
  assertControllerInitialAttempt,
  recoverDeploymentFailure,
  runDeployment,
} from "./controller.js";
import {
  createHostActiveDeploymentOperations,
  parseHostActiveRuntime,
} from "./host-active-operations.js";
import { createActiveDeploymentOracles } from "./active-oracles.js";
import { createHostRollbackAdapter } from "./host-rollback.js";
import { rollbackApplication } from "./rollback.js";
import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import {
  exactKeys,
  record,
  verifyDeploymentAuthorizationEnvelope,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite, exists } from "../shared/filesystem.js";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

const main = async (): Promise<void> => {
  const requestPath = argument("--request");
  const request = record(
    JSON.parse(await readFile(requestPath, "utf8")),
    "DEPLOYMENT_CONTROLLER_REQUEST",
  );
  exactKeys(
    request,
    [
      "schemaVersion",
      "stateRoot",
      "envelope",
      "attempt",
      "runtime",
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
  const requestedAttempt = attempt;
  const runtime = parseHostActiveRuntime(request.runtime);
  const authorization = record(
    record(request.envelope, "DEPLOYMENT_ENVELOPE").authorization,
    "DEPLOYMENT_AUTHORIZATION",
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
  const authorityFields = [
    "attemptId",
    "envelopeId",
    "envelopeSha256",
    "candidate",
    "target",
    "previousRelease",
  ] as const;
  const verifyCurrentAuthority = async (
    currentAttempt: JsonRecord,
  ): Promise<void> => {
    const currentRequest = record(
      JSON.parse(await readFile(requestPath, "utf8")),
      "DEPLOYMENT_CONTROLLER_REQUEST",
    );
    exactKeys(
      currentRequest,
      [
        "schemaVersion",
        "stateRoot",
        "envelope",
        "attempt",
        "runtime",
        "previousEnvironment",
      ],
      "DEPLOYMENT_CONTROLLER_REQUEST",
    );
    if (
      currentRequest.schemaVersion !== "1.0" ||
      currentRequest.stateRoot !== request.stateRoot ||
      canonicalJson(currentRequest.envelope) !==
        canonicalJson(request.envelope) ||
      canonicalJson(parseHostActiveRuntime(currentRequest.runtime)) !==
        canonicalJson(runtime) ||
      canonicalJson(currentRequest.previousEnvironment) !==
        canonicalJson(request.previousEnvironment)
    )
      throw new Error("DEPLOYMENT_AUTHORITY_CHANGED");
    const envelope = verifyDeploymentAuthorizationEnvelope(
      currentRequest.envelope,
      new Date(),
      {
        workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
        featureId: "lp-05-deployment-release-8c3f1a6d5e20",
        sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
      },
    );
    const currentRequestedAttempt = verifyAttemptRecord(currentRequest.attempt);
    const proposal = record(envelope.proposal, "DEPLOYMENT_PROPOSAL");
    if (
      currentAttempt.envelopeId !== envelope.envelopeId ||
      currentAttempt.envelopeSha256 !== envelope.envelopeSha256 ||
      canonicalJson(currentAttempt.candidate) !==
        canonicalJson(proposal.candidate) ||
      canonicalJson(currentAttempt.target) !== canonicalJson(proposal.target) ||
      canonicalJson(currentAttempt.previousRelease) !==
        canonicalJson(proposal.previousRelease)
    )
      throw new Error("DEPLOYMENT_ATTEMPT_AUTHORITY_MISMATCH");
    for (const field of authorityFields) {
      if (
        canonicalJson(currentAttempt[field]) !==
          canonicalJson(requestedAttempt[field]) ||
        canonicalJson(currentRequestedAttempt[field]) !==
          canonicalJson(requestedAttempt[field])
      )
        throw new Error(`DEPLOYMENT_AUTHORITY_CHANGED:${field}`);
    }
  };
  const target = record(attempt.target, "DEPLOYMENT_CONTROLLER_TARGET");
  const attemptPath = path.join(
    stateRoot,
    "attempts",
    `${String(attempt.attemptId)}.json`,
  );
  const runtimeBindingPath = path.join(
    stateRoot,
    "attempts",
    `${String(attempt.attemptId)}.runtime.json`,
  );
  const runtimeBinding: JsonRecord = {
    schemaVersion: "1.0",
    attemptId: attempt.attemptId,
    runtime,
    previousEnvironmentSha256: canonicalSha256({
      previousEnvironment: request.previousEnvironment,
    }),
    bindingSha256: "",
  };
  runtimeBinding.bindingSha256 = canonicalSha256(runtimeBinding, [
    "bindingSha256",
  ]);
  const lock = await acquireAttemptLock(
    stateRoot,
    String(target.targetId),
    String(attempt.attemptId),
  );
  try {
    if (await exists(attemptPath)) {
      const existing = verifyAttemptRecord(
        JSON.parse(await readFile(attemptPath, "utf8")),
      );
      for (const field of [
        "attemptId",
        "envelopeId",
        "envelopeSha256",
        "candidate",
        "target",
        "previousRelease",
      ] as const)
        if (canonicalJson(existing[field]) !== canonicalJson(attempt[field]))
          throw new Error(`DEPLOYMENT_ATTEMPT_AUTHORITY_MISMATCH:${field}`);
      attempt = existing;
      if (!(await exists(runtimeBindingPath)))
        throw new Error("DEPLOYMENT_RUNTIME_BINDING_MISSING");
      const persistedRuntime = record(
        JSON.parse(await readFile(runtimeBindingPath, "utf8")),
        "DEPLOYMENT_RUNTIME_BINDING",
      );
      exactKeys(
        persistedRuntime,
        [
          "schemaVersion",
          "attemptId",
          "runtime",
          "previousEnvironmentSha256",
          "bindingSha256",
        ],
        "DEPLOYMENT_RUNTIME_BINDING",
      );
      if (
        persistedRuntime.schemaVersion !== "1.0" ||
        persistedRuntime.bindingSha256 !==
          canonicalSha256(persistedRuntime, ["bindingSha256"]) ||
        canonicalJson(persistedRuntime) !== canonicalJson(runtimeBinding)
      )
        throw new Error("DEPLOYMENT_RUNTIME_BINDING_CHANGED");
    } else {
      assertControllerInitialAttempt(attempt);
      await verifyCurrentAuthority(attempt);
      await bindEnvelopeToAttempt(
        stateRoot,
        String(attempt.envelopeId),
        String(attempt.attemptId),
      );
      await atomicWrite(
        runtimeBindingPath,
        canonicalJson(runtimeBinding),
        0o600,
      );
      await writeAttemptRecord(attemptPath, null, attempt);
    }
    if (
      (attempt.previousRelease === null) !==
      (request.previousEnvironment === null)
    )
      throw new Error("DEPLOYMENT_PREVIOUS_ENVIRONMENT_MISMATCH");
    const rollbackAdapter = createHostRollbackAdapter({
      attempt,
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
    const rollback = async (currentAttempt: JsonRecord): Promise<JsonRecord> =>
      rollbackApplication({
        previousRelease:
          currentAttempt.previousRelease === null
            ? null
            : record(
                currentAttempt.previousRelease,
                "DEPLOYMENT_PREVIOUS_RELEASE",
              ),
        adapter: rollbackAdapter,
      });
    const operations = createHostActiveDeploymentOperations({
      runtime,
      envelope: request.envelope,
      rollback,
    });
    const oracles = createActiveDeploymentOracles({
      evidenceRoot: runtime.evidenceRoot,
      operations,
    });
    if (
      lock.recovered &&
      !["DEPLOYED", "ROLLED_BACK", "ROLLBACK_FAILED"].includes(
        String(attempt.currentState),
      )
    ) {
      const lateRecoveryStates = [
        "POST_DEPLOY_BACKUP_VERIFIED",
        "RESTORE_ENV_READY",
        "RESTORE_VERIFIED",
        "PRODUCTION_UNCHANGED_VERIFIED",
        "POST_RESTORE_SMOKE_PASSED",
        "RESUMING",
        "FAILED",
        "ROLLING_BACK",
      ];
      let recoveryReason: Error | null = lateRecoveryStates.includes(
        String(attempt.currentState),
      )
        ? new Error("STALE_RESTORE_OPERATION_REQUIRES_TERMINAL_RECOVERY")
        : null;
      if (recoveryReason === null) {
        try {
          await verifyCurrentAuthority(attempt);
        } catch (error) {
          recoveryReason =
            error instanceof Error
              ? error
              : new Error("DEPLOYMENT_AUTHORITY_REVALIDATION_FAILED");
        }
      }
      if (recoveryReason !== null) {
        const recovered = await recoverDeploymentFailure({
          attempt,
          oracles,
          persist: async (previous, next) =>
            writeAttemptRecord(attemptPath, previous, next),
          error: recoveryReason,
        });
        process.stdout.write(`${canonicalJson(recovered)}\n`);
        if (recovered.currentState !== "DEPLOYED") process.exitCode = 2;
        return;
      }
      if (attempt.currentState !== "INTERRUPTED") {
        const interrupted = finalizeAttemptRecord(
          interruptAttempt(attempt, {
            occurredAt: new Date().toISOString(),
            reasonCode: "STALE_PROCESS_LOCK_RECOVERED",
          }),
        );
        await writeAttemptRecord(attemptPath, attempt, interrupted);
        attempt = interrupted;
      }
    } else if (
      !lock.recovered &&
      !["PREPARED", "INTERRUPTED", "DEPLOYED"].includes(
        String(attempt.currentState),
      )
    ) {
      throw new Error("DEPLOYMENT_FORWARD_REENTRY_REQUIRES_STALE_LOCK");
    }
    if (attempt.currentState === "INTERRUPTED") {
      try {
        await verifyCurrentAuthority(attempt);
      } catch (error) {
        const recovered = await recoverDeploymentFailure({
          attempt,
          oracles,
          persist: async (previous, next) =>
            writeAttemptRecord(attemptPath, previous, next),
          error,
        });
        process.stdout.write(`${canonicalJson(recovered)}\n`);
        if (recovered.currentState !== "DEPLOYED") process.exitCode = 2;
        return;
      }
      const resumed = finalizeAttemptRecord(
        resumeInterruptedAttempt(attempt, {
          occurredAt: new Date().toISOString(),
          reasonCode: "BOUNDED_PROCESS_RESUME",
        }),
      );
      await writeAttemptRecord(attemptPath, attempt, resumed);
      attempt = resumed;
    }
    const finalAttempt = await runDeployment({
      envelope: request.envelope,
      attempt,
      oracles,
      revalidate: verifyCurrentAuthority,
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
