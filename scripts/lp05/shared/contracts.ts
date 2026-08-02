import { isIP } from "node:net";

import { canonicalJson, canonicalSha256, sha256 } from "./canonical-json.js";
import { assertSanitized } from "./redaction.js";

export type JsonRecord = Record<string, unknown>;
export type Platform = "linux/amd64" | "linux/arm64";

export const ATTEMPT_STATES = [
  "PREPARED",
  "PREFLIGHT_PASSED",
  "SAFETY_BACKUP_RESOLVED",
  "MIGRATION_SUCCEEDED",
  "APP_READY",
  "HTTPS_READY",
  "INITIAL_SMOKE_PASSED",
  "POST_DEPLOY_BACKUP_VERIFIED",
  "RESTORE_ENV_READY",
  "RESTORE_VERIFIED",
  "PRODUCTION_UNCHANGED_VERIFIED",
  "POST_RESTORE_SMOKE_PASSED",
  "DEPLOYED",
  "INTERRUPTED",
  "RESUMING",
  "FAILED",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const REQUIRED_OPERATIONS = [
  "APP_ROLLBACK",
  "INITIAL_SMOKE",
  "ISOLATED_RESTORE",
  "LOAD_CANDIDATE",
  "MIGRATE",
  "POST_DEPLOY_BACKUP",
  "POST_RESTORE_SMOKE",
  "SAFETY_BACKUP",
  "START_APP",
  "START_DATABASE",
  "START_HTTPS",
] as const;

export const REQUIRED_EXCLUSIONS = [
  "DNS_CHANGE",
  "GITHUB_RELEASE",
  "PACKAGE_PUBLISH",
  "PRODUCTION_DB_RESTORE",
  "REGISTRY_PUBLISH",
  "SKILL_PUBLISH",
  "TAG",
] as const;

export const REQUIRED_SMOKE_ASSERTION_IDS = [
  "attention_items",
  "cache_policy",
  "candidate_identity",
  "completion",
  "confirmation_route",
  "executor_route",
  "health_live",
  "health_ready",
  "hsts_security_headers",
  "http_redirect",
  "idea_journey",
  "network_exposure",
  "openapi",
  "operations_health",
  "ordinary_body_limit",
  "project_progress",
  "project_route",
  "proposer_route",
  "report_body_limit",
  "secret_absence",
  "tls_trusted",
  "two_reports",
] as const;

const SHA = /^[0-9a-f]{64}$/u;
const IMAGE_SHA = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const DNS =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export const record = (
  value: unknown,
  code = "RECORD_REQUIRED",
): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as JsonRecord;
};

export const exactKeys = (
  value: JsonRecord,
  keys: readonly string[],
  code = "UNKNOWN_FIELD",
): void => {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0)
    throw new Error(`${code}:${[...unknown, ...missing].join(",")}`);
};

const string = (value: unknown, code: string, maximum = 240): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.normalize("NFC")
  ) {
    throw new Error(code);
  }
  return value;
};
const literal = <T extends string>(
  value: unknown,
  expected: T,
  code: string,
): T => {
  if (value !== expected) throw new Error(code);
  return expected;
};
const enumeration = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): T => {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error(code);
  return value as T;
};
const digest = (value: unknown, code: string): string => {
  const parsed = string(value, code, 64);
  if (!SHA.test(parsed)) throw new Error(code);
  return parsed;
};
const imageDigest = (value: unknown, code: string): string => {
  const parsed = string(value, code, 71);
  if (!IMAGE_SHA.test(parsed)) throw new Error(code);
  return parsed;
};
const commit = (value: unknown, code: string): string => {
  const parsed = string(value, code, 40);
  if (!COMMIT.test(parsed)) throw new Error(code);
  return parsed;
};
const safe = (value: unknown, code: string): string => {
  const parsed = string(value, code, 128);
  if (!SAFE.test(parsed) || parsed === "." || parsed === "..")
    throw new Error(code);
  return parsed;
};
const timestamp = (value: unknown, code: string): string => {
  const parsed = string(value, code, 32);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(parsed) ||
    Number.isNaN(Date.parse(parsed))
  ) {
    throw new Error(code);
  }
  return parsed;
};
const integer = (
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new Error(code);
  return value as number;
};
const sortedUnique = (value: unknown, code: string, maximum = 32): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(code);
  }
  const parsed = value as string[];
  if (
    new Set(parsed).size !== parsed.length ||
    [...parsed].sort().join("\0") !== parsed.join("\0")
  )
    throw new Error(code);
  return parsed;
};
const deepEqual = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);

