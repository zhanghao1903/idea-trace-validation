import { describe, expect, it } from "vitest";

import { finalizeAuthorizationEnvelope } from "../deploy/authorization-envelope.js";
import {
  createAttemptRecord,
  finalizeAttemptRecord,
  verifyAttemptRecord,
} from "../deploy/attempt-record.js";
import { transitionAttempt } from "../deploy/attempt-state.js";
import { finalizeSmokeEvidence } from "../smoke/smoke-evidence.js";
import { canonicalJson, canonicalSha256, sha256 } from "./canonical-json.js";
import {
  REQUIRED_EXCLUSIONS,
  REQUIRED_OPERATIONS,
  REQUIRED_SMOKE_ASSERTION_IDS,
  assertionSetSha256,
  createInitialTransition,
  verifyCandidateProvenance,
  verifyDeploymentAuthorizationEnvelope,
  verifyReleaseCandidateManifest,
  verifySmokeEvidence,
  verifyTransitionLog,
  type CandidateIdentityV1,
  type JsonRecord,
} from "./contracts.js";
import { assertSanitized } from "./redaction.js";

const hex = (character: string, length: number): string =>
  character.repeat(length);
const commit = hex("a", 40);
const tree = hex("b", 40);

const candidateManifest = (): JsonRecord => {
  const platform = "linux/amd64";
  const releaseId = `lp05-${commit.slice(0, 12)}-amd64`;
  const value: JsonRecord = {
    schemaVersion: "1.0",
    manifestSha256: "",
    releaseId,
    sourceCommit: commit,
    sourceTree: tree,
    createdAt: "2026-08-03T00:00:00.000Z",
    platform,
    applicationVersion: `0.1.0+${commit.slice(0, 12)}`,
    imageName: `idea-trace-validation:${releaseId}`,
    imageId: `sha256:${hex("c", 64)}`,
    ociArchive: {
      basename: `${releaseId}.oci.tar`,
      sizeBytes: 1024,
      sha256: hex("d", 64),
      mediaType: "application/vnd.oci.image.layout.v1+tar",
    },
    baseImages: ["builder", "database", "proxy"].map((role, index) => ({
      role,
      repository: `docker.io/library/${["node", "postgres", "caddy"][index]}`,
      versionTag: ["24.18.0-alpine", "17.10-alpine", "2.10.2-alpine"][index],
      digest: `sha256:${String(index + 1).repeat(64)}`,
      platform,
    })),
    migrationCatalog: [
      "0001_lp01_core",
      "0002_lp02_execution_decisions",
      "0003_lp03_reporting_experience",
    ].map((id, index) => ({
      id,
      sha256: String(index + 4).repeat(64),
      ledger: index === 0 ? "legacy" : "feature",
    })),
    webAssetsSha256: hex("7", 64),
    openapiSha256: hex("8", 64),
    verification: {
      command: "npm run verify",
      commit,
      status: "PASS",
      completedAt: "2026-08-03T00:01:00.000Z",
      logSha256: hex("9", 64),
    },
    syntheticDataOnly: true,
  };
  value.manifestSha256 = canonicalSha256(value, ["manifestSha256"]);
  return value;
};

const identity = (): CandidateIdentityV1 => {
  const manifest = candidateManifest();
  return {
    manifestSha256: String(manifest.manifestSha256),
    releaseId: String(manifest.releaseId),
    sourceCommit: commit,
    sourceTree: tree,
    imageId: String(manifest.imageId),
    archiveSha256: hex("d", 64),
    platform: "linux/amd64",
  };
};

const targetFixture = (): JsonRecord => ({
  targetId: `target_${canonicalSha256({
    hostFingerprintSha256: hex("2", 64),
    domain: "demo.example.com",
    deployRoot: "/srv/idea-validation",
  }).slice(0, 32)}`,
  hostFingerprintSha256: hex("2", 64),
  domain: "demo.example.com",
  expectedIps: ["8.8.8.8"],
  platform: "linux/amd64",
  os: { id: "ubuntu", versionId: "24.04" },
  deployRoot: "/srv/idea-validation",
  composeProject: "idea-validation-prod",
});

