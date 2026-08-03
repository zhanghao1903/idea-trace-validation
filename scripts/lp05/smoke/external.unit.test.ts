import { describe, expect, it } from "vitest";

import { finalizeAuthorizationEnvelope } from "../deploy/authorization-envelope.js";
import {
  createAttemptRecord,
  finalizeAttemptRecord,
} from "../deploy/attempt-record.js";
import { transitionAttempt } from "../deploy/attempt-state.js";
import { canonicalSha256, sha256 } from "../shared/canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
  type JsonRecord,
} from "../shared/contracts.js";
import { runExternalSmoke } from "./external.js";
import type { ExternalSmokeAdapter } from "./external-observer.js";
import {
  APPROVED_CONTENT_SECURITY_POLICY,
  verifyHttpsRedirect,
  verifySecurityHeaders,
} from "./security.js";

const hex = (value: string, count = 64): string => value.repeat(count);

const authorizedAttempt = (): { envelope: JsonRecord; attempt: JsonRecord } => {
  const candidate = {
    manifestSha256: hex("1"),
    releaseId: "lp05-release-test",
    sourceCommit: hex("a", 40),
    sourceTree: hex("b", 40),
    imageId: `sha256:${hex("c")}`,
    archiveSha256: hex("d"),
    platform: "linux/amd64",
  };
  const targetSeed = {
    hostFingerprintSha256: hex("3"),
    domain: "demo.example.com",
    deployRoot: "/srv/idea-validation",
  };
  const target = {
    targetId: `target_${canonicalSha256(targetSeed).slice(0, 32)}`,
    hostFingerprintSha256: targetSeed.hostFingerprintSha256,
    domain: targetSeed.domain,
    expectedIps: ["8.8.8.8"],
    platform: "linux/amd64",
    os: { id: "ubuntu", versionId: "24.04" },
    deployRoot: targetSeed.deployRoot,
    composeProject: "idea-validation-prod",
  };
  const envelope = finalizeAuthorizationEnvelope({
    proposal: {
      workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
      featureId: "lp-05-deployment-release-8c3f1a6d5e20",
      mergeCommitSha: hex("a", 40),
      candidate,
      target,
      backupPolicy: {
        backupRoot: "/srv/idea-validation-backups",
        retentionCount: 7,
        schedule: "daily",
        ageRecipientFingerprint: hex("4"),
        minimumFreeBytes: 10_000_000,
        responsibleOperator: "operator",
      },
      operations: [...REQUIRED_OPERATIONS],
      excludedOperations: [...REQUIRED_EXCLUSIONS],
      syntheticPublicReadConsent: true,
      previousRelease: null,
      toolchain: {
        dockerEngineVersion: "28.0.0",
        composeVersion: "2.35.0",
        ageVersion: "1.2.1",
        dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
        ageInstallationSource: "OS_VENDOR_PACKAGE",
        observedAt: "2026-08-03T00:00:00.000Z",
      },
      proposedAt: "2026-08-03T00:00:00.000Z",
    },
    authorization: {
      authorizedBy: "User",
      sourceThreadId: "019fa641-0154-70f3-9d06-4905baa7e186",
      authorizedAt: "2026-08-03T00:01:00.000Z",
      expiresAt: "2026-08-03T12:01:00.000Z",
      authorizationEvidenceSha256: sha256("test authority"),
    },
    createdAt: "2026-08-03T00:01:00.000Z",
  });
  const database: JsonRecord = {
    targetId: target.targetId,
    project: target.composeProject,
    containerId: "postgres-1",
    volumeName: "postgres-data",
    volumeMountId: "mount-1",
    systemIdentifier: "123456789",
    databaseName: "idea_validation",
    postgresVersion: "17.10",
    databaseInstanceSha256: "",
  };
  database.databaseInstanceSha256 = canonicalSha256(database, [
    "databaseInstanceSha256",
  ]);
  const fresh = {
    kind: "FRESH_TARGET",
    targetId: target.targetId,
    verifiedAt: "2026-08-03T00:02:00.000Z",
    assertions: [
      { id: "no_application_data", status: "PASS" },
      { id: "no_prior_release", status: "PASS" },
      { id: "no_production_volume", status: "PASS" },
    ],
  };
  const migration = {
    catalogSha256: hex("5"),
    appliedLedgerSha256: hex("6"),
    entries: [
      { id: "0001_lp01_core", sha256: hex("7"), ledger: "legacy" },
      {
        id: "0002_lp02_execution_decisions",
        sha256: hex("8"),
        ledger: "feature",
      },
      {
        id: "0003_lp03_reporting_experience",
        sha256: hex("9"),
        ledger: "feature",
      },
    ],
    status: "PASS",
    verifiedAt: "2026-08-03T00:03:00.000Z",
  };
  let attempt = createAttemptRecord({
    attemptId: "deploy_smoke123456",
    envelopeId: String(envelope.envelopeId),
    envelopeSha256: String(envelope.envelopeSha256),
    candidate,
    target,
    previousRelease: null,
    startedAt: "2026-08-03T00:01:00.000Z",
  });
  const steps = [
    {
      to: "PREFLIGHT_PASSED",
      sha: hex("a"),
      projection: { sourceDatabase: database },
    },
    {
      to: "SAFETY_BACKUP_RESOLVED",
      sha: canonicalSha256(fresh),
      projection: { safetyBackup: fresh },
    },
    {
      to: "MIGRATION_SUCCEEDED",
      sha: canonicalSha256(migration),
      projection: { migration },
    },
    { to: "APP_READY", sha: hex("b"), projection: undefined },
    { to: "HTTPS_READY", sha: hex("c"), projection: undefined },
  ] as const;
  steps.forEach((step, index) => {
    attempt = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to: step.to,
        occurredAt: `2026-08-03T00:0${index + 2}:00.000Z`,
        reasonCode: `STEP_${index}`,
        evidenceSha256: step.sha,
        ...(step.projection === undefined
          ? {}
          : { projection: step.projection }),
      }),
    );
  });
  return { envelope, attempt };
};

