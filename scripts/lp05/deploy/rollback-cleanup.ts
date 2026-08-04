import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  exactKeys,
  parseCandidateIdentity,
  parseDeploymentTarget,
  parseIsolatedRestoreTarget,
  record,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite, exists } from "../shared/filesystem.js";

export type CleanupDockerRunner = (
  args: readonly string[],
  environment?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) => Promise<string>;

export type CleanupScope = "PRODUCTION" | "RESTORE";
type LifecycleState =
  "CREATING" | "READY" | "QUIESCING" | "CLEANED" | "CLEANUP_FAILED";

const SHA = /^[0-9a-f]{64}$/u;
const DOCKER_ID = /^[0-9a-f]{12,64}$/u;
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const MAX_RESOURCES = 10_000;
const EMPTY_RESOURCE_SET_SHA256 = sha256(canonicalJson([]));

export const CLEANUP_POLICY = Object.freeze({
  emptySampleCount: 3,
  sampleIntervalMs: 250,
  maximumSamples: 15,
  maximumDurationMs: 30_000,
});

const safe = (value: unknown, code: string): string => {
  if (
    typeof value !== "string" ||
    !SAFE.test(value) ||
    value === "." ||
    value === ".."
  )
    throw new Error(code);
  return value;
};

const boundedString = (value: unknown, code: string, maximum = 512): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.normalize("NFC")
  )
    throw new Error(code);
  return value;
};

const digest = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !SHA.test(value)) throw new Error(code);
  return value;
};

const timestamp = (value: unknown, code: string): string => {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    Number.isNaN(Date.parse(value))
  )
    throw new Error(code);
  return value;
};

const lines = (value: string): string[] =>
  value.split(/\r?\n/u).filter((entry) => entry !== "");

const authority = (attemptValue: unknown): JsonRecord => {
  const attempt = record(attemptValue, "CLEANUP_ATTEMPT");
  const target = parseDeploymentTarget(attempt.target);
  const candidate = parseCandidateIdentity(attempt.candidate);
  return {
    attemptId: safe(attempt.attemptId, "CLEANUP_ATTEMPT_ID"),
    envelopeId: safe(attempt.envelopeId, "CLEANUP_ENVELOPE_ID"),
    targetId: target.targetId,
    candidateManifestSha256: candidate.manifestSha256,
  };
};

export const attemptAuthorityEnvironment = (
  attempt: unknown,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const value = authority(attempt);
  return {
    ...environment,
    IDEA_VALIDATION_ATTEMPT_ID: String(value.attemptId),
    IDEA_VALIDATION_TARGET_ID: String(value.targetId),
    IDEA_VALIDATION_CANDIDATE_MANIFEST_SHA256: String(
      value.candidateManifestSha256,
    ),
  };
};

const requiredLabels = (input: {
  labels: JsonRecord;
  project: string;
  environment: "production" | "isolated-restore";
  attempt: JsonRecord;
  code: string;
  enforceAuthority?: boolean;
}): {
  role: string;
  attemptId: string;
  targetId: string;
  candidateManifestSha256: string;
  sha256: string;
} => {
  const expected = authority(input.attempt);
  const projection: JsonRecord = {
    composeProject: input.labels["com.docker.compose.project"] ?? null,
    environment: input.labels["io.idea-validation.environment"] ?? null,
    role: input.labels["io.idea-validation.role"] ?? null,
    attemptId: input.labels["io.idea-validation.attempt-id"] ?? null,
    targetId: input.labels["io.idea-validation.target-id"] ?? null,
    candidateManifestSha256:
      input.labels["io.idea-validation.candidate-manifest-sha256"] ?? null,
  };
  const enforce = input.enforceAuthority ?? true;
  const role = enforce
    ? safe(projection.role, `${input.code}_ROLE`)
    : typeof projection.role === "string" && SAFE.test(projection.role)
      ? projection.role
      : "historical-resource";
  const attemptId = enforce
    ? safe(projection.attemptId, `${input.code}_ATTEMPT`)
    : typeof projection.attemptId === "string" &&
        SAFE.test(projection.attemptId)
      ? projection.attemptId
      : "historical";
  const targetId = enforce
    ? safe(projection.targetId, `${input.code}_TARGET`)
    : typeof projection.targetId === "string" && SAFE.test(projection.targetId)
      ? projection.targetId
      : String(expected.targetId);
  const candidateManifestSha256 = enforce
    ? digest(projection.candidateManifestSha256, `${input.code}_CANDIDATE`)
    : typeof projection.candidateManifestSha256 === "string" &&
        SHA.test(projection.candidateManifestSha256)
      ? projection.candidateManifestSha256
      : "0".repeat(64);
  if (
    projection.composeProject !== input.project ||
    (enforce && projection.environment !== input.environment) ||
    (enforce &&
      (attemptId !== expected.attemptId ||
        targetId !== expected.targetId ||
        candidateManifestSha256 !== expected.candidateManifestSha256))
  )
    throw new Error(`${input.code}_AUTHORITY`);
  return {
    role,
    attemptId,
    targetId,
    candidateManifestSha256,
    sha256: canonicalSha256(projection),
  };
};

const finalizeIdentity = (identity: JsonRecord): JsonRecord => {
  const output = { ...identity, identitySha256: "" };
  output.identitySha256 = canonicalSha256(output, ["identitySha256"]);
  return verifyDockerResourceIdentity(output);
};

export const verifyDockerResourceIdentity = (value: unknown): JsonRecord => {
  const input = record(value, "DOCKER_RESOURCE_IDENTITY");
  exactKeys(
    input,
    [
      "kind",
      "locator",
      "dockerId",
      "name",
      "composeProject",
      "service",
      "role",
      "attemptId",
      "targetId",
      "candidateManifestSha256",
      "createdAt",
      "driver",
      "scope",
      "mountpointSha256",
      "imageId",
      "requiredLabelsSha256",
      "identitySha256",
    ],
    "DOCKER_RESOURCE_IDENTITY",
  );
  if (!["CONTAINER", "NETWORK", "VOLUME"].includes(String(input.kind)))
    throw new Error("DOCKER_RESOURCE_KIND");
  const kind = String(input.kind);
  safe(input.locator, "DOCKER_RESOURCE_LOCATOR");
  safe(input.name, "DOCKER_RESOURCE_NAME");
  safe(input.composeProject, "DOCKER_RESOURCE_PROJECT");
  safe(input.role, "DOCKER_RESOURCE_ROLE");
  safe(input.attemptId, "DOCKER_RESOURCE_ATTEMPT");
  safe(input.targetId, "DOCKER_RESOURCE_TARGET");
  digest(input.candidateManifestSha256, "DOCKER_RESOURCE_CANDIDATE");
  timestamp(input.createdAt, "DOCKER_RESOURCE_CREATED_AT");
  digest(input.requiredLabelsSha256, "DOCKER_RESOURCE_LABELS_SHA");
  digest(input.identitySha256, "DOCKER_RESOURCE_IDENTITY_SHA");
  if (
    (kind === "VOLUME" && input.dockerId !== null) ||
    (kind !== "VOLUME" &&
      (typeof input.dockerId !== "string" ||
        !DOCKER_ID.test(input.dockerId) ||
        input.locator !== input.dockerId))
  )
    throw new Error("DOCKER_RESOURCE_DOCKER_ID");
  if (
    (kind === "CONTAINER" &&
      (typeof input.service !== "string" ||
        !SAFE.test(input.service) ||
        input.driver !== null ||
        input.scope !== null ||
        input.mountpointSha256 !== null ||
        typeof input.imageId !== "string")) ||
    (kind === "NETWORK" &&
      (input.service !== null ||
        typeof input.driver !== "string" ||
        !SAFE.test(input.driver) ||
        typeof input.scope !== "string" ||
        !SAFE.test(input.scope) ||
        input.mountpointSha256 !== null ||
        input.imageId !== null)) ||
    (kind === "VOLUME" &&
      (input.service !== null ||
        typeof input.driver !== "string" ||
        !SAFE.test(input.driver) ||
        typeof input.scope !== "string" ||
        !SAFE.test(input.scope) ||
        typeof input.mountpointSha256 !== "string" ||
        !SHA.test(input.mountpointSha256) ||
        input.imageId !== null))
  )
    throw new Error("DOCKER_RESOURCE_VARIANT");
  if (canonicalSha256(input, ["identitySha256"]) !== input.identitySha256)
    throw new Error("DOCKER_RESOURCE_IDENTITY_DIGEST");
  return input;
};

