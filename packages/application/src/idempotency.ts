import { createHash } from "node:crypto";

export const IDEMPOTENCY_LOCK_TIMEOUT_MS = 2_000;
export const IDEMPOTENCY_RETRY_AFTER_MS = 250;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const requestDigest = (
  method: string,
  routeTemplate: string,
  pathIds: Readonly<Record<string, string>>,
  body: unknown,
): string =>
  createHash("sha256")
    .update(
      `${method.toUpperCase()}\n${routeTemplate}\n${canonicalJson(pathIds)}\n${canonicalJson(body)}`,
    )
    .digest("hex");