const isPublicIp = (value: string): boolean => {
  const kind = isIP(value);
  if (kind === 4) {
    const [a, b] = value.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 2, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  if (kind === 6) {
    const normalized = value.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/u.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
};

const semverInRange = (
  value: unknown,
  minimum: [number, number, number],
  maximumMajor: number,
  code: string,
): string => {
  const parsed = string(value, code);
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(parsed);
  if (match === null) throw new Error(code);
  const version: [number, number, number] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const accepted =
    version[0] < maximumMajor &&
    (version[0] > minimum[0] ||
      (version[0] === minimum[0] &&
        (version[1] > minimum[1] ||
          (version[1] === minimum[1] && version[2] >= minimum[2]))));
  if (!accepted) throw new Error(code);
  return parsed;
};

export interface CandidateIdentityV1 {
  manifestSha256: string;
  releaseId: string;
  sourceCommit: string;
  sourceTree: string;
  imageId: string;
  archiveSha256: string;
  platform: Platform;
}

export const parseCandidateIdentity = (value: unknown): CandidateIdentityV1 => {
  const input = record(value, "CANDIDATE_IDENTITY");
  exactKeys(
    input,
    [
      "manifestSha256",
      "releaseId",
      "sourceCommit",
      "sourceTree",
      "imageId",
      "archiveSha256",
      "platform",
    ],
    "CANDIDATE_IDENTITY",
  );
  return {
    manifestSha256: digest(input.manifestSha256, "CANDIDATE_MANIFEST_SHA"),
    releaseId: safe(input.releaseId, "CANDIDATE_RELEASE_ID"),
    sourceCommit: commit(input.sourceCommit, "CANDIDATE_SOURCE_COMMIT"),
    sourceTree: commit(input.sourceTree, "CANDIDATE_SOURCE_TREE"),
    imageId: imageDigest(input.imageId, "CANDIDATE_IMAGE_ID"),
    archiveSha256: digest(input.archiveSha256, "CANDIDATE_ARCHIVE_SHA"),
    platform: enumeration(
      input.platform,
      ["linux/amd64", "linux/arm64"],
      "CANDIDATE_PLATFORM",
    ),
  };
};

export const verifyReleaseCandidateManifest = (value: unknown): JsonRecord => {
  const input = record(value, "CANDIDATE_MANIFEST");
  exactKeys(
    input,
    [
      "schemaVersion",
      "manifestSha256",
      "releaseId",
      "sourceCommit",
      "sourceTree",
      "createdAt",
      "platform",
      "applicationVersion",
      "imageName",
      "imageId",
      "ociArchive",
      "baseImages",
      "migrationCatalog",
      "webAssetsSha256",
      "openapiSha256",
      "verification",
      "syntheticDataOnly",
    ],
    "CANDIDATE_MANIFEST",
  );
  literal(input.schemaVersion, "1.0", "CANDIDATE_VERSION");
  const manifestSha256 = digest(input.manifestSha256, "CANDIDATE_MANIFEST_SHA");
  if (canonicalSha256(input, ["manifestSha256"]) !== manifestSha256)
    throw new Error("CANDIDATE_MANIFEST_DIGEST");
  const sourceCommit = commit(input.sourceCommit, "CANDIDATE_SOURCE_COMMIT");
  commit(input.sourceTree, "CANDIDATE_SOURCE_TREE");
  const platform = enumeration(
    input.platform,
    ["linux/amd64", "linux/arm64"],
    "CANDIDATE_PLATFORM",
  );
  const releaseId = safe(input.releaseId, "CANDIDATE_RELEASE_ID");
  const architecture = platform === "linux/amd64" ? "amd64" : "arm64";
  if (releaseId !== `lp05-${sourceCommit.slice(0, 12)}-${architecture}`)
    throw new Error("CANDIDATE_RELEASE_ID");
  if (input.syntheticDataOnly !== true)
    throw new Error("CANDIDATE_SYNTHETIC_ONLY");
  if (input.applicationVersion !== `0.1.0+${sourceCommit.slice(0, 12)}`)
    throw new Error("CANDIDATE_VERSION_LABEL");
  if (
    input.imageName !== `idea-trace-validation:${releaseId}` ||
    input.imageName === "latest"
  )
    throw new Error("CANDIDATE_IMAGE_NAME");
  imageDigest(input.imageId, "CANDIDATE_IMAGE_ID");
  timestamp(input.createdAt, "CANDIDATE_CREATED_AT");

  const archive = record(input.ociArchive, "CANDIDATE_ARCHIVE");
  exactKeys(
    archive,
    ["basename", "sizeBytes", "sha256", "mediaType"],
    "CANDIDATE_ARCHIVE",
  );
  if (
    archive.basename !== `${releaseId}.oci.tar` ||
    String(archive.basename).includes("/")
  )
    throw new Error("CANDIDATE_ARCHIVE_NAME");
  integer(
    archive.sizeBytes,
    1,
    10 * 1024 * 1024 * 1024,
    "CANDIDATE_ARCHIVE_SIZE",
  );
  digest(archive.sha256, "CANDIDATE_ARCHIVE_SHA");
  literal(
    archive.mediaType,
    "application/vnd.oci.image.layout.v1+tar",
    "CANDIDATE_ARCHIVE_MEDIA",
  );

  if (!Array.isArray(input.baseImages) || input.baseImages.length !== 3)
    throw new Error("CANDIDATE_BASE_IMAGES");
  const roles = ["builder", "database", "proxy"];
  input.baseImages.forEach((candidate, index) => {
    const image = record(candidate, "CANDIDATE_BASE_IMAGE");
    exactKeys(
      image,
      ["role", "repository", "versionTag", "digest", "platform"],
      "CANDIDATE_BASE_IMAGE",
    );
    if (image.role !== roles[index] || image.versionTag === "latest")
      throw new Error("CANDIDATE_BASE_IMAGE_ORDER");
    string(image.repository, "CANDIDATE_BASE_IMAGE_REPOSITORY");
    string(image.versionTag, "CANDIDATE_BASE_IMAGE_TAG");
    imageDigest(image.digest, "CANDIDATE_BASE_IMAGE_DIGEST");
    if (image.platform !== platform)
      throw new Error("CANDIDATE_BASE_IMAGE_PLATFORM");
  });

  if (
    !Array.isArray(input.migrationCatalog) ||
    input.migrationCatalog.length !== 3
  )
    throw new Error("CANDIDATE_MIGRATIONS");
  input.migrationCatalog.forEach((candidate) => {
    const migration = record(candidate, "CANDIDATE_MIGRATION");
    exactKeys(migration, ["id", "sha256", "ledger"], "CANDIDATE_MIGRATION");
    safe(migration.id, "CANDIDATE_MIGRATION_ID");
    digest(migration.sha256, "CANDIDATE_MIGRATION_SHA");
    enumeration(
      migration.ledger,
      ["legacy", "feature"],
      "CANDIDATE_MIGRATION_LEDGER",
    );
  });
  digest(input.webAssetsSha256, "CANDIDATE_WEB_SHA");
  digest(input.openapiSha256, "CANDIDATE_OPENAPI_SHA");
  const verification = record(input.verification, "CANDIDATE_VERIFICATION");
  exactKeys(
    verification,
    ["command", "commit", "status", "completedAt", "logSha256"],
    "CANDIDATE_VERIFICATION",
  );
  literal(verification.command, "npm run verify", "CANDIDATE_VERIFY_COMMAND");
  if (commit(verification.commit, "CANDIDATE_VERIFY_COMMIT") !== sourceCommit)
    throw new Error("CANDIDATE_VERIFY_COMMIT");
  literal(verification.status, "PASS", "CANDIDATE_VERIFY_STATUS");
  timestamp(verification.completedAt, "CANDIDATE_VERIFY_TIME");
  digest(verification.logSha256, "CANDIDATE_VERIFY_LOG_SHA");
  assertSanitized(input);
  return input;
};

export const verifyCandidateProvenance = (input: {
  candidate: CandidateIdentityV1;
  phase: "PRE_MERGE" | "PRODUCTION";
  reviewedHead: string;
  mergeCommitSha?: string;
  reachableFromBase?: boolean;
}): void => {
  commit(input.reviewedHead, "PROVENANCE_REVIEWED_HEAD");
  if (input.phase === "PRE_MERGE") {
    if (input.candidate.sourceCommit !== input.reviewedHead)
      throw new Error("PROVENANCE_PRE_MERGE_HEAD");
    return;
  }
  if (input.mergeCommitSha === undefined || !input.reachableFromBase)
    throw new Error("PROVENANCE_MERGE_AUTHORITY");
  if (
    input.candidate.sourceCommit !==
    commit(input.mergeCommitSha, "PROVENANCE_MERGE_COMMIT")
  ) {
    throw new Error("PROVENANCE_PRODUCTION_COMMIT");
  }
};

export const parseDeploymentTarget = (value: unknown): JsonRecord => {
  const target = record(value, "TARGET");
  exactKeys(
    target,
    [
      "targetId",
      "hostFingerprintSha256",
      "domain",
      "expectedIps",
      "platform",
      "os",
      "deployRoot",
      "composeProject",
    ],
    "TARGET",
  );
  if (!/^target_[0-9a-f]{32}$/u.test(string(target.targetId, "TARGET_ID")))
    throw new Error("TARGET_ID");
  digest(target.hostFingerprintSha256, "TARGET_HOST_SHA");
  const domain = string(target.domain, "TARGET_DOMAIN", 253);
  if (!DNS.test(domain)) throw new Error("TARGET_DOMAIN");
  const ips = sortedUnique(target.expectedIps, "TARGET_IPS", 8);
  if (ips.length < 1 || ips.some((ip) => !isPublicIp(ip)))
    throw new Error("TARGET_IPS");
  enumeration(
    target.platform,
    ["linux/amd64", "linux/arm64"],
    "TARGET_PLATFORM",
  );
  const os = record(target.os, "TARGET_OS");
  exactKeys(os, ["id", "versionId"], "TARGET_OS");
  safe(os.id, "TARGET_OS_ID");
  safe(os.versionId, "TARGET_OS_VERSION");
  const deployRoot = string(target.deployRoot, "TARGET_DEPLOY_ROOT", 512);
  if (
    !deployRoot.startsWith("/") ||
    deployRoot === "/" ||
    deployRoot.includes("..")
  )
    throw new Error("TARGET_DEPLOY_ROOT");
  safe(target.composeProject, "TARGET_COMPOSE_PROJECT");
  const expectedTargetId = `target_${canonicalSha256({
    hostFingerprintSha256: target.hostFingerprintSha256,
    domain: target.domain,
    deployRoot: target.deployRoot,
  }).slice(0, 32)}`;
  if (target.targetId !== expectedTargetId)
    throw new Error("TARGET_ID_DERIVATION");
  return target;
};

const parseToolchain = (value: unknown): JsonRecord => {
  const input = record(value, "TOOLCHAIN");
  exactKeys(
    input,
    [
      "dockerEngineVersion",
      "composeVersion",
      "ageVersion",
      "dockerInstallationSource",
      "ageInstallationSource",
      "observedAt",
    ],
    "TOOLCHAIN",
  );
  semverInRange(input.dockerEngineVersion, [27, 5, 0], 30, "TOOLCHAIN_DOCKER");
  semverInRange(input.composeVersion, [2, 32, 0], 3, "TOOLCHAIN_COMPOSE");
  semverInRange(input.ageVersion, [1, 2, 0], 2, "TOOLCHAIN_AGE");
  literal(
    input.dockerInstallationSource,
    "OFFICIAL_DOCKER_PACKAGE",
    "TOOLCHAIN_DOCKER_SOURCE",
  );
  enumeration(
    input.ageInstallationSource,
    ["OS_VENDOR_PACKAGE", "OFFICIAL_RELEASE_CHECKSUM_VERIFIED"],
    "TOOLCHAIN_AGE_SOURCE",
  );
  timestamp(input.observedAt, "TOOLCHAIN_TIME");
  return input;
};

export const verifyDeploymentAuthorizationEnvelope = (
  value: unknown,
  now = new Date(),
  expected?: {
    workflowId: string;
    featureId: string;
    sourceThreadId: string;
  },
): JsonRecord => {
  const input = record(value, "AUTH_ENVELOPE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "envelopeId",
      "envelopeSha256",
      "proposal",
      "proposalSha256",
      "authorization",
      "createdAt",
    ],
    "AUTH_ENVELOPE",
  );
  literal(input.schemaVersion, "1.0", "AUTH_VERSION");
  const proposal = record(input.proposal, "AUTH_PROPOSAL");
  exactKeys(
    proposal,
    [
      "workflowId",
      "featureId",
      "mergeCommitSha",
      "candidate",
      "target",
      "backupPolicy",
      "operations",
      "excludedOperations",
      "syntheticPublicReadConsent",
      "previousRelease",
      "toolchain",
      "proposedAt",
    ],
    "AUTH_PROPOSAL",
  );
  string(proposal.workflowId, "AUTH_WORKFLOW");
  string(proposal.featureId, "AUTH_FEATURE");
  if (
    expected !== undefined &&
    (proposal.workflowId !== expected.workflowId ||
      proposal.featureId !== expected.featureId)
  )
    throw new Error("AUTH_LIFECYCLE_BINDING");
  commit(proposal.mergeCommitSha, "AUTH_MERGE_COMMIT");
  const candidate = parseCandidateIdentity(proposal.candidate);
  if (candidate.sourceCommit !== proposal.mergeCommitSha)
    throw new Error("AUTH_CANDIDATE_MERGE");
  const target = parseDeploymentTarget(proposal.target);
  if (target.platform !== candidate.platform)
    throw new Error("AUTH_CANDIDATE_TARGET_PLATFORM");
  const backup = record(proposal.backupPolicy, "AUTH_BACKUP_POLICY");
  exactKeys(
    backup,
    [
      "backupRoot",
      "retentionCount",
      "schedule",
      "ageRecipientFingerprint",
      "minimumFreeBytes",
      "responsibleOperator",
    ],
    "AUTH_BACKUP_POLICY",
  );
  if (
    !String(backup.backupRoot).startsWith("/") ||
    backup.backupRoot === "/" ||
    String(backup.backupRoot).includes("..") ||
    backup.backupRoot === target.deployRoot
  )
    throw new Error("AUTH_BACKUP_ROOT");
  if (backup.retentionCount !== 7) throw new Error("AUTH_RETENTION");
  literal(backup.schedule, "daily", "AUTH_SCHEDULE");
  digest(backup.ageRecipientFingerprint, "AUTH_AGE_FINGERPRINT");
  integer(backup.minimumFreeBytes, 1, Number.MAX_SAFE_INTEGER, "AUTH_MIN_FREE");
  string(backup.responsibleOperator, "AUTH_OPERATOR", 120);
  const operations = sortedUnique(proposal.operations, "AUTH_OPERATIONS");
  const allowedOperations = new Set<string>([
    ...REQUIRED_OPERATIONS,
    "ROTATE_CREDENTIALS",
  ]);
  if (operations.some((operation) => !allowedOperations.has(operation)))
    throw new Error("AUTH_OPERATIONS_UNKNOWN");
  if (REQUIRED_OPERATIONS.some((operation) => !operations.includes(operation)))
    throw new Error("AUTH_OPERATIONS_REQUIRED");
  const exclusions = sortedUnique(
    proposal.excludedOperations,
    "AUTH_EXCLUSIONS",
  );
  if (
    exclusions.some(
      (operation) =>
        !REQUIRED_EXCLUSIONS.includes(
          operation as (typeof REQUIRED_EXCLUSIONS)[number],
        ),
    )
  )
    throw new Error("AUTH_EXCLUSIONS_UNKNOWN");
  if (REQUIRED_EXCLUSIONS.some((operation) => !exclusions.includes(operation)))
    throw new Error("AUTH_EXCLUSIONS_REQUIRED");
  if (proposal.syntheticPublicReadConsent !== true)
    throw new Error("AUTH_SYNTHETIC_CONSENT");
  if (proposal.previousRelease !== null)
    parseReleaseIdentity(proposal.previousRelease);
  parseToolchain(proposal.toolchain);
  const proposedAt = timestamp(proposal.proposedAt, "AUTH_PROPOSED_AT");
  const proposalSha = digest(input.proposalSha256, "AUTH_PROPOSAL_SHA");
  if (sha256(canonicalJson(proposal)) !== proposalSha)
    throw new Error("AUTH_PROPOSAL_DIGEST");
  const authorization = record(input.authorization, "AUTH_AUTHORITY");
  exactKeys(
    authorization,
    [
      "authorizedBy",
      "sourceThreadId",
      "authorizedAt",
      "expiresAt",
      "authorizationEvidenceSha256",
    ],
    "AUTH_AUTHORITY",
  );
  string(authorization.authorizedBy, "AUTH_AUTHORIZED_BY", 120);
  string(authorization.sourceThreadId, "AUTH_SOURCE_THREAD");
  if (
    expected !== undefined &&
    authorization.sourceThreadId !== expected.sourceThreadId
  )
    throw new Error("AUTH_SOURCE_THREAD");
  const authorizedAt = timestamp(
    authorization.authorizedAt,
    "AUTH_AUTHORIZED_AT",
  );
  const expiresAt = timestamp(authorization.expiresAt, "AUTH_EXPIRES_AT");
  digest(authorization.authorizationEvidenceSha256, "AUTH_EVIDENCE_SHA");
  if (
    Date.parse(authorizedAt) < Date.parse(proposedAt) ||
    Date.parse(expiresAt) <= Date.parse(authorizedAt) ||
    Date.parse(expiresAt) - Date.parse(authorizedAt) > 86_400_000
  ) {
    throw new Error("AUTH_TIME_WINDOW");
  }
  if (now.getTime() >= Date.parse(expiresAt)) throw new Error("AUTH_EXPIRED");
  timestamp(input.createdAt, "AUTH_CREATED_AT");
  if (Date.parse(String(input.createdAt)) < Date.parse(authorizedAt))
    throw new Error("AUTH_CREATED_AT");
  const envelopeSha = digest(input.envelopeSha256, "AUTH_ENVELOPE_SHA");
  if (canonicalSha256(input, ["envelopeId", "envelopeSha256"]) !== envelopeSha)
    throw new Error("AUTH_ENVELOPE_DIGEST");
  if (input.envelopeId !== `auth_${envelopeSha.slice(0, 32)}`)
    throw new Error("AUTH_ENVELOPE_ID");
  assertSanitized(input);
  return input;
};

const parseReleaseIdentity = (value: unknown): JsonRecord => {
  const input = record(value, "RELEASE_IDENTITY");
  exactKeys(
    input,
    ["releaseId", "sourceCommit", "imageId", "configSha256"],
    "RELEASE_IDENTITY",
  );
  safe(input.releaseId, "RELEASE_ID");
  commit(input.sourceCommit, "RELEASE_COMMIT");
  imageDigest(input.imageId, "RELEASE_IMAGE");
  digest(input.configSha256, "RELEASE_CONFIG");
  return input;
};

const transitionDigest = (transition: JsonRecord): string =>
  canonicalSha256(transition, ["transitionSha256"]);

export const createInitialTransition = (occurredAt: string): JsonRecord => {
  timestamp(occurredAt, "TRANSITION_TIME");
  const transition: JsonRecord = {
    sequence: 0,
    from: null,
    to: "PREPARED",
    occurredAt,
    reasonCode: "ATTEMPT_CREATED",
    evidenceSha256: null,
    previousTransitionSha256: null,
    transitionSha256: "",
  };
  transition.transitionSha256 = transitionDigest(transition);
  return transition;
};

const forwardStates: AttemptState[] = [
  "PREPARED",
  "PREFLIGHT_PASSED",
  "SAFETY_BACKUP_RESOLVED",
  "MIGRATION_SUCCEEDED",
  "APP_READY",
  "HTTPS_READY",
  "INITIAL_SMOKE_PASSED",
  "POST_DEPLOY_BACKUP_VERIFIED",
  "RESTORE_ENV_READY",
  "RESTORE_VERIFIED",
  "PRODUCTION_UNCHANGED_VERIFIED",
  "POST_RESTORE_SMOKE_PASSED",
  "DEPLOYED",
];

export const isLegalTransition = (
  from: AttemptState,
  to: AttemptState,
): boolean => {
  const index = forwardStates.indexOf(from);
  if (index >= 0 && forwardStates[index + 1] === to) return true;
  if (
    forwardStates.slice(0, -1).includes(from) &&
    (to === "INTERRUPTED" || to === "FAILED")
  )
    return true;
  if (from === "INTERRUPTED" && to === "RESUMING") return true;
  if (from === "RESUMING" && forwardStates.slice(1, -1).includes(to))
    return true;
  if (from === "FAILED" && to === "ROLLING_BACK") return true;
  if (
    from === "ROLLING_BACK" &&
    (to === "ROLLED_BACK" || to === "ROLLBACK_FAILED")
  )
    return true;
  return false;
};

export const appendTransition = (
  log: readonly JsonRecord[],
  to: AttemptState,
  occurredAt: string,
  reasonCode: string,
  evidenceSha256: string,
): JsonRecord[] => {
  verifyTransitionLog(log);
  const previous = log.at(-1);
  if (previous === undefined) throw new Error("TRANSITION_LOG_EMPTY");
  const from = previous.to as AttemptState;
  if (!isLegalTransition(from, to)) throw new Error("TRANSITION_ILLEGAL");
  timestamp(occurredAt, "TRANSITION_TIME");
  digest(evidenceSha256, "TRANSITION_EVIDENCE");
  const transition: JsonRecord = {
    sequence: log.length,
    from,
    to,
    occurredAt,
    reasonCode: safe(reasonCode, "TRANSITION_REASON"),
    evidenceSha256,
    previousTransitionSha256: previous.transitionSha256,
    transitionSha256: "",
  };
  transition.transitionSha256 = transitionDigest(transition);
  return [...log, transition];
};

export const verifyTransitionLog = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64)
    throw new Error("TRANSITION_LOG");
  const log = value.map((candidate, index) => {
    const input = record(candidate, "TRANSITION");
    exactKeys(
      input,
      [
        "sequence",
        "from",
        "to",
        "occurredAt",
        "reasonCode",
        "evidenceSha256",
        "previousTransitionSha256",
        "transitionSha256",
      ],
      "TRANSITION",
    );
    if (integer(input.sequence, 0, 63, "TRANSITION_SEQUENCE") !== index)
      throw new Error("TRANSITION_SEQUENCE");
    const to = enumeration(input.to, ATTEMPT_STATES, "TRANSITION_TO");
    timestamp(input.occurredAt, "TRANSITION_TIME");
    safe(input.reasonCode, "TRANSITION_REASON");
    const expectedPrevious =
      index === 0 ? null : value[index - 1]?.transitionSha256;
    if (input.previousTransitionSha256 !== expectedPrevious)
      throw new Error("TRANSITION_CHAIN");
    if (index === 0) {
      if (
        input.from !== null ||
        to !== "PREPARED" ||
        input.evidenceSha256 !== null
      )
        throw new Error("TRANSITION_INITIAL");
    } else {
      const from = enumeration(input.from, ATTEMPT_STATES, "TRANSITION_FROM");
      if (!isLegalTransition(from, to) || value[index - 1]?.to !== from)
        throw new Error("TRANSITION_ILLEGAL");
      digest(input.evidenceSha256, "TRANSITION_EVIDENCE");
    }
    const transitionSha = digest(input.transitionSha256, "TRANSITION_SHA");
    if (transitionDigest(input) !== transitionSha)
      throw new Error("TRANSITION_DIGEST");
    return input;
  });
  return log;
};