const inspectOne = async (input: {
  kind: "CONTAINER" | "NETWORK" | "VOLUME";
  locator: string;
  project: string;
  expectedEnvironment: "production" | "isolated-restore";
  attempt: JsonRecord;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  enforceAuthority?: boolean;
}): Promise<JsonRecord> => {
  const args =
    input.kind === "VOLUME"
      ? ["volume", "inspect", input.locator]
      : input.kind === "NETWORK"
        ? ["network", "inspect", input.locator]
        : ["inspect", input.locator];
  const values = JSON.parse(
    await input.runDocker(args, input.environment),
  ) as unknown[];
  if (!Array.isArray(values) || values.length !== 1)
    throw new Error(`DOCKER_${input.kind}_INSPECT_COUNT`);
  const inspected = record(values[0], `DOCKER_${input.kind}_INSPECT`);
  const labels =
    input.kind === "CONTAINER"
      ? record(record(inspected.Config, "DOCKER_CONTAINER_CONFIG").Labels)
      : record(inspected.Labels, `DOCKER_${input.kind}_LABELS`);
  const label = requiredLabels({
    labels,
    project: input.project,
    environment: input.expectedEnvironment,
    attempt: input.attempt,
    code: `DOCKER_${input.kind}`,
    enforceAuthority: input.enforceAuthority,
  });
  if (input.kind === "CONTAINER") {
    const dockerId = String(inspected.Id);
    if (!DOCKER_ID.test(dockerId)) throw new Error("DOCKER_CONTAINER_ID");
    return finalizeIdentity({
      kind: "CONTAINER",
      locator: dockerId,
      dockerId,
      name: safe(
        String(inspected.Name).replace(/^\//u, ""),
        "DOCKER_CONTAINER_NAME",
      ),
      composeProject: input.project,
      service: safe(
        labels["com.docker.compose.service"],
        "DOCKER_CONTAINER_SERVICE",
      ),
      role: label.role,
      attemptId: label.attemptId,
      targetId: label.targetId,
      candidateManifestSha256: label.candidateManifestSha256,
      createdAt: timestamp(inspected.Created, "DOCKER_CONTAINER_CREATED"),
      driver: null,
      scope: null,
      mountpointSha256: null,
      imageId: boundedString(inspected.Image, "DOCKER_CONTAINER_IMAGE", 128),
      requiredLabelsSha256: label.sha256,
      identitySha256: "",
    });
  }
  if (input.kind === "NETWORK") {
    const dockerId = String(inspected.Id);
    if (!DOCKER_ID.test(dockerId)) throw new Error("DOCKER_NETWORK_ID");
    return finalizeIdentity({
      kind: "NETWORK",
      locator: dockerId,
      dockerId,
      name: safe(inspected.Name, "DOCKER_NETWORK_NAME"),
      composeProject: input.project,
      service: null,
      role: label.role,
      attemptId: label.attemptId,
      targetId: label.targetId,
      candidateManifestSha256: label.candidateManifestSha256,
      createdAt: timestamp(inspected.Created, "DOCKER_NETWORK_CREATED"),
      driver: safe(inspected.Driver, "DOCKER_NETWORK_DRIVER"),
      scope: safe(inspected.Scope, "DOCKER_NETWORK_SCOPE"),
      mountpointSha256: null,
      imageId: null,
      requiredLabelsSha256: label.sha256,
      identitySha256: "",
    });
  }
  return finalizeIdentity({
    kind: "VOLUME",
    locator: safe(inspected.Name, "DOCKER_VOLUME_NAME"),
    dockerId: null,
    name: safe(inspected.Name, "DOCKER_VOLUME_NAME"),
    composeProject: input.project,
    service: null,
    role: label.role,
    attemptId: label.attemptId,
    targetId: label.targetId,
    candidateManifestSha256: label.candidateManifestSha256,
    createdAt: timestamp(inspected.CreatedAt, "DOCKER_VOLUME_CREATED"),
    driver: safe(inspected.Driver, "DOCKER_VOLUME_DRIVER"),
    scope: safe(inspected.Scope, "DOCKER_VOLUME_SCOPE"),
    mountpointSha256: sha256(String(inspected.Mountpoint)),
    imageId: null,
    requiredLabelsSha256: label.sha256,
    identitySha256: "",
  });
};

const finalizeObservation = (input: {
  observedAt: string;
  containers: JsonRecord[];
  networks: JsonRecord[];
  volumes: JsonRecord[];
}): JsonRecord => {
  const sort = (values: JsonRecord[]): JsonRecord[] =>
    [...values].sort((left, right) =>
      String(left.locator).localeCompare(String(right.locator)),
    );
  const containers = sort(input.containers);
  const networks = sort(input.networks);
  const volumes = sort(input.volumes);
  const counts = {
    containers: containers.length,
    networks: networks.length,
    volumes: volumes.length,
  };
  const output: JsonRecord = {
    schemaVersion: "1.0",
    observedAt: input.observedAt,
    containers,
    networks,
    volumes,
    counts,
    resourceSetSha256: canonicalSha256({
      containers,
      networks,
      volumes,
      counts,
    }),
  };
  return verifyDockerResourceObservation(output);
};

export const verifyDockerResourceObservation = (value: unknown): JsonRecord => {
  const input = record(value, "DOCKER_RESOURCE_OBSERVATION");
  exactKeys(
    input,
    [
      "schemaVersion",
      "observedAt",
      "containers",
      "networks",
      "volumes",
      "counts",
      "resourceSetSha256",
    ],
    "DOCKER_RESOURCE_OBSERVATION",
  );
  if (input.schemaVersion !== "1.0")
    throw new Error("DOCKER_RESOURCE_OBSERVATION_VERSION");
  timestamp(input.observedAt, "DOCKER_RESOURCE_OBSERVATION_TIME");
  const arrays = ["containers", "networks", "volumes"] as const;
  for (const [index, field] of arrays.entries()) {
    const values = input[field];
    if (!Array.isArray(values) || values.length > MAX_RESOURCES)
      throw new Error(`DOCKER_RESOURCE_OBSERVATION_${field.toUpperCase()}`);
    const parsed = values.map(verifyDockerResourceIdentity);
    const kind = ["CONTAINER", "NETWORK", "VOLUME"][index];
    if (
      parsed.some((entry) => entry.kind !== kind) ||
      new Set(parsed.map((entry) => String(entry.locator))).size !==
        parsed.length ||
      new Set(parsed.map((entry) => String(entry.name))).size !==
        parsed.length ||
      parsed.map((entry) => String(entry.locator)).join("\0") !==
        parsed
          .map((entry) => String(entry.locator))
          .sort()
          .join("\0")
    )
      throw new Error(`DOCKER_RESOURCE_OBSERVATION_${field.toUpperCase()}`);
  }
  const counts = record(input.counts, "DOCKER_RESOURCE_COUNTS");
  exactKeys(counts, arrays, "DOCKER_RESOURCE_COUNTS");
  for (const field of arrays)
    if (
      !Number.isSafeInteger(counts[field]) ||
      counts[field] !== (input[field] as unknown[]).length
    )
      throw new Error("DOCKER_RESOURCE_COUNTS");
  digest(input.resourceSetSha256, "DOCKER_RESOURCE_SET_SHA");
  if (
    canonicalSha256({
      containers: input.containers,
      networks: input.networks,
      volumes: input.volumes,
      counts: input.counts,
    }) !== input.resourceSetSha256
  )
    throw new Error("DOCKER_RESOURCE_SET_DIGEST");
  return input;
};

export const observeDockerProjectResources = async (input: {
  attempt: JsonRecord;
  project: string;
  expectedEnvironment: "production" | "isolated-restore";
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  enforceAuthority?: boolean;
}): Promise<JsonRecord> => {
  safe(input.project, "DOCKER_RESOURCE_PROJECT");
  const [containerOutput, networkOutput, volumeOutput] = await Promise.all([
    input.runDocker(
      [
        "ps",
        "--all",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.ID}}",
      ],
      input.environment,
    ),
    input.runDocker(
      [
        "network",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.ID}}",
      ],
      input.environment,
    ),
    input.runDocker(
      [
        "volume",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.Name}}",
      ],
      input.environment,
    ),
  ]);
  const listed = [
    ["CONTAINER", lines(containerOutput)],
    ["NETWORK", lines(networkOutput)],
    ["VOLUME", lines(volumeOutput)],
  ] as const;
  if (listed.some(([, values]) => values.length > MAX_RESOURCES))
    throw new Error("DOCKER_RESOURCE_LIMIT");
  const [containers, networks, volumes] = await Promise.all(
    listed.map(([kind, values]) =>
      Promise.all(
        values.map((locator) =>
          inspectOne({
            kind,
            locator,
            project: input.project,
            expectedEnvironment: input.expectedEnvironment,
            attempt: input.attempt,
            runDocker: input.runDocker,
            environment: input.environment,
            enforceAuthority: input.enforceAuthority,
          }),
        ),
      ),
    ),
  );
  return finalizeObservation({
    observedAt: input.now().toISOString(),
    containers,
    networks,
    volumes,
  });
};

const observationIsEmpty = (value: unknown): boolean => {
  const counts = record(
    verifyDockerResourceObservation(value).counts,
    "DOCKER_RESOURCE_COUNTS",
  );
  return (
    counts.containers === 0 && counts.networks === 0 && counts.volumes === 0
  );
};

const observationSetEqual = (left: unknown, right: unknown): boolean =>
  verifyDockerResourceObservation(left).resourceSetSha256 ===
  verifyDockerResourceObservation(right).resourceSetSha256;

const removalArguments = (value: unknown): string[][] => {
  const observation = verifyDockerResourceObservation(value);
  return [
    ...(observation.containers as JsonRecord[]).map((entry) => [
      "rm",
      "--force",
      String(entry.dockerId),
    ]),
    ...(observation.volumes as JsonRecord[]).map((entry) => [
      "volume",
      "rm",
      String(entry.name),
    ]),
    ...(observation.networks as JsonRecord[]).map((entry) => [
      "network",
      "rm",
      String(entry.dockerId),
    ]),
  ];
};

const removalArgumentsSha256 = (value: unknown): string =>
  sha256(canonicalJson(removalArguments(value)));

const lifecyclePath = (
  evidenceRoot: string,
  attemptId: string,
  scope: CleanupScope,
): string => {
  if (!path.isAbsolute(evidenceRoot) || path.resolve(evidenceRoot) === "/")
    throw new Error("CLEANUP_EVIDENCE_ROOT_UNSAFE");
  return path.join(
    path.resolve(evidenceRoot),
    safe(attemptId, "CLEANUP_ATTEMPT_ID"),
    scope === "PRODUCTION"
      ? "production-lifecycle.json"
      : "restore-lifecycle.json",
  );
};

const lifecycleCommonKeys = [
  "schemaVersion",
  "attemptId",
  "envelopeId",
  "targetId",
  "candidateManifestSha256",
  "authorityLabels",
  "state",
  "preMutation",
  "ownedBeforeCleanup",
  "cleanupReference",
  "policy",
  "createdAt",
  "updatedAt",
  "previousLifecycleSha256",
  "lifecycleSha256",
] as const;

const authorityLabelObject = (attempt: JsonRecord): JsonRecord => {
  const value = authority(attempt);
  return {
    attemptId: value.attemptId,
    targetId: value.targetId,
    candidateManifestSha256: value.candidateManifestSha256,
  };
};

const verifyPolicy = (value: unknown): JsonRecord => {
  const input = record(value, "CLEANUP_POLICY");
  exactKeys(
    input,
    [
      "emptySampleCount",
      "sampleIntervalMs",
      "maximumSamples",
      "maximumDurationMs",
    ],
    "CLEANUP_POLICY",
  );
  if (canonicalJson(input) !== canonicalJson(CLEANUP_POLICY))
    throw new Error("CLEANUP_POLICY_VALUE");
  return input;
};

const verifyAuthorityLabelObject = (
  value: unknown,
  attempt: JsonRecord,
): JsonRecord => {
  const input = record(value, "LIFECYCLE_AUTHORITY_LABELS");
  exactKeys(
    input,
    ["attemptId", "targetId", "candidateManifestSha256"],
    "LIFECYCLE_AUTHORITY_LABELS",
  );
  if (canonicalJson(input) !== canonicalJson(authorityLabelObject(attempt)))
    throw new Error("LIFECYCLE_AUTHORITY_LABELS_VALUE");
  return input;
};

export const verifyHistoricalRestoreLifecycleV1 = (input: {
  value: unknown;
  attempt: JsonRecord;
  composeProject: string;
  databaseName: string;
}): JsonRecord => {
  const value = record(input.value, "RESTORE_LIFECYCLE_V1");
  exactKeys(
    value,
    [
      "schemaVersion",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "composeProject",
      "databaseName",
      "state",
      "isolatedTarget",
      "cleanup",
      "updatedAt",
      "lifecycleSha256",
    ],
    "RESTORE_LIFECYCLE_V1",
  );
  const expected = authority(input.attempt);
  if (
    value.schemaVersion !== "1.0" ||
    value.attemptId !== expected.attemptId ||
    value.envelopeId !== expected.envelopeId ||
    value.targetId !== expected.targetId ||
    value.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    value.composeProject !== input.composeProject ||
    value.databaseName !== input.databaseName ||
    !["CREATING", "READY", "QUIESCING", "CLEANED", "CLEANUP_FAILED"].includes(
      String(value.state),
    )
  )
    throw new Error("RESTORE_LIFECYCLE_V1_AUTHORITY");
  timestamp(value.updatedAt, "RESTORE_LIFECYCLE_V1_TIME");
  digest(value.lifecycleSha256, "RESTORE_LIFECYCLE_V1_SHA");
  if (canonicalSha256(value, ["lifecycleSha256"]) !== value.lifecycleSha256)
    throw new Error("RESTORE_LIFECYCLE_V1_DIGEST");
  if (value.state === "CREATING" && value.isolatedTarget !== null)
    throw new Error("RESTORE_LIFECYCLE_V1_CREATING_TARGET");
  if (["READY", "QUIESCING"].includes(String(value.state))) {
    if (value.isolatedTarget !== null)
      parseIsolatedRestoreTarget(value.isolatedTarget);
    if (value.state === "READY" && value.isolatedTarget === null)
      throw new Error("RESTORE_LIFECYCLE_V1_READY_TARGET");
  }
  if (value.state === "CLEANED") {
    const cleanup = record(value.cleanup, "RESTORE_LIFECYCLE_V1_CLEANUP");
    if (cleanup.status !== "PASS")
      throw new Error("RESTORE_LIFECYCLE_V1_CLEANUP_STATUS");
  }
  return value;
};

