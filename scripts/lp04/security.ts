import { canonicalJson } from "./canonical-json.js";

const generalSecretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/u,
  /(?:authorization|cookie|password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/iu,
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/u,
  /AKIA[0-9A-Z]{16}/u,
];

export const assertSanitizedEvidence = (
  value: unknown,
  exactSecrets: readonly string[] = [],
  maximumBytes = 1_048_576,
): string => {
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized) > maximumBytes)
    throw new Error("EVIDENCE_TOO_LARGE");
  if (
    generalSecretPatterns.some((pattern) => pattern.test(serialized)) ||
    exactSecrets.some(
      (secret) => secret.length >= 8 && serialized.includes(secret),
    )
  )
    throw new Error("EVIDENCE_SECRET");
  return serialized;
};