describe("LP-05 active external smoke", () => {
  it("cannot emit PASS when active observation is skipped", async () => {
    const { envelope, attempt } = authorizedAttempt();
    const adapter: ExternalSmokeAdapter = {
      certificate: async () => {
        throw new Error("ACTIVE_CERTIFICATE_OBSERVATION_REQUIRED");
      },
      resolveIps: async () => [],
      publishedPorts: async () => [],
      observe: async () => {
        throw new Error("ACTIVE_HTTP_OBSERVATION_REQUIRED");
      },
      runJourney: async () => ({}),
      candidateIdentity: async () => hex("1"),
      secretAbsence: async () => hex("2"),
      operationsHealthy: async () => hex("3"),
    };
    await expect(
      runExternalSmoke(
        {
          schemaVersion: "1.0",
          mode: "EXTERNAL_INITIAL",
          smokeId: "smoke_active_test",
          envelope,
          attempt,
          proofRoot: "/private/tmp/lp05-smoke-test",
          runId: "lp05-smoke",
        },
        {
          adapter,
          now: () => new Date("2026-08-03T00:07:00.000Z"),
        },
      ),
    ).rejects.toThrow("ACTIVE_CERTIFICATE_OBSERVATION_REQUIRED");
  });

  it("derives all external assertions from adapter observations", async () => {
    const { envelope, attempt } = authorizedAttempt();
    const previous = process.env.AI_API_TOKEN;
    process.env.AI_API_TOKEN = "lp05-test-ai-token-000000000000000001";
    try {
      const adapter: ExternalSmokeAdapter = {
        certificate: async () => ({
          hostname: "demo.example.com",
          notBefore: "2026-08-02T00:00:00.000Z",
          notAfter: "2026-09-02T00:00:00.000Z",
          issuerSha256: hex("1"),
          trusted: true,
        }),
        resolveIps: async () => ["8.8.8.8"],
        publishedPorts: async () => [
          { service: "caddy", hostIp: "0.0.0.0", published: 80, target: 8080 },
          { service: "caddy", hostIp: "0.0.0.0", published: 443, target: 8443 },
        ],
        observe: async (url, init) => ({
          status: url.startsWith("http:")
            ? 308
            : init?.method === "POST"
              ? url.includes("/reports")
                ? 413
                : 400
              : 200,
          headers: {
            "strict-transport-security": "max-age=31536000",
            "content-security-policy": APPROVED_CONTENT_SECURITY_POLICY,
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "referrer-policy": "no-referrer",
            "cache-control": "no-store",
            ...(url.startsWith("http:")
              ? { location: "https://demo.example.com/health/live" }
              : {}),
          },
          requestId: "req_observed",
          body: "safe public response",
        }),
        runJourney: async () => ({
          result: "PASS",
          assertions: [],
          resourceRefs: {
            activeProjectId: "proj_active",
            governedProjectId: "proj_governed",
            governedConfirmationId: "confirm_governed",
            activeProgressId: "progress_active",
            blockerAttentionId: "attention_blocker",
            decisionAttentionId: "attention_decision",
            supportAttentionId: "attention_support",
            activeReportId: "report_active",
            governedReportId: "report_governed",
            governedConclusionId: "conclusion_governed",
          },
        }),
        candidateIdentity: async () => hex("2"),
        secretAbsence: async () => hex("3"),
        operationsHealthy: async () => hex("4"),
      };
      const evidence = await runExternalSmoke(
        {
          schemaVersion: "1.0",
          mode: "EXTERNAL_INITIAL",
          smokeId: "smoke_active_success",
          envelope,
          attempt,
          proofRoot: "/private/tmp/lp05-smoke-test",
          runId: "lp05-smoke",
        },
        {
          adapter,
          now: () => new Date("2026-08-03T00:07:00.000Z"),
        },
      );
      expect(evidence.status).toBe("PASS");
      expect(evidence.assertions).toHaveLength(22);
    } finally {
      if (previous === undefined) delete process.env.AI_API_TOKEN;
      else process.env.AI_API_TOKEN = previous;
    }
  });
});