export const verifyCleanupReference = (
  value: unknown,
  expectedAttemptId?: string,
): JsonRecord => {
  const input = record(value, "CLEANUP_REFERENCE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "kind",
      "attemptId",
      "relativePath",
      "status",
      "cleanupSha256",
    ],
    "CLEANUP_REFERENCE",
  );
  const kind = String(input.kind);
  const expectedPath =
    kind === "ROLLBACK_CLEANUP"
      ? "rollback-cleanup.json"
      : kind === "ROLLBACK_CLEANUP_RESULT"
        ? "rollback-cleanup.json"
        : kind === "FORWARD_RESTORE_CLEANUP"
          ? "forward-restore-cleanup.json"
          : null;
  if (
    input.schemaVersion !== "1.0" ||
    expectedPath === null ||
    input.relativePath !== expectedPath ||
    !["PASS", "FAIL"].includes(String(input.status)) ||
    (expectedAttemptId !== undefined && input.attemptId !== expectedAttemptId)
  )
    throw new Error("CLEANUP_REFERENCE_VALUE");
  safe(input.attemptId, "CLEANUP_REFERENCE_ATTEMPT");
  digest(input.cleanupSha256, "CLEANUP_REFERENCE_SHA");
  return input;
};

const verifyLifecycle = (input: {
  value: unknown;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
}): JsonRecord => {
  const value = record(input.value, "RESOURCE_LIFECYCLE");
  exactKeys(
    value,
    input.scope === "PRODUCTION"
      ? [...lifecycleCommonKeys, "composeProject"]
      : [
          ...lifecycleCommonKeys,
          "restoreComposeProject",
          "databaseName",
          "isolatedTarget",
        ],
    "RESOURCE_LIFECYCLE",
  );
  const expected = authority(input.attempt);
  if (
    value.schemaVersion !== (input.scope === "PRODUCTION" ? "1.0" : "2.0") ||
    value.attemptId !== expected.attemptId ||
    value.envelopeId !== expected.envelopeId ||
    value.targetId !== expected.targetId ||
    value.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    (input.scope === "PRODUCTION"
      ? value.composeProject !== input.composeProject
      : value.restoreComposeProject !== input.composeProject) ||
    (input.scope === "RESTORE" && value.databaseName !== input.databaseName) ||
    !["CREATING", "READY", "QUIESCING", "CLEANED", "CLEANUP_FAILED"].includes(
      String(value.state),
    )
  )
    throw new Error("RESOURCE_LIFECYCLE_AUTHORITY");
  verifyAuthorityLabelObject(value.authorityLabels, input.attempt);
  verifyPolicy(value.policy);
  const preMutation = verifyDockerResourceObservation(value.preMutation);
  if (!observationIsEmpty(preMutation))
    throw new Error("RESOURCE_LIFECYCLE_PREMUTATION");
  const state = value.state as LifecycleState;
  const owned =
    value.ownedBeforeCleanup === null
      ? null
      : verifyDockerResourceObservation(value.ownedBeforeCleanup);
  if (
    (["CREATING", "READY"].includes(state) && owned !== null) ||
    (["QUIESCING", "CLEANED", "CLEANUP_FAILED"].includes(state) &&
      owned === null)
  )
    throw new Error("RESOURCE_LIFECYCLE_OWNED_STATE");
  if (state === "READY" && owned !== null)
    throw new Error("RESOURCE_LIFECYCLE_READY_OWNED");
  if (input.scope === "RESTORE") {
    if (state === "CREATING" && value.isolatedTarget !== null)
      throw new Error("RESTORE_LIFECYCLE_CREATING_TARGET");
    if (value.isolatedTarget !== null)
      parseIsolatedRestoreTarget(value.isolatedTarget);
    if (state === "READY" && value.isolatedTarget === null)
      throw new Error("RESTORE_LIFECYCLE_READY_TARGET");
  }
  if (["CLEANED", "CLEANUP_FAILED"].includes(state)) {
    const reference = verifyCleanupReference(
      value.cleanupReference,
      String(expected.attemptId),
    );
    if (
      (input.scope === "PRODUCTION" &&
        !["ROLLBACK_CLEANUP", "ROLLBACK_CLEANUP_RESULT"].includes(
          String(reference.kind),
        )) ||
      (state === "CLEANED" && reference.status !== "PASS") ||
      (state === "CLEANUP_FAILED" && reference.status !== "FAIL")
    )
      throw new Error("RESOURCE_LIFECYCLE_REFERENCE_STATE");
  } else if (value.cleanupReference !== null) {
    throw new Error("RESOURCE_LIFECYCLE_REFERENCE_STATE");
  }
  timestamp(value.createdAt, "RESOURCE_LIFECYCLE_CREATED_AT");
  timestamp(value.updatedAt, "RESOURCE_LIFECYCLE_UPDATED_AT");
  if (Date.parse(String(value.updatedAt)) < Date.parse(String(value.createdAt)))
    throw new Error("RESOURCE_LIFECYCLE_TIME_ORDER");
  if (state === "CREATING") {
    if (value.previousLifecycleSha256 !== null)
      throw new Error("RESOURCE_LIFECYCLE_PREVIOUS");
  } else {
    digest(value.previousLifecycleSha256, "RESOURCE_LIFECYCLE_PREVIOUS");
  }
  digest(value.lifecycleSha256, "RESOURCE_LIFECYCLE_SHA");
  if (canonicalSha256(value, ["lifecycleSha256"]) !== value.lifecycleSha256)
    throw new Error("RESOURCE_LIFECYCLE_DIGEST");
  return value;
};

const finalizeLifecycle = (input: {
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  isolatedTarget?: JsonRecord | null;
  state: LifecycleState;
  preMutation: JsonRecord;
  ownedBeforeCleanup: JsonRecord | null;
  cleanupReference: JsonRecord | null;
  createdAt: string;
  updatedAt: string;
  previousLifecycleSha256: string | null;
}): JsonRecord => {
  const expected = authority(input.attempt);
  const output: JsonRecord = {
    schemaVersion: input.scope === "PRODUCTION" ? "1.0" : "2.0",
    attemptId: expected.attemptId,
    envelopeId: expected.envelopeId,
    targetId: expected.targetId,
    candidateManifestSha256: expected.candidateManifestSha256,
    authorityLabels: authorityLabelObject(input.attempt),
    state: input.state,
    preMutation: input.preMutation,
    ownedBeforeCleanup: input.ownedBeforeCleanup,
    cleanupReference: input.cleanupReference,
    policy: { ...CLEANUP_POLICY },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    previousLifecycleSha256: input.previousLifecycleSha256,
    lifecycleSha256: "",
    ...(input.scope === "PRODUCTION"
      ? { composeProject: input.composeProject }
      : {
          restoreComposeProject: input.composeProject,
          databaseName: input.databaseName,
          isolatedTarget: input.isolatedTarget ?? null,
        }),
  };
  output.lifecycleSha256 = canonicalSha256(output, ["lifecycleSha256"]);
  return verifyLifecycle({
    value: output,
    scope: input.scope,
    attempt: input.attempt,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
  });
};

const writeLifecycle = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  lifecycle: JsonRecord;
  composeProject: string;
  databaseName?: string;
}): Promise<void> => {
  const verified = verifyLifecycle({
    value: input.lifecycle,
    scope: input.scope,
    attempt: input.attempt,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
  });
  await atomicWrite(
    lifecyclePath(
      input.evidenceRoot,
      String(input.attempt.attemptId),
      input.scope,
    ),
    canonicalJson(verified),
    0o600,
  );
};

const readLifecycle = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
}): Promise<JsonRecord | null> => {
  const file = lifecyclePath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
    input.scope,
  );
  if (!(await exists(file))) return null;
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (
    input.scope === "RESTORE" &&
    record(value, "RESOURCE_LIFECYCLE_VERSION").schemaVersion === "1.0"
  ) {
    verifyHistoricalRestoreLifecycleV1({
      value,
      attempt: input.attempt,
      composeProject: input.composeProject,
      databaseName: String(input.databaseName),
    });
    throw new Error("RESTORE_LIFECYCLE_V1_READ_ONLY");
  }
  return verifyLifecycle({
    value,
    scope: input.scope,
    attempt: input.attempt,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
  });
};

export const beginResourceLifecycle = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> => {
  const current = await readLifecycle(input);
  if (current !== null) {
    if (!["CREATING", "READY"].includes(String(current.state)))
      throw new Error("RESOURCE_LIFECYCLE_NOT_STARTABLE");
    const observed = await observeDockerProjectResources({
      attempt: input.attempt,
      project: input.composeProject,
      expectedEnvironment:
        input.scope === "PRODUCTION" ? "production" : "isolated-restore",
      runDocker: input.runDocker,
      environment: input.environment,
      now: input.now,
    });
    if (current.state === "READY" && observationIsEmpty(observed))
      throw new Error("RESOURCE_LIFECYCLE_READY_RESOURCE_MISSING");
    return current;
  }
  const observed = await observeDockerProjectResources({
    attempt: input.attempt,
    project: input.composeProject,
    expectedEnvironment:
      input.scope === "PRODUCTION" ? "production" : "isolated-restore",
    runDocker: input.runDocker,
    environment: input.environment,
    now: input.now,
  });
  if (!observationIsEmpty(observed))
    throw new Error("RESOURCE_LIFECYCLE_TARGET_NOT_EMPTY");
  const createdAt = input.now().toISOString();
  const lifecycle = finalizeLifecycle({
    ...input,
    state: "CREATING",
    preMutation: observed,
    ownedBeforeCleanup: null,
    cleanupReference: null,
    isolatedTarget: null,
    createdAt,
    updatedAt: createdAt,
    previousLifecycleSha256: null,
  });
  await writeLifecycle({ ...input, lifecycle });
  return lifecycle;
};

export const markResourceLifecycleReady = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  isolatedTarget?: JsonRecord;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> => {
  const current = await readLifecycle(input);
  if (current === null) throw new Error("RESOURCE_LIFECYCLE_MISSING");
  if (current.state === "READY") {
    const observed = await observeDockerProjectResources({
      attempt: input.attempt,
      project: input.composeProject,
      expectedEnvironment:
        input.scope === "PRODUCTION" ? "production" : "isolated-restore",
      runDocker: input.runDocker,
      environment: input.environment,
      now: input.now,
    });
    if (observationIsEmpty(observed))
      throw new Error("RESOURCE_LIFECYCLE_READY_RESOURCE_MISSING");
    return current;
  }
  if (current.state !== "CREATING")
    throw new Error("RESOURCE_LIFECYCLE_NOT_READYABLE");
  const observed = await observeDockerProjectResources({
    attempt: input.attempt,
    project: input.composeProject,
    expectedEnvironment:
      input.scope === "PRODUCTION" ? "production" : "isolated-restore",
    runDocker: input.runDocker,
    environment: input.environment,
    now: input.now,
  });
  if (observationIsEmpty(observed))
    throw new Error("RESOURCE_LIFECYCLE_READY_EMPTY");
  const lifecycle = finalizeLifecycle({
    ...input,
    state: "READY",
    preMutation: record(current.preMutation),
    ownedBeforeCleanup: null,
    cleanupReference: null,
    isolatedTarget: input.isolatedTarget ?? null,
    createdAt: String(current.createdAt),
    updatedAt: input.now().toISOString(),
    previousLifecycleSha256: String(current.lifecycleSha256),
  });
  await writeLifecycle({ ...input, lifecycle });
  return lifecycle;
};

