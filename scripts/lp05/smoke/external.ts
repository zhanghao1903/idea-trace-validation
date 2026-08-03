import { canonicalJson } from "../shared/canonical-json.js";
import { validRunId } from "../../lp04/request-identity.js";
import {
  exactKeys,
  record,
  verifyDeploymentAuthorizationEnvelope,
  type JsonRecord,
} from "../shared/contracts.js";
import { verifyAttemptRecord } from "../deploy/attempt-record.js";
import { finalizeSmokeEvidence } from "./smoke-evidence.js";
import {
  createDefaultExternalSmokeAdapter,
  smokeProofRoot,
  type ActiveHttpObservation,
  type ExternalSmokeAdapter,
} from "./external-observer.js";
import { verifyPublishedPorts } from "./network.js";
import { verifyHttpsRedirect, verifySecurityHeaders } from "./security.js";
import {
  syntheticResourceIdsSha256,
  syntheticStorySha256 as storySha256,
} from "./story.js";

export interface ExternalSmokeRequest {
  schemaVersion: "1.0";
  mode: "EXTERNAL_INITIAL" | "EXTERNAL_POST_RESTORE";
  smokeId: string;
  envelope: unknown;
  attempt: unknown;
  proofRoot: string;
  runId: string;
}

const expectStatus = (
  observation: ActiveHttpObservation,
  expected: number | readonly number[],
  code: string,
): ActiveHttpObservation => {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(observation.status)) throw new Error(code);
  return observation;
};

const requiredRef = (refs: JsonRecord, key: string): string => {
  const value = refs[key];
  if (typeof value !== "string" || value === "")
    throw new Error(`SMOKE_JOURNEY_REF:${key}`);
  return value;
};

const pass = (
  id: string,
  observedAt: string,
  options: {
    observation?: ActiveHttpObservation;
    valueSha256?: string | null;
    reasonCode: string;
  },
): JsonRecord => ({
  id,
  status: "PASS",
  observedAt,
  requestId: options.observation?.requestId ?? null,
  httpStatus: options.observation?.status ?? null,
  valueSha256: options.valueSha256 ?? null,
  reasonCode: options.reasonCode,
});

export const parseExternalSmokeRequest = (
  value: unknown,
): ExternalSmokeRequest => {
  const input = record(value, "SMOKE_EXTERNAL_REQUEST");
  exactKeys(
    input,
    [
      "schemaVersion",
      "mode",
      "smokeId",
      "envelope",
      "attempt",
      "proofRoot",
      "runId",
    ],
    "SMOKE_EXTERNAL_REQUEST",
  );
  if (
    input.schemaVersion !== "1.0" ||
    !["EXTERNAL_INITIAL", "EXTERNAL_POST_RESTORE"].includes(
      String(input.mode),
    ) ||
    typeof input.smokeId !== "string" ||
    typeof input.proofRoot !== "string" ||
    typeof input.runId !== "string"
  )
    throw new Error("SMOKE_EXTERNAL_REQUEST_VALUE");
  smokeProofRoot(input.proofRoot);
  if (!validRunId(input.runId)) throw new Error("SMOKE_EXTERNAL_RUN_ID");
  return input as unknown as ExternalSmokeRequest;
};

