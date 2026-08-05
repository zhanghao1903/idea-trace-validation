import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalSha256 } from "./canonical-json.js";
import { optionalValue, parseArgs, requiredValue } from "./cli-args.js";
import {
  assertClientId,
  assertCredentialReferenceName,
  assertDisplayName,
  parseHandoff,
  type ClientConnectionProfileV1,
  type CredentialSource,
} from "./contracts.js";
import { redactSecrets, resolveCredential } from "./credential.js";
import { assertDeploymentAuthority } from "./git-authority.js";
import {
  deriveProfileId,
  profileIdentity,
  storeProfile,
} from "./profile-store.js";
import { readJsonFile } from "./safe-files.js";
import { assertOpenapiUrl, normalizeBaseUrl } from "./url.js";
import { verifyConnection, verifySyntheticWrite } from "./verify.js";

export interface InitializeResult {
  profile: ClientConnectionProfileV1;
  outputPath: string;
  changed: boolean;
  credentialVerified: boolean;
}

export const initializeProfile = async (input: {
  handoffPath: string;
  clientId: string;
  displayName: string;
  credentialSource: CredentialSource;
  outputPath: string;
  skillRoot: string;
  replace?: boolean;
  allowLoopbackHttp?: boolean;
  verifySyntheticWrite?: boolean;
  now?: () => string;
}): Promise<InitializeResult> => {
  const handoff = parseHandoff(await readJsonFile(input.handoffPath));
  const baseUrl = normalizeBaseUrl(handoff.baseUrl, input.allowLoopbackHttp);
  if (baseUrl !== handoff.baseUrl) throw new Error("BASE_URL_NOT_CANONICAL");
  assertOpenapiUrl(baseUrl, handoff.openapiUrl);
  const clientId = assertClientId(input.clientId);
  const displayName = assertDisplayName(input.displayName);
  if (handoff.expiresAt !== null && Date.parse(handoff.expiresAt) <= Date.now())
    throw new Error("CREDENTIAL_EXPIRED");
  await assertDeploymentAuthority(handoff, input.skillRoot);
  const connection = await verifyConnection(handoff);
  const credential = await resolveCredential(input.credentialSource);
  const evidence = input.verifySyntheticWrite
    ? await verifySyntheticWrite({
        handoff,
        token: credential.token,
        clientId,
        displayName,
        now: input.now,
      })
    : null;
  const updatedAt = input.now?.() ?? new Date().toISOString();
  const profile: ClientConnectionProfileV1 = {
    schemaVersion: 1,
    kind: "idea-validation-client-profile",
    profileId: "profile_000000000000000000000000",
    profileRevision: 1,
    baseUrl,
    openapiUrl: handoff.openapiUrl,
    releaseId: handoff.releaseId,
    sourceCommit: handoff.sourceCommit,
    skill: {
      commit: handoff.skillCommit,
      version: handoff.skillVersion,
      treeSha256: handoff.skillTreeSha256,
    },
    clientId,
    displayName,
    credential: {
      id: handoff.credentialId,
      fingerprint: credential.fingerprint,
      source: credential.source,
      expiresAt: handoff.expiresAt,
    },
    declaredAiScopes: handoff.declaredAiScopes,
    validation: {
      connection: "VERIFIED",
      openapi: "VERIFIED",
      credentialPresence: "PRESENT",
      credentialUsability: evidence === null ? "UNVERIFIED" : "VERIFIED",
      verifiedAt: connection.verifiedAt,
      credentialEvidence: evidence,
    },
    issuedAt: handoff.issuedAt,
    updatedAt,
  };
  profile.profileId = deriveProfileId(profileIdentity(profile));
  const stored = await storeProfile({
    outputPath: input.outputPath,
    candidate: profile,
    replace: input.replace ?? false,
  });
  return {
    profile: stored.profile,
    outputPath: input.outputPath,
    changed: stored.changed,
    credentialVerified:
      stored.profile.validation.credentialUsability === "VERIFIED",
  };
};

const run = async (): Promise<void> => {
  const args = parseArgs(
    process.argv.slice(2),
    [
      "--handoff",
      "--client-id",
      "--display-name",
      "--credential-env",
      "--credential-file",
      "--output",
      "--skill-root",
    ],
    ["--replace", "--allow-loopback-http", "--verify-synthetic-write"],
  );
  const env = optionalValue(args, "--credential-env");
  const file = optionalValue(args, "--credential-file");
  if ((env === undefined) === (file === undefined))
    throw new Error("CREDENTIAL_SOURCE_REQUIRED");
  const source: CredentialSource =
    env !== undefined
      ? { kind: "ENV", name: assertCredentialReferenceName(env) }
      : { kind: "FILE", path: path.resolve(file as string) };
  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(currentFile), "../..");
  const outputPath = path.resolve(requiredValue(args, "--output"));
  const result = await initializeProfile({
    handoffPath: path.resolve(requiredValue(args, "--handoff")),
    clientId: requiredValue(args, "--client-id"),
    displayName: requiredValue(args, "--display-name"),
    credentialSource: source,
    outputPath,
    skillRoot: path.resolve(
      optionalValue(args, "--skill-root") ?? path.join(repoRoot, "skills"),
    ),
    replace: args.flags.has("--replace"),
    allowLoopbackHttp: args.flags.has("--allow-loopback-http"),
    verifySyntheticWrite: args.flags.has("--verify-synthetic-write"),
  });
  console.log(
    JSON.stringify({
      ok:
        result.credentialVerified ||
        !args.flags.has("--verify-synthetic-write"),
      code: result.credentialVerified
        ? "PROFILE_VERIFIED"
        : "PROFILE_CONFIGURED",
      profilePath: result.outputPath,
      profileId: result.profile.profileId,
      profileRevision: result.profile.profileRevision,
      releaseId: result.profile.releaseId,
      credentialId: result.profile.credential.id,
      credentialUsability: result.profile.validation.credentialUsability,
      changed: result.changed,
      profileSha256: canonicalSha256(result.profile),
    }),
  );
  if (args.flags.has("--verify-synthetic-write") && !result.credentialVerified)
    process.exitCode = 2;
};

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFile
) {
  run().catch((error: unknown) => {
    const code =
      error instanceof Error ? error.message : "INITIALIZATION_FAILED";
    console.error(JSON.stringify({ ok: false, code: redactSecrets(code, []) }));
    process.exitCode = 1;
  });
}