export const assertionSetSha256 = (assertions: unknown): string => {
  if (!Array.isArray(assertions)) throw new Error("SMOKE_ASSERTIONS");
  const stable = assertions.map((candidate) => {
    const assertion = record(candidate, "SMOKE_ASSERTION");
    return {
      id: assertion.id,
      status: assertion.status,
      httpStatus: assertion.httpStatus,
      valueSha256: assertion.valueSha256,
      reasonCode: assertion.reasonCode,
    };
  });
  return sha256(canonicalJson(stable));
};

export const verifySmokeEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "SMOKE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "smokeId",
      "smokeSha256",
      "mode",
      "attemptId",
      "targetId",
      "candidateManifestSha256",
      "origin",
      "observedAt",
      "certificate",
      "syntheticStorySha256",
      "resourceIdsSha256",
      "assertionSetSha256",
      "assertions",
      "status",
    ],
    "SMOKE",
  );
  literal(input.schemaVersion, "1.0", "SMOKE_VERSION");
  safe(input.smokeId, "SMOKE_ID");
  const mode = enumeration(
    input.mode,
    ["LOCAL", "EXTERNAL_INITIAL", "EXTERNAL_POST_RESTORE"],
    "SMOKE_MODE",
  );
  safe(input.attemptId, "SMOKE_ATTEMPT");
  string(input.targetId, "SMOKE_TARGET");
  digest(input.candidateManifestSha256, "SMOKE_CANDIDATE");
  const origin = string(input.origin, "SMOKE_ORIGIN", 512);
  const parsedOrigin = new URL(origin);
  if (mode === "LOCAL") {
    if (
      parsedOrigin.protocol !== "https:" ||
      !["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname) ||
      input.certificate !== null
    )
      throw new Error("SMOKE_LOCAL_ORIGIN");
  } else {
    if (
      parsedOrigin.protocol !== "https:" ||
      parsedOrigin.pathname !== "/" ||
      input.certificate === null
    )
      throw new Error("SMOKE_EXTERNAL_ORIGIN");
    const certificate = record(input.certificate, "SMOKE_CERTIFICATE");
    exactKeys(
      certificate,
      ["hostname", "notBefore", "notAfter", "issuerSha256", "trusted"],
      "SMOKE_CERTIFICATE",
    );
    string(certificate.hostname, "SMOKE_CERT_HOST");
    timestamp(certificate.notBefore, "SMOKE_CERT_NOT_BEFORE");
    timestamp(certificate.notAfter, "SMOKE_CERT_NOT_AFTER");
    digest(certificate.issuerSha256, "SMOKE_CERT_ISSUER");
    if (certificate.trusted !== true) throw new Error("SMOKE_CERT_TRUST");
  }
  timestamp(input.observedAt, "SMOKE_TIME");
  digest(input.syntheticStorySha256, "SMOKE_STORY");
  digest(input.resourceIdsSha256, "SMOKE_RESOURCES");
  const assertions = input.assertions;
  if (!Array.isArray(assertions) || assertions.length < 1)
    throw new Error("SMOKE_ASSERTIONS");
  const ids = assertions.map((candidate) => {
    const assertion = record(candidate, "SMOKE_ASSERTION");
    exactKeys(
      assertion,
      [
        "id",
        "status",
        "observedAt",
        "requestId",
        "httpStatus",
        "valueSha256",
        "reasonCode",
      ],
      "SMOKE_ASSERTION",
    );
    const id = safe(assertion.id, "SMOKE_ASSERTION_ID");
    literal(assertion.status, "PASS", "SMOKE_ASSERTION_STATUS");
    timestamp(assertion.observedAt, "SMOKE_ASSERTION_TIME");
    if (assertion.requestId !== null)
      string(assertion.requestId, "SMOKE_REQUEST_ID");
    if (assertion.httpStatus !== null)
      integer(assertion.httpStatus, 100, 599, "SMOKE_HTTP_STATUS");
    if (assertion.valueSha256 !== null)
      digest(assertion.valueSha256, "SMOKE_VALUE_SHA");
    safe(assertion.reasonCode, "SMOKE_REASON");
    return id;
  });
  if (new Set(ids).size !== ids.length)
    throw new Error("SMOKE_ASSERTION_DUPLICATE");
  if (
    [...ids].sort().join("\0") !== [...REQUIRED_SMOKE_ASSERTION_IDS].join("\0")
  )
    throw new Error("SMOKE_ASSERTION_SET");
  const setSha = digest(input.assertionSetSha256, "SMOKE_ASSERTION_SET_SHA");
  if (assertionSetSha256(assertions) !== setSha)
    throw new Error("SMOKE_ASSERTION_SET_DIGEST");
  literal(input.status, "PASS", "SMOKE_STATUS");
  const smokeSha = digest(input.smokeSha256, "SMOKE_SHA");
  if (canonicalSha256(input, ["smokeSha256"]) !== smokeSha)
    throw new Error("SMOKE_DIGEST");
  assertSanitized(input);
  return input;
};

