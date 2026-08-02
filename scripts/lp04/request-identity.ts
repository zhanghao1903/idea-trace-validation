import { createHash } from "node:crypto";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const runIdPattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const stepIdPattern = /^[a-z][a-z0-9-]{1,47}$/u;

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const crockford130 = (digest: Uint8Array): string => {
  let bits = 0n;
  for (const byte of digest.subarray(0, 17)) bits = (bits << 8n) | BigInt(byte);
  bits >>= 6n;
  let encoded = "";
  for (let index = 0; index < 26; index += 1) {
    encoded = alphabet[Number(bits & 31n)] + encoded;
    bits >>= 5n;
  }
  return encoded;
};

export const deriveRequestId = (input: {
  runId: string;
  manifestSha256: string;
  stepId: string;
  semanticAttempt: number;
}): string => {
  if (!runIdPattern.test(input.runId)) throw new Error("RUN_ID_INVALID");
  if (!stepIdPattern.test(input.stepId)) throw new Error("STEP_ID_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(input.manifestSha256))
    throw new Error("MANIFEST_DIGEST_INVALID");
  if (!Number.isSafeInteger(input.semanticAttempt) || input.semanticAttempt < 0)
    throw new Error("SEMANTIC_ATTEMPT_INVALID");
  const digest = createHash("sha256")
    .update("lp04-request-id-v1\0")
    .update(input.runId)
    .update("\0")
    .update(input.manifestSha256)
    .update("\0")
    .update(input.stepId)
    .update("\0")
    .update(String(input.semanticAttempt))
    .digest();
  return `req_${crockford130(digest)}`;
};

export const validRunId = (value: string): boolean => runIdPattern.test(value);
export const validStepId = (value: string): boolean =>
  stepIdPattern.test(value);
