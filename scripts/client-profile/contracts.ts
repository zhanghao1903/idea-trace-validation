import { canonicalSha256 } from "./canonical-json.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const PROFILE_ID = /^profile_[a-f0-9]{24}$/u;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SKILL_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/u;
const SCOPE = /^[a-z][a-z0-9:._-]{0,119}$/u;

export type CredentialSource =
  { kind: "ENV"; name: string } | { kind: "FILE"; path: string };

export interface DeploymentConnectionHandoffV1 {
  schemaVersion: 1;
  kind: "idea-validation-deployment-handoff";
  baseUrl: string;
  openapiUrl: string;
  releaseId: string;
  sourceCommit: string;
  skillCommit: string;
  skillVersion: string;
  skillTreeSha256: string;
  openapiSha256: string;
  declaredAiScopes: string[];
  credentialId: string;
  expiresAt: string | null;
  issuedAt: string;
  authoritySha256: string;
}

export type DeploymentConnectionHandoffAuthority = Omit<
  DeploymentConnectionHandoffV1,
  "authoritySha256"
>;

export interface CredentialEvidenceV1 {
  kind: "SYNTHETIC_IDEA_READBACK";
  requestId: string;
  resourceId: string;
  idempotencyKeySha256: string;
  observedClient: string;
  observedDisplayName: string;
  verifiedAt: string;
}

export interface ClientConnectionProfileV1 {
  schemaVersion: 1;
  kind: "idea-validation-client-profile";
  profileId: string;
  profileRevision: number;
  baseUrl: string;
  openapiUrl: string;
  releaseId: string;
  sourceCommit: string;
  skill: {
    commit: string;
    version: string;
    treeSha256: string;
  };
  clientId: string;
  displayName: string;
  credential: {
    id: string;
    fingerprint: string;
    source: CredentialSource;
    expiresAt: string | null;
  };
  declaredAiScopes: string[];
  validation: {
    connection: "VERIFIED";
    openapi: "VERIFIED";
    credentialPresence: "PRESENT";
    credentialUsability: "VERIFIED" | "UNVERIFIED";
    verifiedAt: string;
    credentialEvidence: CredentialEvidenceV1 | null;
  };
  issuedAt: string;
  updatedAt: string;
}

type JsonRecord = Record<string, unknown>;

const record = (value: unknown, code: string): JsonRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(code);
  return value as JsonRecord;
};

const exactKeys = (
  value: JsonRecord,
  expected: readonly string[],
  code: string,
): void => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, i) => key !== wanted[i])
  )
    throw new Error(code);
};

const text = (value: unknown, pattern: RegExp, code: string): string => {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(code);
  return value;
};

const timestamp = (
  value: unknown,
  nullable: boolean,
  code: string,
): string | null => {
  if (value === null && nullable) return null;
  const parsed = text(value, ISO_TIME, code);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(code);
  return parsed;
};

const scopes = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32)
    throw new Error("DECLARED_SCOPES_INVALID");
  const parsed = value.map((scope) =>
    text(scope, SCOPE, "DECLARED_SCOPES_INVALID"),
  );
  if (
    new Set(parsed).size !== parsed.length ||
    [...parsed].sort().some((v, i) => v !== parsed[i])
  )
    throw new Error("DECLARED_SCOPES_INVALID");
  return parsed;
};

export const assertClientId = (value: unknown): string =>
  text(value, SAFE_ID, "CLIENT_ID_INVALID");

export const assertDisplayName = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new Error("DISPLAY_NAME_INVALID");
  return value;
};

export const assertCredentialReferenceName = (value: unknown): string => {
  const name = text(value, ENV_NAME, "CREDENTIAL_SOURCE_INVALID");
  if (/(?:HUMAN|CONTROL|COOKIE|CAPABILITY|PASSWORD|DATABASE)/u.test(name))
    throw new Error("HUMAN_CONTROL_CREDENTIAL_FORBIDDEN");
  return name;
};