export const verifyBackupManifest = (value: unknown): JsonRecord => {
  const input = record(value, "BACKUP");
  exactKeys(
    input,
    [
      "schemaVersion",
      "backupId",
      "backupManifestSha256",
      "purpose",
      "envelopeId",
      "attemptId",
      "targetId",
      "sourceDatabase",
      "sourceRelease",
      "candidateManifestSha256",
      "migrationCatalogSha256",
      "syntheticStorySha256",
      "createdAt",
      "ciphertext",
      "encryption",
      "tool",
      "verification",
    ],
    "BACKUP",
  );
  literal(input.schemaVersion, "1.0", "BACKUP_VERSION");
  safe(input.backupId, "BACKUP_ID");
  enumeration(
    input.purpose,
    ["PRE_MIGRATION_SAFETY", "POST_DEPLOY_RECOVERABILITY"],
    "BACKUP_PURPOSE",
  );
  safe(input.envelopeId, "BACKUP_ENVELOPE");
  safe(input.attemptId, "BACKUP_ATTEMPT");
  string(input.targetId, "BACKUP_TARGET");
  parseDatabaseIdentity(input.sourceDatabase);
  parseReleaseIdentity(input.sourceRelease);
  digest(input.candidateManifestSha256, "BACKUP_CANDIDATE");
  digest(input.migrationCatalogSha256, "BACKUP_MIGRATION");
  if (input.syntheticStorySha256 !== null)
    digest(input.syntheticStorySha256, "BACKUP_STORY");
  if (
    input.purpose === "POST_DEPLOY_RECOVERABILITY" &&
    input.syntheticStorySha256 === null
  )
    throw new Error("BACKUP_STORY_REQUIRED");
  if (
    input.purpose === "PRE_MIGRATION_SAFETY" &&
    input.syntheticStorySha256 !== null
  )
    throw new Error("BACKUP_STORY_FORBIDDEN");
  timestamp(input.createdAt, "BACKUP_TIME");
  const ciphertext = record(input.ciphertext, "BACKUP_CIPHERTEXT");
  exactKeys(
    ciphertext,
    ["basename", "sizeBytes", "sha256"],
    "BACKUP_CIPHERTEXT",
  );
  safe(ciphertext.basename, "BACKUP_CIPHERTEXT_NAME");
  integer(
    ciphertext.sizeBytes,
    1,
    10 * 1024 * 1024 * 1024,
    "BACKUP_CIPHERTEXT_SIZE",
  );
  digest(ciphertext.sha256, "BACKUP_CIPHERTEXT_SHA");
  const encryption = record(input.encryption, "BACKUP_ENCRYPTION");
  exactKeys(
    encryption,
    ["algorithm", "recipientFingerprint"],
    "BACKUP_ENCRYPTION",
  );
  literal(encryption.algorithm, "age-v1", "BACKUP_ENCRYPTION_ALGORITHM");
  digest(encryption.recipientFingerprint, "BACKUP_RECIPIENT");
  const tool = record(input.tool, "BACKUP_TOOL");
  exactKeys(tool, ["pgDumpVersion", "ageVersion", "format"], "BACKUP_TOOL");
  string(tool.pgDumpVersion, "BACKUP_PGDUMP_VERSION");
  string(tool.ageVersion, "BACKUP_AGE_VERSION");
  literal(tool.format, "custom", "BACKUP_FORMAT");
  const verification = record(input.verification, "BACKUP_VERIFICATION");
  exactKeys(
    verification,
    ["status", "verifiedAt", "pgRestoreListSha256"],
    "BACKUP_VERIFICATION",
  );
  literal(verification.status, "PASS", "BACKUP_VERIFY_STATUS");
  timestamp(verification.verifiedAt, "BACKUP_VERIFY_TIME");
  digest(verification.pgRestoreListSha256, "BACKUP_RESTORE_LIST_SHA");
  const manifestSha = digest(input.backupManifestSha256, "BACKUP_MANIFEST_SHA");
  if (canonicalSha256(input, ["backupManifestSha256"]) !== manifestSha)
    throw new Error("BACKUP_DIGEST");
  assertSanitized(input);
  return input;
};