export const runExternalSmoke = async (
  requestValue: unknown,
  options: {
    adapter?: ExternalSmokeAdapter;
    now?: () => Date;
  } = {},
): Promise<JsonRecord> => {
  const request = parseExternalSmokeRequest(requestValue);
  const now = options.now ?? (() => new Date());
  const observedAt = now().toISOString();
  const envelope = verifyDeploymentAuthorizationEnvelope(
    request.envelope,
    new Date(observedAt),
    {
      workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
      featureId: "lp-05-deployment-release-8c3f1a6d5e20",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
    },
  );
  const attempt = verifyAttemptRecord(request.attempt);
  if (
    attempt.envelopeId !== envelope.envelopeId ||
    attempt.envelopeSha256 !== envelope.envelopeSha256
  )
    throw new Error("SMOKE_EXTERNAL_ENVELOPE_MISMATCH");
  const proposal = record(envelope.proposal, "SMOKE_EXTERNAL_PROPOSAL");
  const target = record(proposal.target, "SMOKE_EXTERNAL_TARGET");
  const candidate = record(proposal.candidate, "SMOKE_EXTERNAL_CANDIDATE");
  if (
    canonicalJson(attempt.target) !== canonicalJson(target) ||
    canonicalJson(attempt.candidate) !== canonicalJson(candidate)
  )
    throw new Error("SMOKE_EXTERNAL_ATTEMPT_MISMATCH");
  const requiredState =
    request.mode === "EXTERNAL_INITIAL"
      ? "HTTPS_READY"
      : "PRODUCTION_UNCHANGED_VERIFIED";
  if (attempt.currentState !== requiredState)
    throw new Error(`SMOKE_EXTERNAL_STATE:${requiredState}`);
  const origin = `https://${String(target.domain)}/`;
  const adapter = options.adapter ?? createDefaultExternalSmokeAdapter();

  const certificate = await adapter.certificate(origin);
  const addresses = (await adapter.resolveIps(String(target.domain))).sort();
  const expectedIps = [...(target.expectedIps as string[])].sort();
  if (addresses.join("\0") !== expectedIps.join("\0"))
    throw new Error("SMOKE_DNS_TARGET_MISMATCH");
  verifyPublishedPorts(
    await adapter.publishedPorts(String(target.composeProject)),
    "EXTERNAL",
  );

  const httpOrigin = `http://${String(target.domain)}/`;
  const redirect = expectStatus(
    await adapter.observe(new URL("health/live", httpOrigin).href),
    [301, 302, 307, 308],
    "SMOKE_HTTP_REDIRECT",
  );
  verifyHttpsRedirect(redirect, new URL("health/live", origin).href);
  const live = expectStatus(
    await adapter.observe(new URL("health/live", origin).href),
    200,
    "SMOKE_HEALTH_LIVE",
  );
  const ready = expectStatus(
    await adapter.observe(new URL("health/ready", origin).href),
    200,
    "SMOKE_HEALTH_READY",
  );
  verifySecurityHeaders(ready, true);
  const openapi = expectStatus(
    await adapter.observe(new URL("openapi.json", origin).href),
    200,
    "SMOKE_OPENAPI",
  );
  const proposer = expectStatus(
    await adapter.observe(new URL("proposer", origin).href),
    200,
    "SMOKE_PROPOSER_ROUTE",
  );
  const executor = expectStatus(
    await adapter.observe(new URL("executor", origin).href),
    200,
    "SMOKE_EXECUTOR_ROUTE",
  );

  const journey = await adapter.runJourney({
    origin,
    proofRoot: smokeProofRoot(request.proofRoot),
    runId: request.runId,
    skillCommitSha: String(candidate.sourceCommit),
  });
  if (journey.result !== "PASS") throw new Error("SMOKE_JOURNEY_FAILED");
  const refs = record(journey.resourceRefs, "SMOKE_JOURNEY_REFS");
  const activeProjectId = requiredRef(refs, "activeProjectId");
  requiredRef(refs, "governedProjectId");
  const confirmationId = requiredRef(refs, "governedConfirmationId");
  requiredRef(refs, "activeProgressId");
  requiredRef(refs, "blockerAttentionId");
  requiredRef(refs, "decisionAttentionId");
  requiredRef(refs, "supportAttentionId");
  requiredRef(refs, "activeReportId");
  requiredRef(refs, "governedReportId");
  requiredRef(refs, "governedConclusionId");
  const projectRoute = expectStatus(
    await adapter.observe(
      new URL(`proposer/projects/${activeProjectId}`, origin).href,
    ),
    200,
    "SMOKE_PROJECT_ROUTE",
  );
  const confirmationRoute = expectStatus(
    await adapter.observe(
      new URL(`confirmations/${confirmationId}`, origin).href,
    ),
    200,
    "SMOKE_CONFIRMATION_ROUTE",
  );

  const aiToken = process.env.AI_API_TOKEN;
  if (aiToken === undefined || aiToken.length < 32)
    throw new Error("SMOKE_AI_API_TOKEN_REQUIRED");
  const headers = {
    authorization: `Bearer ${aiToken}`,
    "content-type": "application/json",
  };
  const ordinaryLimit = expectStatus(
    await adapter.observe(new URL("api/v1/ideas", origin).href, {
      method: "POST",
      headers,
      body: JSON.stringify({ payload: "x".repeat(70_000) }),
    }),
    400,
    "SMOKE_ORDINARY_BODY_LIMIT",
  );
  const reportLimit = expectStatus(
    await adapter.observe(
      new URL(`api/v1/projects/${activeProjectId}/reports`, origin).href,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ payload: "x".repeat(270_000) }),
      },
    ),
    413,
    "SMOKE_REPORT_BODY_LIMIT",
  );

  const candidateIdentitySha = await adapter.candidateIdentity({
    composeProject: String(target.composeProject),
    imageId: String(candidate.imageId),
  });
  await adapter.secretAbsence(String(target.composeProject));
  const operationsSha = await adapter.operationsHealthy(
    String(target.composeProject),
  );
  const publicBodies = [
    live.body,
    ready.body,
    openapi.body,
    proposer.body,
    executor.body,
    projectRoute.body,
    confirmationRoute.body,
  ].join("\n");
  if (
    publicBodies.includes(aiToken) ||
    /Bearer\s+[A-Za-z0-9._~-]{16,}/u.test(publicBodies)
  )
    throw new Error("SMOKE_PUBLIC_SECRET_EXPOSED");

  const syntheticStorySha256 = storySha256(journey);
  const resourceIdsSha256 = syntheticResourceIdsSha256(journey);
  const assertions: JsonRecord[] = [
    pass("attention_items", observedAt, {
      valueSha256: syntheticStorySha256,
      reasonCode: "ACTIVE_JOURNEY_OBSERVED",
    }),
    pass("cache_policy", observedAt, {
      observation: ready,
      reasonCode: "NO_STORE_OBSERVED",
    }),
    pass("candidate_identity", observedAt, {
      valueSha256: candidateIdentitySha,
      reasonCode: "RUNTIME_IMAGE_OBSERVED",
    }),
    pass("completion", observedAt, {
      valueSha256: syntheticStorySha256,
      reasonCode: "COMPLETION_OBSERVED",
    }),
    pass("confirmation_route", observedAt, {
      observation: confirmationRoute,
      reasonCode: "ROUTE_OBSERVED",
    }),
    pass("executor_route", observedAt, {
      observation: executor,
      reasonCode: "ROUTE_OBSERVED",
    }),
    pass("health_live", observedAt, {
      observation: live,
      reasonCode: "LIVE_OBSERVED",
    }),
    pass("health_ready", observedAt, {
      observation: ready,
      reasonCode: "READY_OBSERVED",
    }),
    pass("hsts_security_headers", observedAt, {
      observation: ready,
      reasonCode: "SECURITY_HEADERS_OBSERVED",
    }),
    pass("http_redirect", observedAt, {
      observation: redirect,
      reasonCode: "HTTPS_REDIRECT_OBSERVED",
    }),
    pass("idea_journey", observedAt, {
      valueSha256: syntheticStorySha256,
      reasonCode: "PUBLIC_JOURNEY_OBSERVED",
    }),
    pass("network_exposure", observedAt, {
      reasonCode: "ONLY_80_443_OBSERVED",
    }),
    pass("openapi", observedAt, {
      observation: openapi,
      reasonCode: "OPENAPI_OBSERVED",
    }),
    pass("operations_health", observedAt, {
      valueSha256: operationsSha,
      reasonCode: "RUNTIME_HEALTH_OBSERVED",
    }),
    pass("ordinary_body_limit", observedAt, {
      observation: ordinaryLimit,
      reasonCode: "BODY_LIMIT_OBSERVED",
    }),
    pass("project_progress", observedAt, {
      valueSha256: syntheticStorySha256,
      reasonCode: "PROGRESS_OBSERVED",
    }),
    pass("project_route", observedAt, {
      observation: projectRoute,
      reasonCode: "ROUTE_OBSERVED",
    }),
    pass("proposer_route", observedAt, {
      observation: proposer,
      reasonCode: "ROUTE_OBSERVED",
    }),
    pass("report_body_limit", observedAt, {
      observation: reportLimit,
      reasonCode: "REPORT_LIMIT_OBSERVED",
    }),
    pass("secret_absence", observedAt, {
      reasonCode: "PUBLIC_AND_RUNTIME_OUTPUT_SCANNED",
    }),
    pass("tls_trusted", observedAt, { reasonCode: "TLS_AND_DNS_OBSERVED" }),
    pass("two_reports", observedAt, {
      valueSha256: syntheticStorySha256,
      reasonCode: "TWO_REPORTS_OBSERVED",
    }),
  ];
  return finalizeSmokeEvidence({
    schemaVersion: "1.0",
    smokeId: request.smokeId,
    mode: request.mode,
    attemptId: attempt.attemptId,
    targetId: target.targetId,
    candidateManifestSha256: candidate.manifestSha256,
    origin,
    observedAt,
    certificate,
    syntheticStorySha256,
    resourceIdsSha256,
    assertions,
    status: "PASS",
  });
};