export const parseHandoff = (value: unknown): DeploymentConnectionHandoffV1 => {
  const input = record(value, "HANDOFF_INVALID");
  exactKeys(
    input,
    [
      "schemaVersion",
      "kind",
      "baseUrl",
      "openapiUrl",
      "releaseId",
      "sourceCommit",
      "skillCommit",
      "skillVersion",
      "skillTreeSha256",
      "openapiSha256",
      "declaredAiScopes",
      "credentialId",
      "expiresAt",
      "issuedAt",
      "authoritySha256",
    ],
    "HANDOFF_FIELDS_INVALID",
  );
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "idea-validation-deployment-handoff"
  )
    throw new Error("HANDOFF_VERSION_INVALID");
  const parsed: DeploymentConnectionHandoffV1 = {
    schemaVersion: 1,
    kind: "idea-validation-deployment-handoff",
    baseUrl: text(input.baseUrl, /^.{1,2048}$/u, "BASE_URL_INVALID"),
    openapiUrl: text(input.openapiUrl, /^.{1,2048}$/u, "OPENAPI_URL_INVALID"),
    releaseId: text(input.releaseId, SAFE_ID, "RELEASE_ID_INVALID"),
    sourceCommit: text(input.sourceCommit, GIT_SHA, "SOURCE_COMMIT_INVALID"),
    skillCommit: text(input.skillCommit, GIT_SHA, "SKILL_COMMIT_INVALID"),
    skillVersion: text(
      input.skillVersion,
      SKILL_VERSION,
      "SKILL_VERSION_INVALID",
    ),
    skillTreeSha256: text(input.skillTreeSha256, SHA256, "SKILL_TREE_INVALID"),
    openapiSha256: text(input.openapiSha256, SHA256, "OPENAPI_DIGEST_INVALID"),
    declaredAiScopes: scopes(input.declaredAiScopes),
    credentialId: text(input.credentialId, SAFE_ID, "CREDENTIAL_ID_INVALID"),
    expiresAt: timestamp(input.expiresAt, true, "EXPIRY_INVALID"),
    issuedAt: timestamp(input.issuedAt, false, "ISSUED_AT_INVALID") as string,
    authoritySha256: text(
      input.authoritySha256,
      SHA256,
      "HANDOFF_AUTHORITY_INVALID",
    ),
  };
  if (deploymentHandoffAuthoritySha256(parsed) !== parsed.authoritySha256)
    throw new Error("HANDOFF_AUTHORITY_MISMATCH");
  return parsed;
};

export const deploymentHandoffAuthoritySha256 = (
  handoff: DeploymentConnectionHandoffAuthority,
): string => {
  const { authoritySha256: ignored, ...authority } =
    handoff as DeploymentConnectionHandoffV1;
  void ignored;
  return canonicalSha256(authority);
};

const parseSource = (value: unknown): CredentialSource => {
  const source = record(value, "CREDENTIAL_SOURCE_INVALID");
  if (source.kind === "ENV") {
    exactKeys(source, ["kind", "name"], "CREDENTIAL_SOURCE_INVALID");
    return { kind: "ENV", name: assertCredentialReferenceName(source.name) };
  }
  if (source.kind === "FILE") {
    exactKeys(source, ["kind", "path"], "CREDENTIAL_SOURCE_INVALID");
    if (
      typeof source.path !== "string" ||
      !source.path.startsWith("/") ||
      source.path.length > 4096
    )
      throw new Error("CREDENTIAL_SOURCE_INVALID");
    return { kind: "FILE", path: source.path };
  }
  throw new Error("CREDENTIAL_SOURCE_INVALID");
};

const parseEvidence = (value: unknown): CredentialEvidenceV1 | null => {
  if (value === null) return null;
  const input = record(value, "CREDENTIAL_EVIDENCE_INVALID");
  exactKeys(
    input,
    [
      "kind",
      "requestId",
      "resourceId",
      "idempotencyKeySha256",
      "observedClient",
      "observedDisplayName",
      "verifiedAt",
    ],
    "CREDENTIAL_EVIDENCE_INVALID",
  );
  if (input.kind !== "SYNTHETIC_IDEA_READBACK")
    throw new Error("CREDENTIAL_EVIDENCE_INVALID");
  return {
    kind: "SYNTHETIC_IDEA_READBACK",
    requestId: text(
      input.requestId,
      /^req_[0-9A-HJKMNP-TV-Z]{26}$/u,
      "CREDENTIAL_EVIDENCE_INVALID",
    ),
    resourceId: text(
      input.resourceId,
      /^idea_[0-9A-HJKMNP-TV-Z]{26}$/u,
      "CREDENTIAL_EVIDENCE_INVALID",
    ),
    idempotencyKeySha256: text(
      input.idempotencyKeySha256,
      SHA256,
      "CREDENTIAL_EVIDENCE_INVALID",
    ),
    observedClient: assertClientId(input.observedClient),
    observedDisplayName: assertDisplayName(input.observedDisplayName),
    verifiedAt: timestamp(
      input.verifiedAt,
      false,
      "CREDENTIAL_EVIDENCE_INVALID",
    ) as string,
  };
};