const parseDatabaseIdentity = (value: unknown): JsonRecord => {
  const input = record(value, "DATABASE_IDENTITY");
  exactKeys(
    input,
    [
      "targetId",
      "project",
      "containerId",
      "volumeName",
      "volumeMountId",
      "systemIdentifier",
      "databaseName",
      "postgresVersion",
      "databaseInstanceSha256",
    ],
    "DATABASE_IDENTITY",
  );
  string(input.targetId, "DATABASE_TARGET");
  safe(input.project, "DATABASE_PROJECT");
  safe(input.containerId, "DATABASE_CONTAINER");
  safe(input.volumeName, "DATABASE_VOLUME");
  safe(input.volumeMountId, "DATABASE_MOUNT");
  if (!/^\d+$/u.test(string(input.systemIdentifier, "DATABASE_SYSTEM_ID")))
    throw new Error("DATABASE_SYSTEM_ID");
  safe(input.databaseName, "DATABASE_NAME");
  string(input.postgresVersion, "DATABASE_POSTGRES_VERSION");
  const instanceSha = digest(
    input.databaseInstanceSha256,
    "DATABASE_INSTANCE_SHA",
  );
  if (canonicalSha256(input, ["databaseInstanceSha256"]) !== instanceSha)
    throw new Error("DATABASE_IDENTITY_DIGEST");
  return input;
};

