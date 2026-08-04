import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseHostActiveRuntime,
  type HostActiveRuntime,
} from "./host-active-operations.js";
import {
  parseProductionDatabasePrincipal,
  type ProductionDatabasePrincipal,
} from "./database-principal.js";
import { canonicalJson, canonicalSha256 } from "../shared/canonical-json.js";
import { exactKeys, record, type JsonRecord } from "../shared/contracts.js";

export interface AttemptRuntimeBinding {
  schemaVersion: "2.0";
  attemptId: string;
  runtime: HostActiveRuntime;
  productionDatabase: ProductionDatabasePrincipal;
  previousEnvironmentSha256: string;
  bindingSha256: string;
}

export const createAttemptRuntimeBinding = (input: {
  attemptId: string;
  runtime: HostActiveRuntime;
  productionDatabase: ProductionDatabasePrincipal;
  previousEnvironment: unknown;
}): AttemptRuntimeBinding => {
  if (!/^deploy_[A-Za-z0-9_-]{6,64}$/u.test(input.attemptId))
    throw new Error("DEPLOYMENT_RUNTIME_ATTEMPT_ID");
  const binding: AttemptRuntimeBinding = {
    schemaVersion: "2.0",
    attemptId: input.attemptId,
    runtime: parseHostActiveRuntime(input.runtime),
    productionDatabase: parseProductionDatabasePrincipal(
      input.productionDatabase,
    ),
    previousEnvironmentSha256: canonicalSha256({
      previousEnvironment: input.previousEnvironment,
    }),
    bindingSha256: "",
  };
  binding.bindingSha256 = canonicalSha256(binding as unknown as JsonRecord, [
    "bindingSha256",
  ]);
  return binding;
};

export const verifyAttemptRuntimeBinding = (
  value: unknown,
): AttemptRuntimeBinding => {
  const input = record(value, "DEPLOYMENT_RUNTIME_BINDING");
  exactKeys(
    input,
    [
      "schemaVersion",
      "attemptId",
      "runtime",
      "productionDatabase",
      "previousEnvironmentSha256",
      "bindingSha256",
    ],
    "DEPLOYMENT_RUNTIME_BINDING",
  );
  if (
    input.schemaVersion !== "2.0" ||
    typeof input.attemptId !== "string" ||
    !/^deploy_[A-Za-z0-9_-]{6,64}$/u.test(input.attemptId) ||
    typeof input.previousEnvironmentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(input.previousEnvironmentSha256) ||
    typeof input.bindingSha256 !== "string" ||
    canonicalSha256(input, ["bindingSha256"]) !== input.bindingSha256
  )
    throw new Error("DEPLOYMENT_RUNTIME_BINDING_INVALID");
  return {
    schemaVersion: "2.0",
    attemptId: input.attemptId,
    runtime: parseHostActiveRuntime(input.runtime),
    productionDatabase: parseProductionDatabasePrincipal(
      input.productionDatabase,
    ),
    previousEnvironmentSha256: input.previousEnvironmentSha256,
    bindingSha256: input.bindingSha256,
  };
};

export const attemptRuntimeBindingPath = (
  stateRoot: string,
  attemptId: string,
): string => path.join(stateRoot, "attempts", `${attemptId}.runtime.json`);

export const readAttemptRuntimeBinding = async (
  stateRoot: string,
  attemptId: string,
): Promise<AttemptRuntimeBinding> =>
  verifyAttemptRuntimeBinding(
    JSON.parse(
      await readFile(attemptRuntimeBindingPath(stateRoot, attemptId), "utf8"),
    ),
  );

export const assertRuntimeBindingRequest = (input: {
  binding: AttemptRuntimeBinding;
  attemptId: string;
  runtime: HostActiveRuntime;
  productionDatabase: ProductionDatabasePrincipal;
  previousEnvironment: unknown;
}): void => {
  const expected = createAttemptRuntimeBinding(input);
  if (canonicalJson(input.binding) !== canonicalJson(expected))
    throw new Error("DEPLOYMENT_RUNTIME_BINDING_CHANGED");
};
