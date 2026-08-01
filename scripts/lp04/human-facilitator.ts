import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeHumanControlToken } from "@idea/application";

import { normalizeLoopbackOrigin } from "./environment.js";
import { deriveRequestId } from "./request-identity.js";
import { readRunRecord, writeRunRecord } from "./run-record.js";
import { loadScenarioAssets } from "./scenario.js";

const asObject = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const responseJson = async (
  response: Response,
): Promise<Record<string, unknown>> =>
  asObject(await response.json(), "FACILITATOR_RESPONSE_INVALID");

export const completeGovernedProject = async (input: {
  repoRoot: string;
  baseUrl: string;
  proofRoot: string;
  runId: string;
  humanControlToken: string;
  allowSyntheticDemo: boolean;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{ projectId: string; confirmationId: string }> => {
  if (!input.allowSyntheticDemo) throw new Error("HUMAN_DEMO_OPT_IN_REQUIRED");
  decodeHumanControlToken(input.humanControlToken);
  const baseOrigin = normalizeLoopbackOrigin(input.baseUrl);
  const record = await readRunRecord(input.proofRoot, input.runId);
  const assets = await loadScenarioAssets(input.repoRoot);
  if (record.manifestSha256 !== assets.manifestSha256)
    throw new Error("HUMAN_DEMO_MANIFEST_CONFLICT");
  const projectId = record.resourceRefs.governedProjectId;
  const conclusionId = record.resourceRefs.governedConclusionId;
  if (projectId === undefined || conclusionId === undefined)
    throw new Error("GOVERNED_FIXTURE_MISSING");
  const fetchImpl = input.fetchImpl ?? fetch;
  const projectRead = await fetchImpl(
    new URL(`/api/v1/projects/${projectId}?view=proposer`, baseOrigin),
  );
  const projectJson = await responseJson(projectRead);
  if (projectRead.status !== 200)
    throw new Error("GOVERNED_PROJECT_READ_FAILED");
  const project = asObject(
    asObject(projectJson.data, "FACILITATOR_DATA_INVALID").project,
    "FACILITATOR_PROJECT_INVALID",
  );
  const authority = asObject(
    project.authority,
    "FACILITATOR_AUTHORITY_INVALID",
  );
  const expectedVersion = Number(authority.version);
  const actor = {
    actorType: "HUMAN",
    role: "PROPOSER",
    displayName: "合成人类演示者",
  } as const;
  const createKey = deriveRequestId({
    runId: input.runId,
    manifestSha256: record.manifestSha256,
    stepId: "human-confirmation-create",
    semanticAttempt: 0,
  });
  const create = await fetchImpl(
    new URL(`/api/v1/projects/${projectId}/human-confirmations`, baseOrigin),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": createKey,
        "x-human-control-token": input.humanControlToken,
      },
      body: JSON.stringify({
        expectedVersion,
        operation: "COMPLETE_PROJECT",
        conclusionId,
        completionSummary: "SYNTHETIC_DEMO_DATA 人类确认完成合成项目",
        actor,
        reason: "SYNTHETIC_DEMO_DATA facilitator creates confirmation",
      }),
    },
  );
  const createJson = await responseJson(create);
  if (create.status !== 201) {
    const error = asObject(createJson.error, "CONFIRMATION_CREATE_ERROR");
    throw new Error(
      `CONFIRMATION_CREATE_FAILED:${create.status}:${String(error.code ?? "UNKNOWN")}`,
    );
  }
  const createData = asObject(createJson.data, "CONFIRMATION_CREATE_DATA");
  const confirmation = asObject(
    createData.confirmation,
    "CONFIRMATION_CREATE_CONFIRMATION",
  );
  const confirmationId = String(confirmation.id);
  const createdProject = asObject(
    createData.project,
    "CONFIRMATION_CREATE_PROJECT",
  );
  const decisionVersion = Number(createdProject.version);
  const setCookie = create.headers.get("set-cookie");
  if (setCookie === null) throw new Error("CONFIRMATION_CAPABILITY_MISSING");
  const cookie = setCookie.split(";", 1)[0];
  if (cookie === undefined || cookie.length === 0)
    throw new Error("CONFIRMATION_CAPABILITY_INVALID");
  const decisionKey = deriveRequestId({
    runId: input.runId,
    manifestSha256: record.manifestSha256,
    stepId: "human-confirmation-decide",
    semanticAttempt: 0,
  });
  const decision = await fetchImpl(
    new URL(
      `/api/v1/human-confirmations/${confirmationId}/decisions`,
      baseOrigin,
    ),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        cookie,
        "content-type": "application/json",
        "idempotency-key": decisionKey,
      },
      body: JSON.stringify({
        expectedVersion: decisionVersion,
        decision: "APPROVE",
        decisionNote: "SYNTHETIC_DEMO_DATA 人类批准完成",
        actor,
        reason: "SYNTHETIC_DEMO_DATA facilitator decides confirmation",
      }),
    },
  );
  if (decision.status !== 200)
    throw new Error(`CONFIRMATION_DECISION_FAILED:${decision.status}`);
  const finalRead = await fetchImpl(
    new URL(`/api/v1/projects/${projectId}?view=proposer`, baseOrigin),
  );
  const finalJson = await responseJson(finalRead);
  const finalProject = asObject(
    asObject(finalJson.data, "FINAL_DATA_INVALID").project,
    "FINAL_PROJECT_INVALID",
  );
  const finalAuthority = asObject(
    finalProject.authority,
    "FINAL_AUTHORITY_INVALID",
  );
  if (finalAuthority.status !== "COMPLETED")
    throw new Error("GOVERNED_PROJECT_NOT_COMPLETED");
  record.resourceRefs.governedConfirmationId = confirmationId;
  record.assertions = [
    ...record.assertions.filter(
      (item) => item.id !== "human-facilitator-boundary",
    ),
    {
      id: "human-facilitator-boundary",
      result: "PASS",
      detailCode: "SEPARATE_CAPABILITY_COMPLETED",
    },
  ];
  await writeRunRecord(input.proofRoot, record);
  return { projectId, confirmationId };
};

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFile
) {
  const argument = (name: string): string => {
    const index = process.argv.indexOf(name);
    const value = index < 0 ? undefined : process.argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`ARGUMENT_REQUIRED:${name}`);
    return value;
  };
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const humanControlToken = process.env.HUMAN_CONTROL_TOKEN;
  if (humanControlToken === undefined)
    throw new Error("HUMAN_CONTROL_TOKEN_REQUIRED");
  const result = await completeGovernedProject({
    repoRoot,
    baseUrl: argument("--base-url"),
    proofRoot: path.join(repoRoot, ".lp04-demo"),
    runId: argument("--run-id"),
    humanControlToken,
    allowSyntheticDemo: process.argv.includes(
      "--allow-human-control-for-synthetic-demo",
    ),
  });
  console.log(JSON.stringify(result));
}
