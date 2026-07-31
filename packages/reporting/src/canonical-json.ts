import { createHash } from "node:crypto";

const canonicalizeValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON requires finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeValue(entry)]),
    );
  }
  throw new TypeError("Canonical JSON contains an unsupported value.");
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalizeValue(value));

export const reportContentDigest = (
  document: Readonly<Record<string, unknown>>,
): string => {
  const businessIntent = Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== "clientRequestId"),
  );
  return createHash("sha256")
    .update(canonicalJson(businessIntent))
    .digest("hex");
};