const assertions = (
  time = "2026-08-03T00:10:00.000Z",
  requestSuffix = "one",
): JsonRecord[] =>
  REQUIRED_SMOKE_ASSERTION_IDS.map((id) => ({
    id,
    status: "PASS",
    observedAt: time,
    requestId: `req_${requestSuffix}_${id}`,
    httpStatus: 200,
    valueSha256: null,
    reasonCode: "OBSERVED_PASS",
  }));

const smoke = (
  mode: "LOCAL" | "EXTERNAL_INITIAL" | "EXTERNAL_POST_RESTORE",
  time: string,
): JsonRecord =>
  finalizeSmokeEvidence({
    schemaVersion: "1.0",
    smokeId: `smoke_${mode.toLowerCase()}`,
    mode,
    attemptId: "deploy_abcdef123456",
    targetId: `target_${hex("1", 32)}`,
    candidateManifestSha256: String(candidateManifest().manifestSha256),
    origin:
      mode === "LOCAL"
        ? "https://127.0.0.1:18443/"
        : "https://demo.example.com/",
    observedAt: time,
    certificate:
      mode === "LOCAL"
        ? null
        : {
            hostname: "demo.example.com",
            notBefore: "2026-08-02T00:00:00.000Z",
            notAfter: "2026-11-02T00:00:00.000Z",
            issuerSha256: hex("2", 64),
            trusted: true,
          },
    syntheticStorySha256: hex("3", 64),
    resourceIdsSha256: hex("4", 64),
    assertions: assertions(time, mode),
    status: "PASS",
  });

