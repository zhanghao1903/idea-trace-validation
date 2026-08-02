import { canonicalSha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";

export const createDatabaseIdentity = (
  fields: Omit<JsonRecord, "databaseInstanceSha256">,
): JsonRecord => {
  const identity: JsonRecord = { ...fields, databaseInstanceSha256: "" };
  identity.databaseInstanceSha256 = canonicalSha256(identity, [
    "databaseInstanceSha256",
  ]);
  return identity;
};

export const createProductionResourceIdentity = (
  input: JsonRecord,
): JsonRecord => {
  const required = [
    "targetId",
    "composeProject",
    "database",
    "app",
    "caddy",
    "releaseMarkerSha256",
  ];
  if (Object.keys(input).sort().join("\0") !== required.sort().join("\0"))
    throw new Error("PRODUCTION_IDENTITY_FIELDS");
  return structuredClone(input);
};

export const verifyProductionUnchanged = (
  before: JsonRecord,
  after: JsonRecord,
): string => {
  const beforeSha = canonicalSha256(before);
  if (beforeSha !== canonicalSha256(after))
    throw new Error("PRODUCTION_RESOURCES_CHANGED");
  return beforeSha;
};
