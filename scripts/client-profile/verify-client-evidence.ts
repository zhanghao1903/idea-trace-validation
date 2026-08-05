import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "./canonical-json.js";

interface ClientEvidenceV1 {
  schemaVersion: 1;
  kind: "idea-validation-client-compatibility-evidence";
  client: "CODEX" | "CLAUDE" | "COMPATIBLE";
  clientVersion: string;
  executionSurface: string;
  skillCommit: string;
  skillTreeSha256: string;
  profileSha256: string;
  profileSchemaVersion: 1;
  releaseId: string;
  profileId: string;
  credentialId: string;
  requestId: string;
  resourceId: string;
  clientId: string;
  displayName: string;
  rawTranscriptSha256: string;
  executedAt: string;
  checks: {
    initializationLoaded: true;
    workflowLoaded: true;
    authorizedWrite: true;
    publicRead: true;
    attributionMatch: true;
  };
}

const SHA = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const REQUEST = /^req_[0-9A-HJKMNP-TV-Z]{26}$/u;
const IDEA = /^idea_[0-9A-HJKMNP-TV-Z]{26}$/u;

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("CLIENT_EVIDENCE_INVALID");
  return value as Record<string, unknown>;
};

const exact = (
  value: Record<string, unknown>,
  keys: readonly string[],
): void => {
  const actual = Object.keys(value).sort().join(",");
  const expected = [...keys].sort().join(",");
  if (actual !== expected) throw new Error("CLIENT_EVIDENCE_INVALID");
};

const parse = (value: unknown): ClientEvidenceV1 => {
  const input = record(value);
  exact(input, [
    "schemaVersion",
    "kind",
    "client",
    "clientVersion",
    "executionSurface",
    "skillCommit",
    "skillTreeSha256",
    "profileSha256",
    "profileSchemaVersion",
    "releaseId",
    "profileId",
    "credentialId",
    "requestId",
    "resourceId",
    "clientId",
    "displayName",
    "rawTranscriptSha256",
    "executedAt",
    "checks",
  ]);
  const checks = record(input.checks);
  exact(checks, [
    "initializationLoaded",
    "workflowLoaded",
    "authorizedWrite",
    "publicRead",
    "attributionMatch",
  ]);
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "idea-validation-client-compatibility-evidence" ||
    !["CODEX", "CLAUDE", "COMPATIBLE"].includes(String(input.client)) ||
    typeof input.clientVersion !== "string" ||
    input.clientVersion.length < 1 ||
    input.clientVersion.length > 120 ||
    typeof input.executionSurface !== "string" ||
    input.executionSurface.length < 1 ||
    input.executionSurface.length > 240 ||
    typeof input.skillCommit !== "string" ||
    !GIT_SHA.test(input.skillCommit) ||
    typeof input.skillTreeSha256 !== "string" ||
    !SHA.test(input.skillTreeSha256) ||
    typeof input.profileSha256 !== "string" ||
    !SHA.test(input.profileSha256) ||
    input.profileSchemaVersion !== 1 ||
    typeof input.releaseId !== "string" ||
    !SAFE.test(input.releaseId) ||
    typeof input.profileId !== "string" ||
    !/^profile_[a-f0-9]{24}$/u.test(input.profileId) ||
    typeof input.credentialId !== "string" ||
    !SAFE.test(input.credentialId) ||
    typeof input.requestId !== "string" ||
    !REQUEST.test(input.requestId) ||
    typeof input.resourceId !== "string" ||
    !IDEA.test(input.resourceId) ||
    typeof input.clientId !== "string" ||
    !SAFE.test(input.clientId) ||
    typeof input.displayName !== "string" ||
    input.displayName.trim() !== input.displayName ||
    input.displayName.length < 1 ||
    input.displayName.length > 120 ||
    typeof input.rawTranscriptSha256 !== "string" ||
    !SHA.test(input.rawTranscriptSha256) ||
    typeof input.executedAt !== "string" ||
    !Number.isFinite(Date.parse(input.executedAt)) ||
    Object.values(checks).some((check) => check !== true)
  )
    throw new Error("CLIENT_EVIDENCE_INVALID");
  const serialized = canonicalJson(input);
  if (
    /(?:Bearer\s+|authorization|cookie|HUMAN_CONTROL_TOKEN|https?:\/\/[^\s/@]+:[^\s/@]+@)/iu.test(
      serialized,
    )
  )
    throw new Error("CLIENT_EVIDENCE_SECRET");
  return input as unknown as ClientEvidenceV1;
};

export const verifyClientEvidence = async (
  paths: readonly string[],
): Promise<ClientEvidenceV1[]> => {
  if (paths.length < 2) throw new Error("CLIENT_EVIDENCE_PAIR_REQUIRED");
  const records = await Promise.all(
    paths.map(async (file) => parse(JSON.parse(await readFile(file, "utf8")))),
  );
  if (
    !records.some((record) => record.client === "CODEX") ||
    !records.some(
      (record) => record.client === "CLAUDE" || record.client === "COMPATIBLE",
    )
  )
    throw new Error("CLIENT_EVIDENCE_PAIR_REQUIRED");
  const authorities = new Set(
    records.map(
      (record) =>
        `${record.skillCommit}:${record.skillTreeSha256}:${record.releaseId}:${record.profileSchemaVersion}`,
    ),
  );
  if (authorities.size !== 1)
    throw new Error("CLIENT_EVIDENCE_AUTHORITY_MISMATCH");
  return records;
};

const run = async (): Promise<void> => {
  const paths = process.argv.slice(2).map((item) => path.resolve(item));
  const records = await verifyClientEvidence(paths);
  console.log(
    JSON.stringify({
      ok: true,
      code: "CLIENT_EVIDENCE_VERIFIED",
      clients: records.map((record) => record.client).sort(),
      skillCommit: records[0]?.skillCommit,
    }),
  );
};

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFile
) {
  run().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        code:
          error instanceof Error ? error.message : "CLIENT_EVIDENCE_INVALID",
      }),
    );
    process.exitCode = 1;
  });
}