describe("LP-05 canonical and candidate contracts", () => {
  it("canonicalizes object keys and NFC strings without a trailing newline", () => {
    expect(canonicalJson({ z: "e\u0301", a: 1 })).toBe('{"a":1,"z":"é"}');
  });

  it("rejects non-integer canonical numbers", () => {
    expect(() => canonicalJson({ value: 1.5 })).toThrow(
      "CANONICAL_INTEGER_REQUIRED",
    );
  });

  it("verifies a closed candidate manifest and rejects unknown fields", () => {
    expect(
      verifyReleaseCandidateManifest(candidateManifest()).releaseId,
    ).toContain("lp05-");
    const invalid = { ...candidateManifest(), invented: true };
    invalid.manifestSha256 = canonicalSha256(invalid, ["manifestSha256"]);
    expect(() => verifyReleaseCandidateManifest(invalid)).toThrow(
      "CANDIDATE_MANIFEST",
    );
  });

  it("uses reviewed head before merge and reachable base merge commit in production", () => {
    verifyCandidateProvenance({
      candidate: identity(),
      phase: "PRE_MERGE",
      reviewedHead: commit,
    });
    verifyCandidateProvenance({
      candidate: identity(),
      phase: "PRODUCTION",
      reviewedHead: hex("e", 40),
      mergeCommitSha: commit,
      reachableFromBase: true,
    });
    expect(() =>
      verifyCandidateProvenance({
        candidate: identity(),
        phase: "PRODUCTION",
        reviewedHead: commit,
        mergeCommitSha: commit,
        reachableFromBase: false,
      }),
    ).toThrow("PROVENANCE_MERGE_AUTHORITY");
  });

  it("rejects secret-bearing evidence", () => {
    expect(() =>
      assertSanitized({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz" }),
    ).toThrow("EVIDENCE_SECRET");
  });
});

describe("LP-05 attempt journal", () => {
  it("encodes sequence zero with from null", () => {
    const initial = createInitialTransition("2026-08-03T00:00:00.000Z");
    expect(initial.from).toBeNull();
    expect(verifyTransitionLog([initial])).toHaveLength(1);
  });

  it("rejects a rewritten transition digest", () => {
    const initial = createInitialTransition("2026-08-03T00:00:00.000Z");
    expect(() =>
      verifyTransitionLog([{ ...initial, reasonCode: "REWRITTEN" }]),
    ).toThrow("TRANSITION_DIGEST");
  });

  it("allows fresh preflight without a database identity and requires one at safety resolution", () => {
    const attempt = createAttemptRecord({
      attemptId: "deploy_abcdef123456",
      envelopeId: `auth_${hex("a", 32)}`,
      envelopeSha256: hex("a", 64),
      candidate: identity(),
      target: targetFixture(),
      previousRelease: null,
      startedAt: "2026-08-03T00:00:00.000Z",
    });
    const preflight = finalizeAttemptRecord(
      transitionAttempt(attempt, {
        to: "PREFLIGHT_PASSED",
        occurredAt: "2026-08-03T00:01:00.000Z",
        reasonCode: "PREFLIGHT_PASS",
        evidenceSha256: hex("b", 64),
      }),
    );
    expect(verifyAttemptRecord(preflight).sourceDatabase).toBeNull();
    expect(() =>
      finalizeAttemptRecord(
        transitionAttempt(preflight, {
          to: "SAFETY_BACKUP_RESOLVED",
          occurredAt: "2026-08-03T00:02:00.000Z",
          reasonCode: "FRESH_TARGET",
          evidenceSha256: hex("c", 64),
          projection: { safetyBackup: { kind: "FRESH_TARGET" } },
        }),
      ),
    ).toThrow("ATTEMPT_DATABASE_IDENTITY_REQUIRED");
  });
});

describe("LP-05 smoke contracts", () => {
  it("derives assertion set identity without volatile request IDs and timestamps", () => {
    expect(
      assertionSetSha256(assertions("2026-08-03T00:00:00.000Z", "a")),
    ).toBe(assertionSetSha256(assertions("2026-08-03T01:00:00.000Z", "b")));
  });

  it("requires the complete assertion matrix", () => {
    const invalid = smoke("EXTERNAL_INITIAL", "2026-08-03T00:10:00.000Z");
    invalid.assertions = (invalid.assertions as JsonRecord[]).slice(1);
    invalid.assertionSetSha256 = assertionSetSha256(invalid.assertions);
    invalid.smokeSha256 = canonicalSha256(invalid, ["smokeSha256"]);
    expect(() => verifySmokeEvidence(invalid)).toThrow("SMOKE_ASSERTION_SET");
  });

  it("keeps external initial and post-restore assertion-set identity equal", () => {
    const initial = smoke("EXTERNAL_INITIAL", "2026-08-03T00:10:00.000Z");
    const post = smoke("EXTERNAL_POST_RESTORE", "2026-08-03T00:20:00.000Z");
    expect(initial.assertionSetSha256).toBe(post.assertionSetSha256);
  });
});

describe("LP-05 authorization envelope", () => {
  const envelope = (): JsonRecord =>
    finalizeAuthorizationEnvelope({
      proposal: {
        workflowId: "ab5accf2-4bea-4ea2-b3c5-4f3f115d45ff",
        featureId: "lp-05-deployment-release-8c3f1a6d5e20",
        mergeCommitSha: commit,
        candidate: identity(),
        target: targetFixture(),
        backupPolicy: {
          backupRoot: "/srv/idea-validation-backups",
          retentionCount: 7,
          schedule: "daily",
          ageRecipientFingerprint: hex("3", 64),
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
        authorizationEvidenceSha256: sha256("exact user response"),
      },
      createdAt: "2026-08-03T00:01:00.000Z",
    });

  it("binds a proposal digest and derives envelope identity", () => {
    const value = envelope();
    expect(
      verifyDeploymentAuthorizationEnvelope(
        value,
        new Date("2026-08-03T01:00:00.000Z"),
      ).envelopeId,
    ).toBe(value.envelopeId);
  });

  it("rejects expired authority", () => {
    expect(() =>
      verifyDeploymentAuthorizationEnvelope(
        envelope(),
        new Date("2026-08-04T00:00:00.000Z"),
      ),
    ).toThrow("AUTH_EXPIRED");
  });
});
