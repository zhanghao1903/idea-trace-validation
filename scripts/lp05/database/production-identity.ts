import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  parseProductionResourceIdentity,
  type JsonRecord,
} from "../shared/contracts.js";

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
): JsonRecord => structuredClone(parseProductionResourceIdentity(input));

export const verifyProductionUnchanged = (
  before: JsonRecord,
  after: JsonRecord,
): string => {
  const beforeSha = canonicalSha256(before);
  if (beforeSha !== canonicalSha256(after))
    throw new Error("PRODUCTION_RESOURCES_CHANGED");
  return beforeSha;
};