const transitionLifecycleToQuiescing = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  isolatedTarget?: JsonRecord | null;
  observed: JsonRecord;
  now: () => Date;
}): Promise<JsonRecord> => {
  const current = await readLifecycle(input);
  if (current === null) throw new Error("RESOURCE_LIFECYCLE_MISSING");
  if (current.state === "QUIESCING") {
    if (!observationSetEqual(current.ownedBeforeCleanup, input.observed))
      throw new Error("RESOURCE_LIFECYCLE_FROZEN_SET_CHANGED");
    return current;
  }
  if (!["CREATING", "READY"].includes(String(current.state)))
    throw new Error("RESOURCE_LIFECYCLE_NOT_QUIESCABLE");
  const lifecycle = finalizeLifecycle({
    ...input,
    state: "QUIESCING",
    preMutation: record(current.preMutation),
    ownedBeforeCleanup: input.observed,
    cleanupReference: null,
    isolatedTarget:
      input.scope === "RESTORE"
        ? (input.isolatedTarget ??
          (current.isolatedTarget === null
            ? null
            : record(current.isolatedTarget)))
        : null,
    createdAt: String(current.createdAt),
    updatedAt: input.now().toISOString(),
    previousLifecycleSha256: String(current.lifecycleSha256),
  });
  await writeLifecycle({ ...input, lifecycle });
  return lifecycle;
};

export const verifyCleanupResult = (value: unknown): JsonRecord => {
  const input = record(value, "CLEANUP_RESULT");
  exactKeys(
    input,
    [
      "scope",
      "status",
      "reasonCode",
      "authorityLifecycleSha256",
      "databasePrincipal",
      "applicationTableCount",
      "observedBefore",
      "removedResourceSetSha256",
      "observedAfter",
      "errorSha256",
    ],
    "CLEANUP_RESULT",
  );
  if (
    !["PRODUCTION", "RESTORE"].includes(String(input.scope)) ||
    !["PASS", "NOT_APPLICABLE", "FAIL"].includes(String(input.status))
  )
    throw new Error("CLEANUP_RESULT_VARIANT");
  safe(input.reasonCode, "CLEANUP_RESULT_REASON");
  const lifecycle =
    input.authorityLifecycleSha256 === null
      ? null
      : digest(input.authorityLifecycleSha256, "CLEANUP_RESULT_LIFECYCLE");
  const before =
    input.observedBefore === null
      ? null
      : verifyDockerResourceObservation(input.observedBefore);
  const after =
    input.observedAfter === null
      ? null
      : verifyDockerResourceObservation(input.observedAfter);
  if (input.removedResourceSetSha256 !== null)
    digest(input.removedResourceSetSha256, "CLEANUP_RESULT_REMOVED_SHA");
  if (input.errorSha256 !== null)
    digest(input.errorSha256, "CLEANUP_RESULT_ERROR_SHA");
  if (input.databasePrincipal !== null) {
    const principal = record(input.databasePrincipal, "CLEANUP_DB_PRINCIPAL");
    exactKeys(
      principal,
      ["databaseUser", "databaseName"],
      "CLEANUP_DB_PRINCIPAL",
    );
    safe(principal.databaseUser, "CLEANUP_DB_USER");
    safe(principal.databaseName, "CLEANUP_DB_NAME");
  }
  if (
    input.applicationTableCount !== null &&
    (!Number.isSafeInteger(input.applicationTableCount) ||
      Number(input.applicationTableCount) < 0)
  )
    throw new Error("CLEANUP_APPLICATION_COUNT");
  if (input.status === "PASS") {
    if (
      lifecycle === null ||
      before === null ||
      after === null ||
      input.removedResourceSetSha256 === null ||
      input.removedResourceSetSha256 !== removalArgumentsSha256(before) ||
      input.errorSha256 !== null ||
      !observationIsEmpty(after) ||
      (input.scope === "PRODUCTION" &&
        (input.databasePrincipal === null ||
          input.applicationTableCount !== 0)) ||
      (input.scope === "RESTORE" &&
        (input.databasePrincipal !== null ||
          input.applicationTableCount !== null))
    )
      throw new Error("CLEANUP_RESULT_PASS");
  } else if (input.status === "NOT_APPLICABLE") {
    const upgrade = input.reasonCode === "UPGRADE_PRODUCTION_PRESERVED";
    if (
      before === null ||
      after === null ||
      !observationSetEqual(before, after) ||
      (!upgrade &&
        (!observationIsEmpty(before) || !observationIsEmpty(after))) ||
      (upgrade && input.scope !== "PRODUCTION") ||
      input.removedResourceSetSha256 !== EMPTY_RESOURCE_SET_SHA256 ||
      input.databasePrincipal !== null ||
      input.applicationTableCount !== null ||
      input.errorSha256 !== null ||
      (!upgrade && lifecycle !== null)
    )
      throw new Error("CLEANUP_RESULT_NOT_APPLICABLE");
  } else if (input.errorSha256 === null) {
    throw new Error("CLEANUP_RESULT_FAIL");
  }
  return input;
};

const cleanupResult = (input: JsonRecord): JsonRecord =>
  verifyCleanupResult({
    scope: input.scope,
    status: input.status,
    reasonCode: input.reasonCode,
    authorityLifecycleSha256: input.authorityLifecycleSha256 ?? null,
    databasePrincipal: input.databasePrincipal ?? null,
    applicationTableCount: input.applicationTableCount ?? null,
    observedBefore: input.observedBefore ?? null,
    removedResourceSetSha256: input.removedResourceSetSha256 ?? null,
    observedAfter: input.observedAfter ?? null,
    errorSha256: input.errorSha256 ?? null,
  });

