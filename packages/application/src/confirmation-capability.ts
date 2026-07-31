import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ConfirmationPayloadSummary } from "@idea/contracts";

const PAYLOAD_DOMAIN =
  "idea-trace-validation\u0000lp02-confirmation-payload\u0000v1\u0000";
const CAPABILITY_DOMAIN =
  "idea-trace-validation\u0000lp02-confirmation-capability\u0000v1\u0000";

const normalize = (value: unknown): unknown => {
  if (typeof value === "string") return value.trim().normalize("NFC");
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
};

export const canonicalConfirmationJson = (value: unknown): string =>
  JSON.stringify(normalize(value));

export const confirmationPayloadDigest = (
  payload: ConfirmationPayloadSummary,
): string =>
  createHash("sha256")
    .update(PAYLOAD_DOMAIN, "utf8")
    .update(canonicalConfirmationJson(payload), "utf8")
    .digest("hex");

export const decodeHumanControlToken = (token: string): Buffer => {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
    throw new Error("INVALID_HUMAN_CONTROL_TOKEN");
  }
  const decoded = Buffer.from(token, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== token) {
    throw new Error("INVALID_HUMAN_CONTROL_TOKEN");
  }
  return decoded;
};

export const deriveConfirmationCapability = (input: {
  secret: string;
  confirmationId: string;
  payloadDigest: string;
  expiresAt: Date;
  idempotencyKey: string;
}): string =>
  createHmac("sha256", decodeHumanControlToken(input.secret))
    .update(CAPABILITY_DOMAIN, "utf8")
    .update(input.confirmationId, "utf8")
    .update("\u0000", "utf8")
    .update(input.payloadDigest, "utf8")
    .update("\u0000", "utf8")
    .update(input.expiresAt.toISOString(), "utf8")
    .update("\u0000", "utf8")
    .update(input.idempotencyKey, "utf8")
    .digest("base64url");

export const capabilityHash = (capability: string): string =>
  createHash("sha256").update(capability, "utf8").digest("hex");

export const secureHashEqual = (leftHex: string, rightHex: string): boolean => {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};