export const verifyRestoreEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "RESTORE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "restoreId",
      "restoreEvidenceSha256",
      "envelopeId",
      "attemptId",
      "targetId",
      "candidateManifestSha256",
      "backup",
      "sourceDatabaseInstanceSha256",
      "isolatedTarget",
      "startedAt",
      "finishedAt",
      "migration",
      "restoredStory",
      "productionBefore",
      "productionAfter",
      "cleanup",
      "status",
    ],
    "RESTORE",
  );
  literal(input.schemaVersion, "1.0", "RESTORE_VERSION");
  safe(input.restoreId, "RESTORE_ID");
  safe(input.envelopeId, "RESTORE_ENVELOPE");
  safe(input.attemptId, "RESTORE_ATTEMPT");
  string(input.targetId, "RESTORE_TARGET");
  digest(input.candidateManifestSha256, "RESTORE_CANDIDATE");
  const backup = record(input.backup, "RESTORE_BACKUP");
  exactKeys(
    backup,
    ["backupId", "backupManifestSha256", "ciphertextSha256", "purpose"],
    "RESTORE_BACKUP",
  );
  safe(backup.backupId, "RESTORE_BACKUP_ID");
  digest(backup.backupManifestSha256, "RESTORE_BACKUP_MANIFEST_SHA");
  digest(backup.ciphertextSha256, "RESTORE_CIPHERTEXT_SHA");
  literal(
    backup.purpose,
    "POST_DEPLOY_RECOVERABILITY",
    "RESTORE_BACKUP_PURPOSE",
  );
  digest(input.sourceDatabaseInstanceSha256, "RESTORE_SOURCE_DB");
  const isolated = record(input.isolatedTarget, "RESTORE_ISOLATED_TARGET");
  exactKeys(
    isolated,
    [
      "kind",
      "composeProject",
      "systemIdentifier",
      "volumeLabelSha256",
      "containerLabelSha256",
      "origin",
      "databaseName",
    ],
    "RESTORE_ISOLATED_TARGET",
  );
  literal(isolated.kind, "ISOLATED", "RESTORE_TARGET_KIND");
  if (!String(isolated.composeProject).startsWith("lp05-restore-"))
    throw new Error("RESTORE_PROJECT");
  string(isolated.systemIdentifier, "RESTORE_SYSTEM_ID");
  digest(isolated.volumeLabelSha256, "RESTORE_VOLUME_LABEL");
  digest(isolated.containerLabelSha256, "RESTORE_CONTAINER_LABEL");
  const origin = new URL(string(isolated.origin, "RESTORE_ORIGIN"));
  if (!["127.0.0.1", "localhost", "::1"].includes(origin.hostname))
    throw new Error("RESTORE_ORIGIN");
  if (!String(isolated.databaseName).endsWith("_restore"))
    throw new Error("RESTORE_DATABASE_NAME");
  const startedAt = timestamp(input.startedAt, "RESTORE_STARTED_AT");
  const finishedAt = timestamp(input.finishedAt, "RESTORE_FINISHED_AT");
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    throw new Error("RESTORE_TIME_ORDER");
  parseMigrationEvidence(input.migration);
  const story = record(input.restoredStory, "RESTORE_STORY");
  exactKeys(
    story,
    [
      "syntheticStorySha256",
      "resourceIdsSha256",
      "assertionSetSha256",
      "status",
    ],
    "RESTORE_STORY",
  );
  digest(story.syntheticStorySha256, "RESTORE_STORY_SHA");
  digest(story.resourceIdsSha256, "RESTORE_RESOURCE_SHA");
  digest(story.assertionSetSha256, "RESTORE_ASSERTION_SHA");
  literal(story.status, "PASS", "RESTORE_STORY_STATUS");
  if (!deepEqual(input.productionBefore, input.productionAfter))
    throw new Error("RESTORE_PRODUCTION_CHANGED");
  const cleanup = record(input.cleanup, "RESTORE_CLEANUP");
  exactKeys(
    cleanup,
    ["status", "completedAt", "resourceLabelSha256"],
    "RESTORE_CLEANUP",
  );
  literal(cleanup.status, "PASS", "RESTORE_CLEANUP_STATUS");
  timestamp(cleanup.completedAt, "RESTORE_CLEANUP_TIME");
  digest(cleanup.resourceLabelSha256, "RESTORE_CLEANUP_SHA");
  literal(input.status, "PASS", "RESTORE_STATUS");
  const restoreSha = digest(input.restoreEvidenceSha256, "RESTORE_SHA");
  if (canonicalSha256(input, ["restoreEvidenceSha256"]) !== restoreSha)
    throw new Error("RESTORE_DIGEST");
  assertSanitized(input);
  return input;
};

const parseMigrationEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "MIGRATION_EVIDENCE");
  exactKeys(
    input,
    ["catalogSha256", "appliedLedgerSha256", "entries", "status", "verifiedAt"],
    "MIGRATION_EVIDENCE",
  );
  digest(input.catalogSha256, "MIGRATION_CATALOG_SHA");
  digest(input.appliedLedgerSha256, "MIGRATION_LEDGER_SHA");
  if (!Array.isArray(input.entries) || input.entries.length !== 3)
    throw new Error("MIGRATION_ENTRIES");
  input.entries.forEach((candidate) => {
    const entry = record(candidate, "MIGRATION_ENTRY");
    exactKeys(entry, ["id", "sha256", "ledger"], "MIGRATION_ENTRY");
    safe(entry.id, "MIGRATION_ID");
    digest(entry.sha256, "MIGRATION_SHA");
    enumeration(entry.ledger, ["legacy", "feature"], "MIGRATION_LEDGER");
  });
  literal(input.status, "PASS", "MIGRATION_STATUS");
  timestamp(input.verifiedAt, "MIGRATION_TIME");
  return input;
};

export const verifyCrossRecordEquality = (input: {
  candidate: CandidateIdentityV1;
  targetId: string;
  initialSmoke: JsonRecord;
  postDeployBackup: JsonRecord;
  restore: JsonRecord;
  postRestoreSmoke: JsonRecord;
}): void => {
  const initial = verifySmokeEvidence(input.initialSmoke);
  const backup = verifyBackupManifest(input.postDeployBackup);
  const restore = verifyRestoreEvidence(input.restore);
  const post = verifySmokeEvidence(input.postRestoreSmoke);
  const candidateSha = input.candidate.manifestSha256;
  const refs = [
    initial.candidateManifestSha256,
    backup.candidateManifestSha256,
    restore.candidateManifestSha256,
    post.candidateManifestSha256,
  ];
  if (refs.some((value) => value !== candidateSha))
    throw new Error("EQUALITY_CANDIDATE");
  if (
    [initial.targetId, backup.targetId, restore.targetId, post.targetId].some(
      (value) => value !== input.targetId,
    )
  )
    throw new Error("EQUALITY_TARGET");
  if (
    initial.mode !== "EXTERNAL_INITIAL" ||
    post.mode !== "EXTERNAL_POST_RESTORE"
  )
    throw new Error("EQUALITY_SMOKE_MODE");
  const restoredStory = record(restore.restoredStory);
  if (
    backup.syntheticStorySha256 !== initial.syntheticStorySha256 ||
    restoredStory.syntheticStorySha256 !== initial.syntheticStorySha256 ||
    post.syntheticStorySha256 !== initial.syntheticStorySha256 ||
    restoredStory.resourceIdsSha256 !== initial.resourceIdsSha256 ||
    post.resourceIdsSha256 !== initial.resourceIdsSha256 ||
    restoredStory.assertionSetSha256 !== initial.assertionSetSha256 ||
    post.assertionSetSha256 !== initial.assertionSetSha256
  )
    throw new Error("EQUALITY_SYNTHETIC_STORY");
  const restoreBackup = record(restore.backup);
  if (
    restoreBackup.backupId !== backup.backupId ||
    restoreBackup.backupManifestSha256 !== backup.backupManifestSha256 ||
    restoreBackup.ciphertextSha256 !== record(backup.ciphertext).sha256
  ) {
    throw new Error("EQUALITY_BACKUP");
  }
};