const rawProjectCounts = async (input: {
  project: string;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
}): Promise<{ containers: number; networks: number; volumes: number }> => {
  const [containers, networks, volumes] = await Promise.all([
    input.runDocker(
      [
        "ps",
        "--all",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.ID}}",
      ],
      input.environment,
    ),
    input.runDocker(
      [
        "network",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.ID}}",
      ],
      input.environment,
    ),
    input.runDocker(
      [
        "volume",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${input.project}`,
        "--format",
        "{{.Name}}",
      ],
      input.environment,
    ),
  ]);
  return {
    containers: lines(containers).length,
    networks: lines(networks).length,
    volumes: lines(volumes).length,
  };
};

const exactOne = (value: string, code: string): string => {
  const entries = lines(value);
  if (entries.length !== 1 || entries[0] === undefined) throw new Error(code);
  return entries[0];
};

const applicationTableCount = async (input: {
  observation: JsonRecord;
  databaseUser: string;
  databaseName: string;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
}): Promise<number> => {
  const observation = verifyDockerResourceObservation(input.observation);
  const databaseContainers = (observation.containers as JsonRecord[]).filter(
    (entry) => entry.role === "database",
  );
  if (databaseContainers.length !== 1 || databaseContainers[0] === undefined)
    throw new Error("CLEANUP_DATABASE_CONTAINER_COUNT");
  const containerId = String(databaseContainers[0].dockerId);
  const base = [
    "exec",
    "--user",
    "postgres",
    containerId,
    "psql",
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--username",
    input.databaseUser,
    "--dbname",
    input.databaseName,
  ];
  const tableJson = exactOne(
    await input.runDocker(
      [
        ...base,
        "--command",
        "SELECT COALESCE(json_agg(format('%I.%I',schemaname,tablename) ORDER BY schemaname,tablename),'[]'::json)::text FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','schema_feature_migrations')",
      ],
      input.environment,
    ),
    "CLEANUP_APPLICATION_TABLE_LIST",
  );
  const tables = JSON.parse(tableJson) as unknown;
  if (
    !Array.isArray(tables) ||
    tables.length > 10_000 ||
    tables.some((entry) => typeof entry !== "string" || entry.length > 512)
  )
    throw new Error("CLEANUP_APPLICATION_TABLE_LIST");
  let total = 0;
  for (const table of tables as string[]) {
    const count = Number(
      exactOne(
        await input.runDocker(
          [...base, "--command", `SELECT count(*) FROM ${table}`],
          input.environment,
        ),
        "CLEANUP_APPLICATION_TABLE_COUNT",
      ),
    );
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("CLEANUP_APPLICATION_TABLE_COUNT");
    total += count;
    if (!Number.isSafeInteger(total))
      throw new Error("CLEANUP_APPLICATION_TABLE_COUNT");
  }
  return total;
};

const failResult = (input: {
  scope: CleanupScope;
  reasonCode: string;
  error: unknown;
  lifecycle?: JsonRecord | null;
  observedBefore?: JsonRecord | null;
  observedAfter?: JsonRecord | null;
  databaseUser?: string;
  databaseName?: string;
  applicationTableCount?: number | null;
  removedResourceSetSha256?: string | null;
}): JsonRecord =>
  cleanupResult({
    scope: input.scope,
    status: "FAIL",
    reasonCode: input.reasonCode,
    authorityLifecycleSha256: input.lifecycle?.lifecycleSha256 ?? null,
    databasePrincipal:
      input.databaseUser === undefined || input.databaseName === undefined
        ? null
        : {
            databaseUser: input.databaseUser,
            databaseName: input.databaseName,
          },
    applicationTableCount: input.applicationTableCount ?? null,
    observedBefore: input.observedBefore ?? null,
    removedResourceSetSha256: input.removedResourceSetSha256 ?? null,
    observedAfter: input.observedAfter ?? null,
    errorSha256: sha256(
      input.error instanceof Error
        ? input.error.message
        : "UNKNOWN_CLEANUP_FAILURE",
    ),
  });

const removeFrozenResources = async (input: {
  frozen: JsonRecord;
  attempt: JsonRecord;
  project: string;
  expectedEnvironment: "production" | "isolated-restore";
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
}): Promise<string> => {
  const observation = verifyDockerResourceObservation(input.frozen);
  for (const identityValue of observation.containers as JsonRecord[]) {
    const identity = verifyDockerResourceIdentity(identityValue);
    const live = await inspectOne({
      kind: "CONTAINER",
      locator: String(identity.dockerId),
      project: input.project,
      expectedEnvironment: input.expectedEnvironment,
      attempt: input.attempt,
      runDocker: input.runDocker,
      environment: input.environment,
    });
    if (canonicalJson(live) !== canonicalJson(identity))
      throw new Error("CLEANUP_CONTAINER_IDENTITY_CHANGED");
    await input.runDocker(
      ["rm", "--force", String(identity.dockerId)],
      input.environment,
    );
  }
  for (const identityValue of observation.volumes as JsonRecord[]) {
    const identity = verifyDockerResourceIdentity(identityValue);
    const live = await inspectOne({
      kind: "VOLUME",
      locator: String(identity.name),
      project: input.project,
      expectedEnvironment: input.expectedEnvironment,
      attempt: input.attempt,
      runDocker: input.runDocker,
      environment: input.environment,
    });
    if (canonicalJson(live) !== canonicalJson(identity))
      throw new Error("CLEANUP_VOLUME_IDENTITY_CHANGED");
    await input.runDocker(
      ["volume", "rm", String(identity.name)],
      input.environment,
    );
  }
  for (const identityValue of observation.networks as JsonRecord[]) {
    const identity = verifyDockerResourceIdentity(identityValue);
    const live = await inspectOne({
      kind: "NETWORK",
      locator: String(identity.dockerId),
      project: input.project,
      expectedEnvironment: input.expectedEnvironment,
      attempt: input.attempt,
      runDocker: input.runDocker,
      environment: input.environment,
    });
    if (canonicalJson(live) !== canonicalJson(identity))
      throw new Error("CLEANUP_NETWORK_IDENTITY_CHANGED");
    await input.runDocker(
      ["network", "rm", String(identity.dockerId)],
      input.environment,
    );
  }
  return removalArgumentsSha256(observation);
};

export const cleanupOwnedProject = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseUser?: string;
  databaseName?: string;
  isolatedTarget?: JsonRecord | null;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<JsonRecord> => {
  const expectedEnvironment =
    input.scope === "PRODUCTION" ? "production" : "isolated-restore";
  let lifecycle: JsonRecord | null = null;
  let observedBefore: JsonRecord | null = null;
  let observedAfter: JsonRecord | null = null;
  let removedResourceSetSha256: string | null = null;
  let count: number | null = null;
  try {
    lifecycle = await readLifecycle(input);
    if (
      lifecycle !== null &&
      ["CLEANED", "CLEANUP_FAILED"].includes(String(lifecycle.state))
    ) {
      const persisted = await resolveCleanupResultReference({
        evidenceRoot: input.evidenceRoot,
        attempt: input.attempt,
        reference: lifecycle.cleanupReference,
        scope: input.scope,
        composeProject: input.composeProject,
        databaseName: input.databaseName,
      });
      if (
        persisted.authorityLifecycleSha256 !== lifecycle.previousLifecycleSha256
      )
        throw new Error("CLEANUP_TERMINAL_LIFECYCLE_MISMATCH");
      if (lifecycle.state === "CLEANED") {
        const live = await observeDockerProjectResources({
          attempt: input.attempt,
          project: input.composeProject,
          expectedEnvironment,
          runDocker: input.runDocker,
          environment: input.environment,
          now: input.now,
        });
        if (persisted.status !== "PASS" || !observationIsEmpty(live))
          throw new Error("CLEANUP_TERMINAL_RECONCILIATION_FAILED");
      }
      return persisted;
    }
    if (
      input.scope === "PRODUCTION" &&
      input.attempt.previousRelease !== null
    ) {
      observedBefore = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
        enforceAuthority: false,
      });
      observedAfter = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
        enforceAuthority: false,
      });
      if (!observationSetEqual(observedBefore, observedAfter))
        throw new Error("UPGRADE_PRODUCTION_RESOURCE_DRIFT");
      return cleanupResult({
        scope: input.scope,
        status: "NOT_APPLICABLE",
        reasonCode: "UPGRADE_PRODUCTION_PRESERVED",
        authorityLifecycleSha256: lifecycle?.lifecycleSha256 ?? null,
        databasePrincipal: null,
        applicationTableCount: null,
        observedBefore,
        removedResourceSetSha256: EMPTY_RESOURCE_SET_SHA256,
        observedAfter,
        errorSha256: null,
      });
    }
    if (lifecycle === null) {
      const counts = await rawProjectCounts({
        project: input.composeProject,
        runDocker: input.runDocker,
        environment: input.environment,
      });
      if (
        counts.containers !== 0 ||
        counts.networks !== 0 ||
        counts.volumes !== 0
      )
        throw new Error("CLEANUP_LIFECYCLE_REQUIRED");
      observedBefore = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
      });
      observedAfter = observedBefore;
      return cleanupResult({
        scope: input.scope,
        status: "NOT_APPLICABLE",
        reasonCode: "RESOURCE_ENVIRONMENT_NOT_CREATED",
        authorityLifecycleSha256: null,
        databasePrincipal: null,
        applicationTableCount: null,
        observedBefore,
        removedResourceSetSha256: EMPTY_RESOURCE_SET_SHA256,
        observedAfter,
        errorSha256: null,
      });
    }
    observedBefore = await observeDockerProjectResources({
      attempt: input.attempt,
      project: input.composeProject,
      expectedEnvironment,
      runDocker: input.runDocker,
      environment: input.environment,
      now: input.now,
    });
    if (input.scope === "PRODUCTION") {
      if (input.databaseUser === undefined || input.databaseName === undefined)
        throw new Error("CLEANUP_DATABASE_PRINCIPAL_REQUIRED");
      count = await applicationTableCount({
        observation: observedBefore,
        databaseUser: input.databaseUser,
        databaseName: input.databaseName,
        runDocker: input.runDocker,
        environment: input.environment,
      });
      if (count !== 0) throw new Error("CLEANUP_APPLICATION_DATA_PRESENT");
    }
    const resumesCompletedRestoreDeletion =
      input.scope === "RESTORE" &&
      lifecycle.state === "QUIESCING" &&
      observationIsEmpty(observedBefore);
    if (resumesCompletedRestoreDeletion) {
      // QUIESCING durably freezes the only authorized deletion set. An empty
      // live RESTORE project means a prior process completed that exact delete
      // but died before writing its forward evidence; production recovery stays
      // fail-closed because its database-principal/count proof is not derivable.
      const frozen = verifyDockerResourceObservation(
        lifecycle.ownedBeforeCleanup,
      );
      if (observationIsEmpty(frozen))
        throw new Error("CLEANUP_RECOVERY_FROZEN_SET_EMPTY");
      observedBefore = frozen;
      removedResourceSetSha256 = removalArgumentsSha256(frozen);
    } else {
      lifecycle = await transitionLifecycleToQuiescing({
        ...input,
        observed: observedBefore,
      });
      const reverified = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
      });
      if (!observationSetEqual(observedBefore, reverified))
        throw new Error("CLEANUP_RESOURCE_SET_DRIFT");
      removedResourceSetSha256 = await removeFrozenResources({
        frozen: observedBefore,
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
      });
    }
    const started = Date.now();
    let emptySamples = 0;
    for (let sample = 0; sample < CLEANUP_POLICY.maximumSamples; sample += 1) {
      observedAfter = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment,
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
      });
      emptySamples = observationIsEmpty(observedAfter) ? emptySamples + 1 : 0;
      if (emptySamples >= CLEANUP_POLICY.emptySampleCount) break;
      if (Date.now() - started >= CLEANUP_POLICY.maximumDurationMs) break;
      await (input.sleep ?? ((milliseconds) => delay(milliseconds)))(
        CLEANUP_POLICY.sampleIntervalMs,
      );
    }
    if (
      observedAfter === null ||
      emptySamples < CLEANUP_POLICY.emptySampleCount ||
      !observationIsEmpty(observedAfter)
    )
      throw new Error("CLEANUP_NOT_QUIESCENT");
    return cleanupResult({
      scope: input.scope,
      status: "PASS",
      reasonCode: "EXACT_ATTEMPT_RESOURCES_REMOVED",
      authorityLifecycleSha256: lifecycle.lifecycleSha256,
      databasePrincipal:
        input.scope === "PRODUCTION"
          ? {
              databaseUser: input.databaseUser,
              databaseName: input.databaseName,
            }
          : null,
      applicationTableCount: input.scope === "PRODUCTION" ? count : null,
      observedBefore,
      removedResourceSetSha256,
      observedAfter,
      errorSha256: null,
    });
  } catch (error) {
    return failResult({
      scope: input.scope,
      reasonCode: "CLEANUP_PROOF_OR_OPERATION_FAILED",
      error,
      lifecycle,
      observedBefore,
      observedAfter,
      databaseUser:
        input.scope === "PRODUCTION" ? input.databaseUser : undefined,
      databaseName:
        input.scope === "PRODUCTION" ? input.databaseName : undefined,
      applicationTableCount: count,
      removedResourceSetSha256,
    });
  }
};

export const verifyApplicationRollback = (value: unknown): JsonRecord => {
  const input = record(value, "APPLICATION_ROLLBACK");
  exactKeys(
    input,
    [
      "status",
      "reasonCode",
      "previousRelease",
      "readinessSha256",
      "smokeSha256",
      "startedAt",
      "finishedAt",
    ],
    "APPLICATION_ROLLBACK",
  );
  if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(String(input.status)))
    throw new Error("APPLICATION_ROLLBACK_STATUS");
  safe(input.reasonCode, "APPLICATION_ROLLBACK_REASON");
  timestamp(input.startedAt, "APPLICATION_ROLLBACK_STARTED_AT");
  timestamp(input.finishedAt, "APPLICATION_ROLLBACK_FINISHED_AT");
  if (
    Date.parse(String(input.finishedAt)) < Date.parse(String(input.startedAt))
  )
    throw new Error("APPLICATION_ROLLBACK_TIME_ORDER");
  if (input.status === "PASS") {
    record(input.previousRelease, "APPLICATION_ROLLBACK_PREVIOUS");
    digest(input.readinessSha256, "APPLICATION_ROLLBACK_READINESS");
    digest(input.smokeSha256, "APPLICATION_ROLLBACK_SMOKE");
  } else if (
    input.status === "NOT_APPLICABLE" &&
    (input.previousRelease !== null ||
      input.readinessSha256 !== null ||
      input.smokeSha256 !== null)
  ) {
    throw new Error("APPLICATION_ROLLBACK_NOT_APPLICABLE");
  }
  return input;
};

export const materializeApplicationRollbackFailure = (input: {
  attempt: JsonRecord;
  error: unknown;
  startedAt: string;
  finishedAt: string;
}): JsonRecord =>
  verifyApplicationRollback({
    status: "FAIL",
    reasonCode: `ROLLBACK_ORACLE_FAILED_${sha256(
      input.error instanceof Error
        ? input.error.message
        : "UNKNOWN_ROLLBACK_FAILURE",
    )}`,
    previousRelease: input.attempt.previousRelease,
    readinessSha256: null,
    smokeSha256: null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  });

export const verifyRollbackCleanupEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "ROLLBACK_CLEANUP_EVIDENCE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "composeProject",
      "startedAt",
      "finishedAt",
      "applicationRollback",
      "applicationRollbackSha256",
      "production",
      "restore",
      "status",
      "reasonCode",
      "cleanupSha256",
    ],
    "ROLLBACK_CLEANUP_EVIDENCE",
  );
  if (
    input.schemaVersion !== "1.0" ||
    !["PASS", "FAIL"].includes(String(input.status))
  )
    throw new Error("ROLLBACK_CLEANUP_VALUE");
  safe(input.attemptId, "ROLLBACK_CLEANUP_ATTEMPT");
  safe(input.envelopeId, "ROLLBACK_CLEANUP_ENVELOPE");
  safe(input.targetId, "ROLLBACK_CLEANUP_TARGET");
  digest(input.candidateManifestSha256, "ROLLBACK_CLEANUP_CANDIDATE");
  safe(input.composeProject, "ROLLBACK_CLEANUP_PROJECT");
  timestamp(input.startedAt, "ROLLBACK_CLEANUP_STARTED_AT");
  timestamp(input.finishedAt, "ROLLBACK_CLEANUP_FINISHED_AT");
  if (
    Date.parse(String(input.finishedAt)) < Date.parse(String(input.startedAt))
  )
    throw new Error("ROLLBACK_CLEANUP_TIME_ORDER");
  const application = verifyApplicationRollback(input.applicationRollback);
  digest(input.applicationRollbackSha256, "ROLLBACK_CLEANUP_APPLICATION_SHA");
  if (canonicalSha256(application) !== input.applicationRollbackSha256)
    throw new Error("ROLLBACK_CLEANUP_APPLICATION_DIGEST");
  const production = verifyCleanupResult(input.production);
  const restore = verifyCleanupResult(input.restore);
  if (production.scope !== "PRODUCTION" || restore.scope !== "RESTORE")
    throw new Error("ROLLBACK_CLEANUP_SCOPE");
  safe(input.reasonCode, "ROLLBACK_CLEANUP_REASON");
  digest(input.cleanupSha256, "ROLLBACK_CLEANUP_SHA");
  const expectedStatus = [production.status, restore.status].includes("FAIL")
    ? "FAIL"
    : input.status;
  if (input.status !== expectedStatus)
    throw new Error("ROLLBACK_CLEANUP_STATUS");
  if (canonicalSha256(input, ["cleanupSha256"]) !== input.cleanupSha256)
    throw new Error("ROLLBACK_CLEANUP_DIGEST");
  return input;
};

const cleanupEvidencePath = (evidenceRoot: string, attemptId: string): string =>
  path.join(
    path.dirname(lifecyclePath(evidenceRoot, attemptId, "PRODUCTION")),
    "rollback-cleanup.json",
  );

const readRollbackCleanupEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  reference: JsonRecord;
}): Promise<JsonRecord> => {
  const expected = authority(input.attempt);
  const target = parseDeploymentTarget(input.attempt.target);
  const attemptId = String(expected.attemptId);
  const file = cleanupEvidencePath(input.evidenceRoot, attemptId);
  const evidence = verifyRollbackCleanupEvidence(
    JSON.parse(await readFile(file, "utf8")),
  );
  if (
    evidence.attemptId !== expected.attemptId ||
    evidence.envelopeId !== expected.envelopeId ||
    evidence.targetId !== expected.targetId ||
    evidence.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    evidence.composeProject !== target.composeProject ||
    evidence.cleanupSha256 !== input.reference.cleanupSha256
  )
    throw new Error("CLEANUP_REFERENCE_MISMATCH");
  return evidence;
};

export const resolveRollbackCleanupReference = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  reference: unknown;
}): Promise<JsonRecord> => {
  const reference = verifyCleanupReference(
    input.reference,
    String(input.attempt.attemptId),
  );
  if (reference.kind !== "ROLLBACK_CLEANUP")
    throw new Error("ROLLBACK_CLEANUP_REFERENCE_KIND");
  const evidence = await readRollbackCleanupEvidence({ ...input, reference });
  if (evidence.status !== reference.status)
    throw new Error("CLEANUP_REFERENCE_MISMATCH");
  return evidence;
};

export const verifyForwardRestoreCleanupEvidence = (
  value: unknown,
): JsonRecord => {
  const input = record(value, "FORWARD_RESTORE_CLEANUP_EVIDENCE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "restoreComposeProject",
      "databaseName",
      "startedAt",
      "finishedAt",
      "restore",
      "status",
      "reasonCode",
      "cleanupSha256",
    ],
    "FORWARD_RESTORE_CLEANUP_EVIDENCE",
  );
  if (
    input.schemaVersion !== "1.0" ||
    !["PASS", "FAIL"].includes(String(input.status))
  )
    throw new Error("FORWARD_RESTORE_CLEANUP_VALUE");
  safe(input.attemptId, "FORWARD_RESTORE_CLEANUP_ATTEMPT");
  safe(input.envelopeId, "FORWARD_RESTORE_CLEANUP_ENVELOPE");
  safe(input.targetId, "FORWARD_RESTORE_CLEANUP_TARGET");
  digest(input.candidateManifestSha256, "FORWARD_RESTORE_CLEANUP_CANDIDATE");
  safe(input.restoreComposeProject, "FORWARD_RESTORE_CLEANUP_PROJECT");
  safe(input.databaseName, "FORWARD_RESTORE_CLEANUP_DATABASE");
  timestamp(input.startedAt, "FORWARD_RESTORE_CLEANUP_STARTED_AT");
  timestamp(input.finishedAt, "FORWARD_RESTORE_CLEANUP_FINISHED_AT");
  if (
    Date.parse(String(input.finishedAt)) < Date.parse(String(input.startedAt))
  )
    throw new Error("FORWARD_RESTORE_CLEANUP_TIME_ORDER");
  const restore = verifyCleanupResult(input.restore);
  if (
    restore.scope !== "RESTORE" ||
    restore.status === "NOT_APPLICABLE" ||
    restore.status !== input.status
  )
    throw new Error("FORWARD_RESTORE_CLEANUP_STATUS");
  safe(input.reasonCode, "FORWARD_RESTORE_CLEANUP_REASON");
  const expectedReason =
    input.status === "PASS"
      ? "FORWARD_RESTORE_CLEANUP_PASS"
      : "FORWARD_RESTORE_CLEANUP_FAIL";
  if (input.reasonCode !== expectedReason)
    throw new Error("FORWARD_RESTORE_CLEANUP_REASON");
  digest(input.cleanupSha256, "FORWARD_RESTORE_CLEANUP_SHA");
  if (canonicalSha256(input, ["cleanupSha256"]) !== input.cleanupSha256)
    throw new Error("FORWARD_RESTORE_CLEANUP_DIGEST");
  return input;
};

const forwardRestoreCleanupEvidencePath = (
  evidenceRoot: string,
  attemptId: string,
): string =>
  path.join(
    path.dirname(lifecyclePath(evidenceRoot, attemptId, "RESTORE")),
    "forward-restore-cleanup.json",
  );

const forwardRestoreCleanupReference = (evidence: JsonRecord): JsonRecord =>
  verifyCleanupReference(
    {
      schemaVersion: "1.0",
      kind: "FORWARD_RESTORE_CLEANUP",
      attemptId: evidence.attemptId,
      relativePath: "forward-restore-cleanup.json",
      status: evidence.status,
      cleanupSha256: evidence.cleanupSha256,
    },
    String(evidence.attemptId),
  );

const persistForwardRestoreCleanupEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  composeProject: string;
  databaseName: string;
  restore: JsonRecord;
  startedAt: string;
  finishedAt: string;
}): Promise<{ evidence: JsonRecord; reference: JsonRecord }> => {
  const expected = authority(input.attempt);
  const restore = verifyCleanupResult(input.restore);
  if (restore.scope !== "RESTORE" || restore.status === "NOT_APPLICABLE")
    throw new Error("FORWARD_RESTORE_CLEANUP_RESULT");
  const evidence: JsonRecord = {
    schemaVersion: "1.0",
    attemptId: expected.attemptId,
    envelopeId: expected.envelopeId,
    targetId: expected.targetId,
    candidateManifestSha256: expected.candidateManifestSha256,
    restoreComposeProject: input.composeProject,
    databaseName: input.databaseName,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    restore,
    status: restore.status,
    reasonCode:
      restore.status === "PASS"
        ? "FORWARD_RESTORE_CLEANUP_PASS"
        : "FORWARD_RESTORE_CLEANUP_FAIL",
    cleanupSha256: "",
  };
  evidence.cleanupSha256 = canonicalSha256(evidence, ["cleanupSha256"]);
  const verified = verifyForwardRestoreCleanupEvidence(evidence);
  const file = forwardRestoreCleanupEvidencePath(
    input.evidenceRoot,
    String(expected.attemptId),
  );
  if (await exists(file)) {
    const persisted = verifyForwardRestoreCleanupEvidence(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (canonicalJson(persisted) !== canonicalJson(verified))
      throw new Error("FORWARD_RESTORE_CLEANUP_REPLAY_CONFLICT");
    return {
      evidence: persisted,
      reference: forwardRestoreCleanupReference(persisted),
    };
  }
  await atomicWrite(file, canonicalJson(verified), 0o600);
  return {
    evidence: verified,
    reference: forwardRestoreCleanupReference(verified),
  };
};

export const resolveForwardRestoreCleanupReference = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  reference: unknown;
  composeProject: string;
  databaseName: string;
}): Promise<JsonRecord> => {
  const expected = authority(input.attempt);
  const reference = verifyCleanupReference(
    input.reference,
    String(expected.attemptId),
  );
  if (reference.kind !== "FORWARD_RESTORE_CLEANUP")
    throw new Error("FORWARD_RESTORE_CLEANUP_REFERENCE_KIND");
  const evidence = verifyForwardRestoreCleanupEvidence(
    JSON.parse(
      await readFile(
        forwardRestoreCleanupEvidencePath(
          input.evidenceRoot,
          String(expected.attemptId),
        ),
        "utf8",
      ),
    ),
  );
  if (
    evidence.attemptId !== expected.attemptId ||
    evidence.envelopeId !== expected.envelopeId ||
    evidence.targetId !== expected.targetId ||
    evidence.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    evidence.restoreComposeProject !== input.composeProject ||
    evidence.databaseName !== input.databaseName ||
    evidence.status !== reference.status ||
    evidence.cleanupSha256 !== reference.cleanupSha256
  )
    throw new Error("FORWARD_RESTORE_CLEANUP_REFERENCE_MISMATCH");
  return evidence;
};

const resolveCleanupResultReference = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  reference: unknown;
  scope: CleanupScope;
  composeProject: string;
  databaseName?: string;
}): Promise<JsonRecord> => {
  const reference = verifyCleanupReference(
    input.reference,
    String(input.attempt.attemptId),
  );
  if (
    ["ROLLBACK_CLEANUP", "ROLLBACK_CLEANUP_RESULT"].includes(
      String(reference.kind),
    )
  ) {
    const aggregate = await readRollbackCleanupEvidence({
      evidenceRoot: input.evidenceRoot,
      attempt: input.attempt,
      reference,
    });
    const result = verifyCleanupResult(
      input.scope === "PRODUCTION" ? aggregate.production : aggregate.restore,
    );
    if (
      (reference.kind === "ROLLBACK_CLEANUP" &&
        aggregate.status !== reference.status) ||
      (reference.kind === "ROLLBACK_CLEANUP_RESULT" &&
        result.status !== reference.status)
    )
      throw new Error("CLEANUP_REFERENCE_MISMATCH");
    return result;
  }
  if (
    input.scope !== "RESTORE" ||
    input.databaseName === undefined ||
    reference.kind !== "FORWARD_RESTORE_CLEANUP"
  )
    throw new Error("CLEANUP_REFERENCE_SCOPE");
  const evidence = await resolveForwardRestoreCleanupReference({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    reference,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
  });
  return verifyCleanupResult(evidence.restore);
};

const rollbackCleanupResultReference = (
  evidence: JsonRecord,
  scope: CleanupScope,
): JsonRecord => {
  const result = verifyCleanupResult(
    scope === "PRODUCTION" ? evidence.production : evidence.restore,
  );
  if (result.status === "NOT_APPLICABLE")
    throw new Error("ROLLBACK_CLEANUP_RESULT_REFERENCE_NOT_APPLICABLE");
  return verifyCleanupReference(
    {
      schemaVersion: "1.0",
      kind: "ROLLBACK_CLEANUP_RESULT",
      attemptId: evidence.attemptId,
      relativePath: "rollback-cleanup.json",
      status: result.status,
      cleanupSha256: evidence.cleanupSha256,
    },
    String(evidence.attemptId),
  );
};

const rollbackCleanupReference = (evidenceValue: unknown): JsonRecord => {
  const evidence = verifyRollbackCleanupEvidence(evidenceValue);
  return verifyCleanupReference(
    {
      schemaVersion: "1.0",
      kind: "ROLLBACK_CLEANUP",
      attemptId: evidence.attemptId,
      relativePath: "rollback-cleanup.json",
      status: evidence.status,
      cleanupSha256: evidence.cleanupSha256,
    },
    String(evidence.attemptId),
  );
};

const recoverRollbackCleanupEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
}): Promise<{ evidence: JsonRecord; reference: JsonRecord } | null> => {
  const file = cleanupEvidencePath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
  );
  if (!(await exists(file))) return null;
  const evidence = verifyRollbackCleanupEvidence(
    JSON.parse(await readFile(file, "utf8")),
  );
  const reference = rollbackCleanupReference(evidence);
  const resolved = await resolveRollbackCleanupReference({
    ...input,
    reference,
  });
  if (canonicalJson(resolved) !== canonicalJson(evidence))
    throw new Error("ROLLBACK_CLEANUP_RECOVERY_MISMATCH");
  return { evidence, reference };
};

const persistRollbackCleanupEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  applicationRollback: JsonRecord;
  production: JsonRecord;
  restore: JsonRecord;
  startedAt: string;
  finishedAt: string;
}): Promise<{ evidence: JsonRecord; reference: JsonRecord }> => {
  const expected = authority(input.attempt);
  const target = parseDeploymentTarget(input.attempt.target);
  const application = verifyApplicationRollback(input.applicationRollback);
  const production = verifyCleanupResult(input.production);
  const restore = verifyCleanupResult(input.restore);
  const status = [
    application.status,
    production.status,
    restore.status,
  ].includes("FAIL")
    ? "FAIL"
    : "PASS";
  const evidence: JsonRecord = {
    schemaVersion: "1.0",
    attemptId: expected.attemptId,
    envelopeId: expected.envelopeId,
    targetId: expected.targetId,
    candidateManifestSha256: expected.candidateManifestSha256,
    composeProject: target.composeProject,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    applicationRollback: application,
    applicationRollbackSha256: canonicalSha256(application),
    production,
    restore,
    status,
    reasonCode:
      status === "PASS" ? "ROLLBACK_CLEANUP_PASS" : "ROLLBACK_CLEANUP_FAIL",
    cleanupSha256: "",
  };
  evidence.cleanupSha256 = canonicalSha256(evidence, ["cleanupSha256"]);
  const verified = verifyRollbackCleanupEvidence(evidence);
  const file = cleanupEvidencePath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
  );
  let durable = verified;
  if (await exists(file)) {
    const persisted = verifyRollbackCleanupEvidence(
      JSON.parse(await readFile(file, "utf8")),
    );
    const replay: JsonRecord = {
      ...verified,
      startedAt: persisted.startedAt,
      finishedAt: persisted.finishedAt,
      cleanupSha256: "",
    };
    replay.cleanupSha256 = canonicalSha256(replay, ["cleanupSha256"]);
    if (canonicalJson(persisted) !== canonicalJson(replay))
      throw new Error("ROLLBACK_CLEANUP_REPLAY_CONFLICT");
    durable = persisted;
  } else {
    await atomicWrite(file, canonicalJson(verified), 0o600);
  }
  const reference = rollbackCleanupReference(durable);
  return { evidence: durable, reference };
};

const completeLifecycle = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  isolatedTarget?: JsonRecord | null;
  result: JsonRecord;
  reference: JsonRecord;
  now: () => Date;
}): Promise<void> => {
  const result = verifyCleanupResult(input.result);
  if (
    result.authorityLifecycleSha256 === null ||
    result.status === "NOT_APPLICABLE"
  )
    return;
  const current = await readLifecycle(input);
  if (
    current !== null &&
    ["CLEANED", "CLEANUP_FAILED"].includes(String(current.state))
  ) {
    const persisted = await resolveCleanupResultReference({
      evidenceRoot: input.evidenceRoot,
      attempt: input.attempt,
      reference: current.cleanupReference,
      scope: input.scope,
      composeProject: input.composeProject,
      databaseName: input.databaseName,
    });
    const expectedState =
      result.status === "PASS" ? "CLEANED" : "CLEANUP_FAILED";
    if (
      current.state !== expectedState ||
      persisted.authorityLifecycleSha256 !== current.previousLifecycleSha256 ||
      canonicalJson(persisted) !== canonicalJson(result)
    )
      throw new Error("RESOURCE_LIFECYCLE_TERMINAL_REPLAY");
    return;
  }
  if (
    current === null ||
    current.lifecycleSha256 !== result.authorityLifecycleSha256
  )
    throw new Error("RESOURCE_LIFECYCLE_TERMINAL_AUTHORITY");
  if (current.state !== "QUIESCING") {
    if (result.status === "FAIL") return;
    throw new Error("RESOURCE_LIFECYCLE_TERMINAL_STATE");
  }
  const lifecycle = finalizeLifecycle({
    ...input,
    state: result.status === "PASS" ? "CLEANED" : "CLEANUP_FAILED",
    preMutation: record(current.preMutation),
    ownedBeforeCleanup: record(current.ownedBeforeCleanup),
    cleanupReference: input.reference,
    isolatedTarget:
      input.scope === "RESTORE"
        ? (input.isolatedTarget ??
          (current.isolatedTarget === null
            ? null
            : record(current.isolatedTarget)))
        : null,
    createdAt: String(current.createdAt),
    updatedAt: input.now().toISOString(),
    previousLifecycleSha256: String(current.lifecycleSha256),
  });
  await writeLifecycle({ ...input, lifecycle });
};

const resolvePendingForwardRestoreCleanup = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  composeProject: string;
  databaseName: string;
  isolatedTarget?: JsonRecord | null;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord | null> => {
  const lifecycleInput = { ...input, scope: "RESTORE" as const };
  const current = await readLifecycle(lifecycleInput);
  if (
    current !== null &&
    ["CLEANED", "CLEANUP_FAILED"].includes(String(current.state))
  ) {
    const persisted = await resolveCleanupResultReference({
      evidenceRoot: input.evidenceRoot,
      attempt: input.attempt,
      reference: current.cleanupReference,
      scope: "RESTORE",
      composeProject: input.composeProject,
      databaseName: input.databaseName,
    });
    if (persisted.authorityLifecycleSha256 !== current.previousLifecycleSha256)
      throw new Error("CLEANUP_TERMINAL_LIFECYCLE_MISMATCH");
    if (current.state === "CLEANED") {
      const live = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment: "isolated-restore",
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
      });
      if (persisted.status !== "PASS" || !observationIsEmpty(live))
        throw new Error("CLEANUP_TERMINAL_RECONCILIATION_FAILED");
    }
    return persisted;
  }
  const forwardFile = forwardRestoreCleanupEvidencePath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
  );
  if (!(await exists(forwardFile))) return null;
  if (current === null || current.state !== "QUIESCING")
    throw new Error("FORWARD_RESTORE_CLEANUP_RECOVERY_STATE");
  const evidence = verifyForwardRestoreCleanupEvidence(
    JSON.parse(await readFile(forwardFile, "utf8")),
  );
  const reference = forwardRestoreCleanupReference(evidence);
  await resolveForwardRestoreCleanupReference({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    reference,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
  });
  const result = verifyCleanupResult(evidence.restore);
  if (result.status === "PASS") {
    const live = await observeDockerProjectResources({
      attempt: input.attempt,
      project: input.composeProject,
      expectedEnvironment: "isolated-restore",
      runDocker: input.runDocker,
      environment: input.environment,
      now: input.now,
    });
    if (!observationIsEmpty(live))
      throw new Error("FORWARD_RESTORE_CLEANUP_RECOVERY_NOT_EMPTY");
  }
  await completeLifecycle({
    ...lifecycleInput,
    result,
    reference,
  });
  return result;
};

export const cleanupForwardRestoreProject = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  composeProject: string;
  databaseName: string;
  isolatedTarget?: JsonRecord | null;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<JsonRecord> => {
  const lifecycleInput = {
    ...input,
    scope: "RESTORE" as const,
  };
  const current = await readLifecycle(lifecycleInput);
  if (
    current !== null &&
    ["CLEANED", "CLEANUP_FAILED"].includes(String(current.state))
  )
    return cleanupOwnedProject(lifecycleInput);

  const pending = await resolvePendingForwardRestoreCleanup(input);
  if (pending !== null) return pending;

  const startedAt = input.now().toISOString();
  const result = verifyCleanupResult(await cleanupOwnedProject(lifecycleInput));
  if (result.status === "NOT_APPLICABLE") return result;
  const quiescing = await readLifecycle(lifecycleInput);
  if (
    quiescing === null ||
    quiescing.state !== "QUIESCING" ||
    quiescing.lifecycleSha256 !== result.authorityLifecycleSha256
  ) {
    if (result.status === "FAIL") return result;
    throw new Error("FORWARD_RESTORE_CLEANUP_AUTHORITY_STATE");
  }
  const persisted = await persistForwardRestoreCleanupEvidence({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    composeProject: input.composeProject,
    databaseName: input.databaseName,
    restore: result,
    startedAt,
    finishedAt: input.now().toISOString(),
  });
  await completeLifecycle({
    ...lifecycleInput,
    result,
    reference: persisted.reference,
  });
  const terminal = await readLifecycle(lifecycleInput);
  const expectedState = result.status === "PASS" ? "CLEANED" : "CLEANUP_FAILED";
  if (terminal === null || terminal.state !== expectedState)
    throw new Error("FORWARD_RESTORE_CLEANUP_TERMINAL_STATE");
  return result;
};

export const verifyTerminalRollbackEvidence = (value: unknown): JsonRecord => {
  const input = record(value, "TERMINAL_ROLLBACK_EVIDENCE");
  exactKeys(
    input,
    [
      "schemaVersion",
      "attemptId",
      "envelopeId",
      "targetId",
      "candidateManifestSha256",
      "applicationRollbackSha256",
      "cleanupReference",
      "terminalState",
      "reasonCode",
      "evidenceSha256",
    ],
    "TERMINAL_ROLLBACK_EVIDENCE",
  );
  if (
    input.schemaVersion !== "1.0" ||
    !["ROLLED_BACK", "ROLLBACK_FAILED"].includes(String(input.terminalState))
  )
    throw new Error("TERMINAL_ROLLBACK_VALUE");
  safe(input.attemptId, "TERMINAL_ROLLBACK_ATTEMPT");
  safe(input.envelopeId, "TERMINAL_ROLLBACK_ENVELOPE");
  safe(input.targetId, "TERMINAL_ROLLBACK_TARGET");
  digest(input.candidateManifestSha256, "TERMINAL_ROLLBACK_CANDIDATE");
  digest(input.applicationRollbackSha256, "TERMINAL_ROLLBACK_APPLICATION");
  const cleanupReference = verifyCleanupReference(
    input.cleanupReference,
    String(input.attemptId),
  );
  if (cleanupReference.kind !== "ROLLBACK_CLEANUP")
    throw new Error("TERMINAL_ROLLBACK_CLEANUP_KIND");
  safe(input.reasonCode, "TERMINAL_ROLLBACK_REASON");
  digest(input.evidenceSha256, "TERMINAL_ROLLBACK_SHA");
  if (canonicalSha256(input, ["evidenceSha256"]) !== input.evidenceSha256)
    throw new Error("TERMINAL_ROLLBACK_DIGEST");
  return input;
};

const terminalEvidencePath = (
  evidenceRoot: string,
  attemptId: string,
): string =>
  path.join(
    path.dirname(lifecyclePath(evidenceRoot, attemptId, "PRODUCTION")),
    "terminal-rollback-evidence.json",
  );

const persistTerminalEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  applicationRollback: JsonRecord;
  cleanupReference: JsonRecord;
}): Promise<JsonRecord> => {
  const expected = authority(input.attempt);
  const application = verifyApplicationRollback(input.applicationRollback);
  const reference = verifyCleanupReference(
    input.cleanupReference,
    String(expected.attemptId),
  );
  if (reference.kind !== "ROLLBACK_CLEANUP")
    throw new Error("TERMINAL_ROLLBACK_CLEANUP_KIND");
  const rolledBack =
    ["PASS", "NOT_APPLICABLE"].includes(String(application.status)) &&
    reference.status === "PASS";
  const evidence: JsonRecord = {
    schemaVersion: "1.0",
    attemptId: expected.attemptId,
    envelopeId: expected.envelopeId,
    targetId: expected.targetId,
    candidateManifestSha256: expected.candidateManifestSha256,
    applicationRollbackSha256: canonicalSha256(application),
    cleanupReference: reference,
    terminalState: rolledBack ? "ROLLED_BACK" : "ROLLBACK_FAILED",
    reasonCode: rolledBack
      ? "ROLLBACK_AND_CLEANUP_VERIFIED"
      : "ROLLBACK_OR_CLEANUP_FAILED",
    evidenceSha256: "",
  };
  evidence.evidenceSha256 = canonicalSha256(evidence, ["evidenceSha256"]);
  const verified = verifyTerminalRollbackEvidence(evidence);
  const file = terminalEvidencePath(
    input.evidenceRoot,
    String(input.attempt.attemptId),
  );
  if (await exists(file)) {
    const persisted = verifyTerminalRollbackEvidence(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (canonicalJson(persisted) !== canonicalJson(verified))
      throw new Error("TERMINAL_ROLLBACK_REPLAY_CONFLICT");
    return persisted;
  }
  await atomicWrite(file, canonicalJson(verified), 0o600);
  return verified;
};

export const resolveTerminalRollbackEvidence = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  applicationRollback: unknown;
  cleanupReference: unknown;
}): Promise<JsonRecord> => {
  const expected = authority(input.attempt);
  const application = verifyApplicationRollback(input.applicationRollback);
  const reference = verifyCleanupReference(
    input.cleanupReference,
    String(expected.attemptId),
  );
  if (reference.kind !== "ROLLBACK_CLEANUP")
    throw new Error("TERMINAL_ROLLBACK_CLEANUP_KIND");
  const cleanup = await resolveRollbackCleanupReference({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    reference,
  });
  if (cleanup.applicationRollbackSha256 !== canonicalSha256(application))
    throw new Error("TERMINAL_ROLLBACK_APPLICATION_MISMATCH");
  const terminal = verifyTerminalRollbackEvidence(
    JSON.parse(
      await readFile(
        terminalEvidencePath(input.evidenceRoot, String(expected.attemptId)),
        "utf8",
      ),
    ),
  );
  const rolledBack =
    ["PASS", "NOT_APPLICABLE"].includes(String(application.status)) &&
    cleanup.status === "PASS" &&
    reference.status === "PASS";
  const expectedState = rolledBack ? "ROLLED_BACK" : "ROLLBACK_FAILED";
  const expectedReason = rolledBack
    ? "ROLLBACK_AND_CLEANUP_VERIFIED"
    : "ROLLBACK_OR_CLEANUP_FAILED";
  if (
    terminal.attemptId !== expected.attemptId ||
    terminal.envelopeId !== expected.envelopeId ||
    terminal.targetId !== expected.targetId ||
    terminal.candidateManifestSha256 !== expected.candidateManifestSha256 ||
    terminal.applicationRollbackSha256 !== canonicalSha256(application) ||
    canonicalJson(terminal.cleanupReference) !== canonicalJson(reference) ||
    terminal.terminalState !== expectedState ||
    terminal.reasonCode !== expectedReason
  )
    throw new Error("TERMINAL_ROLLBACK_AUTHORITY_MISMATCH");
  return terminal;
};

const cleanupBlockedByApplicationFailure = async (input: {
  evidenceRoot: string;
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  databaseName?: string;
  error: unknown;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<JsonRecord> => {
  let lifecycle = await readLifecycle(input);
  let observed: JsonRecord | null = null;
  try {
    if (
      lifecycle !== null &&
      ["CREATING", "READY"].includes(String(lifecycle.state))
    ) {
      observed = await observeDockerProjectResources({
        attempt: input.attempt,
        project: input.composeProject,
        expectedEnvironment:
          input.scope === "PRODUCTION" ? "production" : "isolated-restore",
        runDocker: input.runDocker,
        environment: input.environment,
        now: input.now,
      });
      lifecycle = await transitionLifecycleToQuiescing({
        ...input,
        observed,
      });
    }
  } catch {
    // The aggregate FAIL below remains authoritative even when no trustworthy
    // resource set exists to advance the lifecycle safely.
  }
  return failResult({
    scope: input.scope,
    reasonCode: "APPLICATION_ROLLBACK_FAILED",
    error: input.error,
    lifecycle,
    observedBefore: observed,
  });
};

type RollbackWithCleanupOutput = {
  applicationRollback: JsonRecord;
  cleanupReference: JsonRecord;
  terminalEvidence: JsonRecord;
};

const reconcilePersistedCleanupResult = async (input: {
  scope: CleanupScope;
  attempt: JsonRecord;
  composeProject: string;
  result: JsonRecord;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<void> => {
  const result = verifyCleanupResult(input.result);
  if (result.status === "FAIL") return;
  const preservesUpgradeResources =
    result.status === "NOT_APPLICABLE" &&
    result.reasonCode === "UPGRADE_PRODUCTION_PRESERVED";
  const live = await observeDockerProjectResources({
    attempt: input.attempt,
    project: input.composeProject,
    expectedEnvironment:
      input.scope === "PRODUCTION" ? "production" : "isolated-restore",
    runDocker: input.runDocker,
    environment: input.environment,
    now: input.now,
    enforceAuthority: preservesUpgradeResources ? false : undefined,
  });
  if (preservesUpgradeResources) {
    if (!observationSetEqual(result.observedAfter, live))
      throw new Error("ROLLBACK_CLEANUP_RECOVERY_RESOURCE_DRIFT");
    return;
  }
  if (
    !observationIsEmpty(live) ||
    !observationSetEqual(result.observedAfter, live)
  )
    throw new Error("ROLLBACK_CLEANUP_RECOVERY_RESOURCE_REAPPEARED");
};

const finalizePersistedRollback = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  productionProject: string;
  restoreProject: string;
  restoreDatabaseName: string;
  isolatedTarget?: JsonRecord | null;
  databaseName: string;
  persisted: { evidence: JsonRecord; reference: JsonRecord };
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
}): Promise<RollbackWithCleanupOutput> => {
  const evidence = verifyRollbackCleanupEvidence(input.persisted.evidence);
  const reference = verifyCleanupReference(
    input.persisted.reference,
    String(input.attempt.attemptId),
  );
  if (
    reference.kind !== "ROLLBACK_CLEANUP" ||
    reference.cleanupSha256 !== evidence.cleanupSha256 ||
    reference.status !== evidence.status
  )
    throw new Error("ROLLBACK_CLEANUP_FINALIZE_REFERENCE");
  const applicationRollback = verifyApplicationRollback(
    evidence.applicationRollback,
  );
  if (
    canonicalSha256(applicationRollback) !== evidence.applicationRollbackSha256
  )
    throw new Error("ROLLBACK_CLEANUP_APPLICATION_DIGEST");
  const production = verifyCleanupResult(evidence.production);
  const restore = verifyCleanupResult(evidence.restore);
  const authorityEnvironment = attemptAuthorityEnvironment(
    input.attempt,
    input.environment,
  );
  await Promise.all([
    reconcilePersistedCleanupResult({
      scope: "PRODUCTION",
      attempt: input.attempt,
      composeProject: input.productionProject,
      result: production,
      runDocker: input.runDocker,
      environment: authorityEnvironment,
      now: input.now,
    }),
    reconcilePersistedCleanupResult({
      scope: "RESTORE",
      attempt: input.attempt,
      composeProject: input.restoreProject,
      result: restore,
      runDocker: input.runDocker,
      environment: {
        ...authorityEnvironment,
        COMPOSE_PROJECT_NAME: input.restoreProject,
        POSTGRES_DB: input.restoreDatabaseName,
      },
      now: input.now,
    }),
  ]);
  const productionReference =
    production.status === "NOT_APPLICABLE"
      ? reference
      : rollbackCleanupResultReference(evidence, "PRODUCTION");
  const restoreReference =
    restore.status === "NOT_APPLICABLE"
      ? reference
      : rollbackCleanupResultReference(evidence, "RESTORE");
  await Promise.all([
    completeLifecycle({
      evidenceRoot: input.evidenceRoot,
      scope: "PRODUCTION",
      attempt: input.attempt,
      composeProject: input.productionProject,
      databaseName: input.databaseName,
      result: production,
      reference: productionReference,
      now: input.now,
    }),
    completeLifecycle({
      evidenceRoot: input.evidenceRoot,
      scope: "RESTORE",
      attempt: input.attempt,
      composeProject: input.restoreProject,
      databaseName: input.restoreDatabaseName,
      isolatedTarget: input.isolatedTarget ?? null,
      result: restore,
      reference: restoreReference,
      now: input.now,
    }),
  ]);
  const terminalEvidence = await persistTerminalEvidence({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    applicationRollback,
    cleanupReference: reference,
  });
  return {
    applicationRollback,
    cleanupReference: reference,
    terminalEvidence,
  };
};

export const executeRollbackWithCleanup = async (input: {
  evidenceRoot: string;
  attempt: JsonRecord;
  productionProject: string;
  restoreProject: string;
  restoreDatabaseName: string;
  isolatedTarget?: JsonRecord | null;
  databaseUser: string;
  databaseName: string;
  runApplicationRollback: () => Promise<JsonRecord>;
  runDocker: CleanupDockerRunner;
  environment: NodeJS.ProcessEnv;
  now: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  afterCleanupEvidencePersisted?: () => Promise<void>;
}): Promise<RollbackWithCleanupOutput> => {
  const authorityEnvironment = attemptAuthorityEnvironment(
    input.attempt,
    input.environment,
  );
  const recovered = await recoverRollbackCleanupEvidence({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
  });
  if (recovered !== null)
    return finalizePersistedRollback({
      ...input,
      persisted: recovered,
    });
  const pendingForwardRestore = await resolvePendingForwardRestoreCleanup({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    composeProject: input.restoreProject,
    databaseName: input.restoreDatabaseName,
    isolatedTarget: input.isolatedTarget ?? null,
    runDocker: input.runDocker,
    environment: {
      ...authorityEnvironment,
      COMPOSE_PROJECT_NAME: input.restoreProject,
      POSTGRES_DB: input.restoreDatabaseName,
    },
    now: input.now,
  });
  const startedAt = input.now().toISOString();
  let applicationError: unknown;
  let applicationRollback: JsonRecord;
  try {
    applicationRollback = verifyApplicationRollback(
      await input.runApplicationRollback(),
    );
  } catch (error) {
    applicationError = error;
    applicationRollback = materializeApplicationRollbackFailure({
      attempt: input.attempt,
      error,
      startedAt,
      finishedAt: input.now().toISOString(),
    });
  }
  const production =
    applicationRollback.status === "FAIL"
      ? await cleanupBlockedByApplicationFailure({
          evidenceRoot: input.evidenceRoot,
          scope: "PRODUCTION",
          attempt: input.attempt,
          composeProject: input.productionProject,
          databaseName: input.databaseName,
          error: applicationError ?? new Error("APPLICATION_ROLLBACK_FAILED"),
          runDocker: input.runDocker,
          environment: authorityEnvironment,
          now: input.now,
        })
      : await cleanupOwnedProject({
          evidenceRoot: input.evidenceRoot,
          scope: "PRODUCTION",
          attempt: input.attempt,
          composeProject: input.productionProject,
          databaseUser: input.databaseUser,
          databaseName: input.databaseName,
          runDocker: input.runDocker,
          environment: authorityEnvironment,
          now: input.now,
          sleep: input.sleep,
        });
  const restore =
    pendingForwardRestore ??
    (await cleanupOwnedProject({
      evidenceRoot: input.evidenceRoot,
      scope: "RESTORE",
      attempt: input.attempt,
      composeProject: input.restoreProject,
      databaseName: input.restoreDatabaseName,
      isolatedTarget: input.isolatedTarget ?? null,
      runDocker: input.runDocker,
      environment: {
        ...authorityEnvironment,
        COMPOSE_PROJECT_NAME: input.restoreProject,
        POSTGRES_DB: input.restoreDatabaseName,
      },
      now: input.now,
      sleep: input.sleep,
    }));
  const persisted = await persistRollbackCleanupEvidence({
    evidenceRoot: input.evidenceRoot,
    attempt: input.attempt,
    applicationRollback,
    production,
    restore,
    startedAt,
    finishedAt: input.now().toISOString(),
  });
  await input.afterCleanupEvidencePersisted?.();
  return finalizePersistedRollback({ ...input, persisted });
};