export const parseProfile = (value: unknown): ClientConnectionProfileV1 => {
  const input = record(value, "PROFILE_INVALID");
  exactKeys(
    input,
    [
      "schemaVersion",
      "kind",
      "profileId",
      "profileRevision",
      "baseUrl",
      "openapiUrl",
      "releaseId",
      "sourceCommit",
      "skill",
      "clientId",
      "displayName",
      "credential",
      "declaredAiScopes",
      "validation",
      "issuedAt",
      "updatedAt",
    ],
    "PROFILE_FIELDS_INVALID",
  );
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "idea-validation-client-profile"
  )
    throw new Error("PROFILE_VERSION_INVALID");
  const skill = record(input.skill, "PROFILE_SKILL_INVALID");
  exactKeys(
    skill,
    ["commit", "version", "treeSha256"],
    "PROFILE_SKILL_INVALID",
  );
  const credential = record(input.credential, "PROFILE_CREDENTIAL_INVALID");
  exactKeys(
    credential,
    ["id", "fingerprint", "source", "expiresAt"],
    "PROFILE_CREDENTIAL_INVALID",
  );
  const validation = record(input.validation, "PROFILE_VALIDATION_INVALID");
  exactKeys(
    validation,
    [
      "connection",
      "openapi",
      "credentialPresence",
      "credentialUsability",
      "verifiedAt",
      "credentialEvidence",
    ],
    "PROFILE_VALIDATION_INVALID",
  );
  if (
    !Number.isSafeInteger(input.profileRevision) ||
    (input.profileRevision as number) < 1
  )
    throw new Error("PROFILE_REVISION_INVALID");
  if (
    validation.connection !== "VERIFIED" ||
    validation.openapi !== "VERIFIED" ||
    validation.credentialPresence !== "PRESENT"
  )
    throw new Error("PROFILE_VALIDATION_INVALID");
  if (
    validation.credentialUsability !== "VERIFIED" &&
    validation.credentialUsability !== "UNVERIFIED"
  )
    throw new Error("PROFILE_VALIDATION_INVALID");
  const evidence = parseEvidence(validation.credentialEvidence);
  if ((validation.credentialUsability === "VERIFIED") !== (evidence !== null))
    throw new Error("PROFILE_VALIDATION_INVALID");
  return {
    schemaVersion: 1,
    kind: "idea-validation-client-profile",
    profileId: text(input.profileId, PROFILE_ID, "PROFILE_ID_INVALID"),
    profileRevision: input.profileRevision as number,
    baseUrl: text(input.baseUrl, /^.{1,2048}$/u, "BASE_URL_INVALID"),
    openapiUrl: text(input.openapiUrl, /^.{1,2048}$/u, "OPENAPI_URL_INVALID"),
    releaseId: text(input.releaseId, SAFE_ID, "RELEASE_ID_INVALID"),
    sourceCommit: text(input.sourceCommit, GIT_SHA, "SOURCE_COMMIT_INVALID"),
    skill: {
      commit: text(skill.commit, GIT_SHA, "SKILL_COMMIT_INVALID"),
      version: text(skill.version, SKILL_VERSION, "SKILL_VERSION_INVALID"),
      treeSha256: text(skill.treeSha256, SHA256, "SKILL_TREE_INVALID"),
    },
    clientId: assertClientId(input.clientId),
    displayName: assertDisplayName(input.displayName),
    credential: {
      id: text(credential.id, SAFE_ID, "CREDENTIAL_ID_INVALID"),
      fingerprint: text(
        credential.fingerprint,
        /^sha256:[a-f0-9]{64}$/u,
        "CREDENTIAL_FINGERPRINT_INVALID",
      ),
      source: parseSource(credential.source),
      expiresAt: timestamp(credential.expiresAt, true, "EXPIRY_INVALID"),
    },
    declaredAiScopes: scopes(input.declaredAiScopes),
    validation: {
      connection: "VERIFIED",
      openapi: "VERIFIED",
      credentialPresence: "PRESENT",
      credentialUsability: validation.credentialUsability,
      verifiedAt: timestamp(
        validation.verifiedAt,
        false,
        "PROFILE_VALIDATION_INVALID",
      ) as string,
      credentialEvidence: evidence,
    },
    issuedAt: timestamp(input.issuedAt, false, "ISSUED_AT_INVALID") as string,
    updatedAt: timestamp(
      input.updatedAt,
      false,
      "UPDATED_AT_INVALID",
    ) as string,
  };
};

export const assertProfileMatchesHandoff = (
  profile: ClientConnectionProfileV1,
  handoff: DeploymentConnectionHandoffV1,
): void => {
  if (
    profile.baseUrl !== handoff.baseUrl ||
    profile.openapiUrl !== handoff.openapiUrl ||
    profile.releaseId !== handoff.releaseId ||
    profile.sourceCommit !== handoff.sourceCommit ||
    profile.skill.commit !== handoff.skillCommit ||
    profile.skill.version !== handoff.skillVersion ||
    profile.credential.id !== handoff.credentialId ||
    profile.credential.expiresAt !== handoff.expiresAt ||
    JSON.stringify(profile.declaredAiScopes) !==
      JSON.stringify(handoff.declaredAiScopes)
  )
    throw new Error("PROFILE_HANDOFF_MISMATCH");
};
