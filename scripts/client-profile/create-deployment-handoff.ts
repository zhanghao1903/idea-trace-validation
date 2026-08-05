import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalSha256 } from "./canonical-json.js";
import { parseArgs, repeatedValues, requiredValue } from "./cli-args.js";
import {
  parseHandoff,
  type DeploymentConnectionHandoffV1,
} from "./contracts.js";
import { atomicWrite0600 } from "./safe-files.js";
import { normalizeBaseUrl } from "./url.js";
import { openapiCompatibilityDigest } from "./verify.js";

export const createDeploymentHandoff = async (input: {
  baseUrl: string;
  releaseId: string;
  sourceCommit: string;
  skillCommit: string;
  skillVersion: string;
  openapiPath: string;
  credentialId: string;
  expiresAt: string | null;
  issuedAt: string;
  declaredAiScopes: string[];
  outputPath: string;
  allowLoopbackHttp?: boolean;
}): Promise<DeploymentConnectionHandoffV1> => {
  const baseUrl = normalizeBaseUrl(input.baseUrl, input.allowLoopbackHttp);
  const openapi = JSON.parse(
    await readFile(input.openapiPath, "utf8"),
  ) as unknown;
  const handoff = parseHandoff({
    schemaVersion: 1,
    kind: "idea-validation-deployment-handoff",
    baseUrl,
    openapiUrl: `${baseUrl}/openapi.json`,
    releaseId: input.releaseId,
    sourceCommit: input.sourceCommit,
    skillCommit: input.skillCommit,
    skillVersion: input.skillVersion,
    openapiSha256: openapiCompatibilityDigest(openapi),
    declaredAiScopes: [...input.declaredAiScopes].sort(),
    credentialId: input.credentialId,
    expiresAt: input.expiresAt,
    issuedAt: input.issuedAt,
  });
  await atomicWrite0600(input.outputPath, canonicalJson(handoff));
  return handoff;
};

const run = async (): Promise<void> => {
  const args = parseArgs(
    process.argv.slice(2),
    [
      "--base-url",
      "--release-id",
      "--source-commit",
      "--skill-commit",
      "--skill-version",
      "--openapi-file",
      "--credential-id",
      "--expires-at",
      "--issued-at",
      "--scope",
      "--output",
    ],
    ["--allow-loopback-http"],
  );
  const expiry = requiredValue(args, "--expires-at");
  const outputPath = path.resolve(requiredValue(args, "--output"));
  const handoff = await createDeploymentHandoff({
    baseUrl: requiredValue(args, "--base-url"),
    releaseId: requiredValue(args, "--release-id"),
    sourceCommit: requiredValue(args, "--source-commit"),
    skillCommit: requiredValue(args, "--skill-commit"),
    skillVersion: requiredValue(args, "--skill-version"),
    openapiPath: path.resolve(requiredValue(args, "--openapi-file")),
    credentialId: requiredValue(args, "--credential-id"),
    expiresAt: expiry === "none" ? null : expiry,
    issuedAt: requiredValue(args, "--issued-at"),
    declaredAiScopes: repeatedValues(args, "--scope"),
    outputPath,
    allowLoopbackHttp: args.flags.has("--allow-loopback-http"),
  });
  console.log(
    JSON.stringify({
      ok: true,
      code: "DEPLOYMENT_HANDOFF_CREATED",
      outputPath,
      releaseId: handoff.releaseId,
      credentialId: handoff.credentialId,
      handoffSha256: canonicalSha256(handoff),
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
        code: error instanceof Error ? error.message : "HANDOFF_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
