import { canonicalSha256, canonicalJson, sha256 } from "./canonical-json.js";
import type {
  CredentialEvidenceV1,
  DeploymentConnectionHandoffV1,
} from "./contracts.js";
import { requestJson } from "./http.js";
import { assertOpenapiUrl, isLoopbackBaseUrl } from "./url.js";

const REQUIRED_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  "/health/live": ["get"],
  "/health/ready": ["get"],
  "/openapi.json": ["get"],
  "/api/v1/ideas": ["get", "post"],
  "/api/v1/ideas/{ideaId}": ["get"],
  "/api/v1/ideas/{ideaId}/clarifications/{questionId}/answers": ["post"],
  "/api/v1/ideas/{ideaId}/promotions": ["post"],
  "/api/v1/projects": ["get"],
  "/api/v1/projects/{projectId}": ["get"],
  "/api/v1/projects/{projectId}/transitions": ["post"],
  "/api/v1/projects/{projectId}/progress-updates": ["get", "post"],
  "/api/v1/projects/{projectId}/attention-items": ["get", "post"],
  "/api/v1/projects/{projectId}/evidence": ["get", "post"],
  "/api/v1/projects/{projectId}/conclusions": ["get", "post"],
  "/api/v1/projects/{projectId}/reports": ["get", "post"],
  "/api/v1/projects/{projectId}/reports/current": ["get"],
  "/api/v1/projects/{projectId}/history": ["get"],
  "/api/v1/experience/proposer/ideas": ["get"],
  "/api/v1/experience/executor/projects": ["get"],
  "/api/v1/experience/projects/{projectId}": ["get"],
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("OPENAPI_INCOMPATIBLE");
  return value as Record<string, unknown>;
};

export const openapiCompatibilityProjection = (value: unknown): unknown => {
  const document = asRecord(value);
  const paths = asRecord(document.paths);
  const components = asRecord(document.components);
  const securitySchemes = asRecord(components.securitySchemes);
  const aiWrite = asRecord(securitySchemes.aiWrite);
  if (
    document.openapi !== "3.1.0" ||
    aiWrite.type !== "http" ||
    aiWrite.scheme !== "bearer"
  )
    throw new Error("OPENAPI_INCOMPATIBLE");
  for (const path of Object.keys(REQUIRED_OPERATIONS).sort()) {
    const item = asRecord(paths[path]);
    for (const method of REQUIRED_OPERATIONS[path] ?? []) {
      const operation = asRecord(item[method]);
      asRecord(operation.responses);
    }
  }
  // The Skills consume parameters, request/response schemas, actor fields,
  // security declarations and referenced components. Hash the complete
  // canonical document so no consumed contract can drift outside the gate.
  return document;
};

export const openapiCompatibilityDigest = (value: unknown): string =>
  canonicalSha256(openapiCompatibilityProjection(value));

const successStatus = (value: unknown, status: "live" | "ready"): boolean => {
  try {
    const envelope = asRecord(value);
    const data = asRecord(envelope.data);
    return envelope.ok === true && data.status === status;
  } catch {
    return false;
  }
};

export const verifyConnection = async (
  handoff: DeploymentConnectionHandoffV1,
): Promise<{ verifiedAt: string; openapi: unknown }> => {
  assertOpenapiUrl(handoff.baseUrl, handoff.openapiUrl);
  const live = await requestJson(handoff.baseUrl, "/health/live");
  if (live.status !== 200 || !successStatus(live.value, "live"))
    throw new Error("LIVENESS_FAILED");
  const ready = await requestJson(handoff.baseUrl, "/health/ready");
  if (ready.status !== 200 || !successStatus(ready.value, "ready"))
    throw new Error("READINESS_FAILED");
  const openapi = await requestJson(handoff.baseUrl, "/openapi.json");
  if (
    openapi.status !== 200 ||
    openapiCompatibilityDigest(openapi.value) !== handoff.openapiSha256
  )
    throw new Error("OPENAPI_INCOMPATIBLE");
  return { verifiedAt: new Date().toISOString(), openapi: openapi.value };
};

const syntheticBody = (clientId: string, displayName: string) => ({
  intentSummary: "Synthetic client connection verification",
  proposer: {
    actorType: "AI",
    role: "PROPOSER",
    displayName,
    client: clientId,
  },
  facts: [{ text: "Synthetic isolated verification record" }],
  hypotheses: [],
  clarificationQuestions: [],
  actor: { actorType: "AI", role: "PROPOSER", displayName, client: clientId },
  reason: "Verify configured AI bearer and client attribution",
});

const responseRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("CREDENTIAL_UNVERIFIED");
  return value as Record<string, unknown>;
};

export const verifySyntheticWrite = async (input: {
  handoff: DeploymentConnectionHandoffV1;
  token: string;
  clientId: string;
  displayName: string;
  now?: () => string;
}): Promise<CredentialEvidenceV1 | null> => {
  if (!isLoopbackBaseUrl(input.handoff.baseUrl))
    throw new Error("SYNTHETIC_WRITE_LOOPBACK_ONLY");
  const body = canonicalJson(
    syntheticBody(input.clientId, input.displayName),
  ).trimEnd();
  const key = `cp-init-${sha256(`${input.handoff.releaseId}\0${input.clientId}\0${body}`).slice(0, 48)}`;
  let created: Awaited<ReturnType<typeof requestJson>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      created = await requestJson(input.handoff.baseUrl, "/api/v1/ideas", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body,
      });
    } catch {
      if (attempt === 2) throw new Error("CREDENTIAL_RESULT_UNKNOWN");
      continue;
    }
    if (created.status === 401 || created.status === 403) return null;
    const errorEnvelope = responseRecord(created.value);
    const error = errorEnvelope.error;
    const code =
      error !== null && typeof error === "object"
        ? (error as Record<string, unknown>).code
        : undefined;
    if (created.status === 409 && code === "IDEMPOTENCY_IN_PROGRESS") continue;
    break;
  }
  if (created === undefined || created.status !== 201) return null;
  const envelope = responseRecord(created.value);
  const data = responseRecord(envelope.data);
  const idea = responseRecord(data.idea);
  const meta = responseRecord(envelope.meta);
  if (typeof idea.id !== "string" || typeof meta.requestId !== "string")
    return null;
  const read = await requestJson(
    input.handoff.baseUrl,
    `/api/v1/ideas/${idea.id}`,
  );
  if (read.status !== 200) return null;
  const readEnvelope = responseRecord(read.value);
  const readData = responseRecord(readEnvelope.data);
  const readIdea = responseRecord(readData.idea);
  const proposer = responseRecord(readIdea.proposer);
  if (
    proposer.client !== input.clientId ||
    proposer.displayName !== input.displayName
  )
    return null;
  return {
    kind: "SYNTHETIC_IDEA_READBACK",
    requestId: meta.requestId as string,
    resourceId: idea.id,
    idempotencyKeySha256: sha256(key),
    observedClient: input.clientId,
    observedDisplayName: input.displayName,
    verifiedAt: input.now?.() ?? new Date().toISOString(),
  };
};
