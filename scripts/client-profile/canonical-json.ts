import { createHash } from "node:crypto";

const compareCodePoints = (left: string, right: string): number => {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
};

const normalize = (value: unknown): unknown => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("CANONICAL_INTEGER_REQUIRED");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort(compareCodePoints)) {
      if (key.normalize("NFC") !== key || input[key] === undefined)
        throw new Error("CANONICAL_OBJECT_INVALID");
      output[key] = normalize(input[key]);
    }
    return output;
  }
  throw new Error("CANONICAL_VALUE_INVALID");
};

export const canonicalJson = (value: unknown): string =>
  `${JSON.stringify(normalize(value))}\n`;

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

export const canonicalSha256 = (value: unknown): string =>
  sha256(canonicalJson(value));