describe("LP-05 public edge security contract", () => {
  const headers = {
    "strict-transport-security": "max-age=31536000",
    "content-security-policy": APPROVED_CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  };

  it("rejects missing or altered CSP", () => {
    const missing = Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => key !== "content-security-policy",
      ),
    );
    expect(() =>
      verifySecurityHeaders({ status: 200, headers: missing }, false),
    ).toThrow("SMOKE_CSP");
    expect(() =>
      verifySecurityHeaders(
        {
          status: 200,
          headers: {
            ...headers,
            "content-security-policy": "default-src * 'unsafe-inline'",
          },
        },
        false,
      ),
    ).toThrow("SMOKE_CSP");
  });

  it("requires an exact same-host HTTPS redirect", () => {
    const expected = "https://demo.example.com/health/live";
    expect(() =>
      verifyHttpsRedirect({ status: 308, headers: {} }, expected),
    ).toThrow("SMOKE_HTTP_REDIRECT_LOCATION");
    expect(() =>
      verifyHttpsRedirect(
        {
          status: 308,
          headers: { location: "https://attacker.example/health/live" },
        },
        expected,
      ),
    ).toThrow("SMOKE_HTTP_REDIRECT_DESTINATION");
    expect(() =>
      verifyHttpsRedirect(
        {
          status: 308,
          headers: { location: "http://demo.example.com/health/live" },
        },
        expected,
      ),
    ).toThrow("SMOKE_HTTP_REDIRECT_DESTINATION");
  });
});