export const verifyDeploymentEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "DEPLOYMENT_EVIDENCE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "deploymentEvidenceId",
      "deploymentEvidenceSha256",
      "workflowId",
      "featureId",
      "mergeCommitSha",
      "envelopeId",
      "envelopeSha256",
      "attemptId",
      "attemptRecordSha256",
      "candidate",
      "target",
      "migration",
      "initialSmoke",
      "postDeployBackup",
      "restoreEvidence",
      "productionUnchangedSha256",
      "postRestoreSmoke",
      "transitionTailSha256",
      "operationsPerformed",
      "startedAt",
      "completedAt",
      "knownLimitations",
      "status",
    ],
    "DEPLOYMENT_EVIDENCE",
  );
  literal(input.schemaVersion, "1.0", "DEPLOYMENT_VERSION");
  safe(input.deploymentEvidenceId, "DEPLOYMENT_ID");
  string(input.workflowId, "DEPLOYMENT_WORKFLOW");
  string(input.featureId, "DEPLOYMENT_FEATURE");
  commit(input.mergeCommitSha, "DEPLOYMENT_MERGE_COMMIT");
  safe(input.envelopeId, "DEPLOYMENT_ENVELOPE");
  digest(input.envelopeSha256, "DEPLOYMENT_ENVELOPE_SHA");
  safe(input.attemptId, "DEPLOYMENT_ATTEMPT");
  digest(input.attemptRecordSha256, "DEPLOYMENT_ATTEMPT_SHA");
  parseCandidateIdentity(input.candidate);
  const target = record(input.target, "DEPLOYMENT_TARGET");
  exactKeys(
    target,
    ["targetId", "domain", "hostFingerprintSha256"],
    "DEPLOYMENT_TARGET",
  );
  string(target.targetId, "DEPLOYMENT_TARGET_ID");
  string(target.domain, "DEPLOYMENT_DOMAIN");
  digest(target.hostFingerprintSha256, "DEPLOYMENT_HOST_SHA");
  parseMigrationEvidence(input.migration);
  [
    "initialSmoke",
    "postDeployBackup",
    "restoreEvidence",
    "postRestoreSmoke",
  ].forEach((field) => record(input[field], `DEPLOYMENT_${field}`));
  digest(input.productionUnchangedSha256, "DEPLOYMENT_PRODUCTION_UNCHANGED");
  digest(input.transitionTailSha256, "DEPLOYMENT_TRANSITION_TAIL");
  sortedUnique(input.operationsPerformed, "DEPLOYMENT_OPERATIONS");
  const startedAt = timestamp(input.startedAt, "DEPLOYMENT_STARTED");
  const completedAt = timestamp(input.completedAt, "DEPLOYMENT_COMPLETED");
  if (Date.parse(completedAt) < Date.parse(startedAt))
    throw new Error("DEPLOYMENT_TIME_ORDER");
  sortedUnique(input.knownLimitations, "DEPLOYMENT_LIMITATIONS", 20);
  literal(input.status, "PASS", "DEPLOYMENT_STATUS");
  const evidenceSha = digest(input.deploymentEvidenceSha256, "DEPLOYMENT_SHA");
  if (canonicalSha256(input, ["deploymentEvidenceSha256"]) !== evidenceSha)
    throw new Error("DEPLOYMENT_DIGEST");
  assertSanitized(input);
  return input;
};
