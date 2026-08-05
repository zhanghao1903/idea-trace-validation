import { lstat, readFile } from "node:fs/promises";

import { sha256 } from "./canonical-json.js";
import {
  assertCredentialReferenceName,
  type CredentialSource,
} from "./contracts.js";

const MAXIMUM_TOKEN_BYTES = 4096;
const MINIMUM_TOKEN_BYTES = 32;

export interface ResolvedCredential {
  token: string;
  fingerprint: string;
  source: CredentialSource;
}

const validateToken = (raw: string): string => {
  const token = raw.trim();
  const bytes = Buffer.byteLength(token);
  if (
    bytes < MINIMUM_TOKEN_BYTES ||
    bytes > MAXIMUM_TOKEN_BYTES ||
    /[\u0000-\u001f\u007f\s]/u.test(token)
  )
    throw new Error("CREDENTIAL_REQUIRED");
  const human = process.env.HUMAN_CONTROL_TOKEN?.trim();
  if (human !== undefined && human.length > 0 && token === human)
    throw new Error("HUMAN_CONTROL_CREDENTIAL_FORBIDDEN");
  return token;
};

const fingerprint = (token: string): string =>
  `sha256:${sha256(`idea-validation-ai-bearer:v1\0${token}`)}`;

export const resolveCredential = async (
  source: CredentialSource,
): Promise<ResolvedCredential> => {
  let raw: string;
  if (source.kind === "ENV") {
    const name = assertCredentialReferenceName(source.name);
    const value = process.env[name];
    if (value === undefined) throw new Error("CREDENTIAL_REQUIRED");
    raw = value;
  } else {
    const stats = await lstat(source.path).catch(() => {
      throw new Error("CREDENTIAL_SOURCE_INVALID");
    });
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size < 1 ||
      stats.size > MAXIMUM_TOKEN_BYTES + 2
    )
      throw new Error("CREDENTIAL_SOURCE_INVALID");
    if (process.platform !== "win32" && (stats.mode & 0o077) !== 0)
      throw new Error("CREDENTIAL_FILE_PERMISSIONS");
    raw = await readFile(source.path, "utf8");
  }
  const token = validateToken(raw);
  return { token, fingerprint: fingerprint(token), source };
};

export const redactSecrets = (
  message: string,
  exactSecrets: readonly string[],
): string => {
  let output = message;
  for (const secret of exactSecrets) {
    if (secret.length > 0) output = output.split(secret).join("[REDACTED]");
  }
  return output
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [REDACTED]")
    .replace(
      /(?:authorization|cookie|password|secret|token)\s*[:=]\s*[^\s,}]+/giu,
      "$1=[REDACTED]",
    );
};
