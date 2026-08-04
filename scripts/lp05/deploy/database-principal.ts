import { canonicalJson } from "../shared/canonical-json.js";
import { exactKeys, record } from "../shared/contracts.js";

export interface ProductionDatabasePrincipal {
  databaseUser: string;
  databaseName: string;
}

const safeDatabaseName = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,62}$/u.test(value))
    throw new Error(code);
  return value;
};

export const parseProductionDatabasePrincipal = (
  value: unknown,
): ProductionDatabasePrincipal => {
  const input = record(value, "PRODUCTION_DATABASE_PRINCIPAL");
  exactKeys(
    input,
    ["databaseUser", "databaseName"],
    "PRODUCTION_DATABASE_PRINCIPAL",
  );
  return {
    databaseUser: safeDatabaseName(
      input.databaseUser,
      "PRODUCTION_DATABASE_USER_INVALID",
    ),
    databaseName: safeDatabaseName(
      input.databaseName,
      "PRODUCTION_DATABASE_NAME_INVALID",
    ),
  };
};

export const assertProductionDatabasePrincipal = (
  expectedValue: unknown,
  actualValue: unknown,
): ProductionDatabasePrincipal => {
  const expected = parseProductionDatabasePrincipal(expectedValue);
  const actual = parseProductionDatabasePrincipal(actualValue);
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new Error("DEPLOYMENT_DATABASE_PRINCIPAL_CHANGED");
  return expected;
};
