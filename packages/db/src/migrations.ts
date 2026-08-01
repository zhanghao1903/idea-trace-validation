import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface MigrationDefinition {
  id: string;
  ledger: MigrationLedger;
  url: URL;
}

export type MigrationLedger = "legacy" | "feature";

export const MIGRATION_CATALOG: readonly MigrationDefinition[] = [
  {
    id: "0001_lp01_core",
    ledger: "legacy",
    url: new URL("../migrations/0001_lp01_core.sql", import.meta.url),
  },
  {
    id: "0002_lp02_execution_decisions",
    ledger: "legacy",
    url: new URL(
      "../migrations/0002_lp02_execution_decisions.sql",
      import.meta.url,
    ),
  },
  {
    id: "0003_lp03_reporting_experience",
    ledger: "feature",
    url: new URL(
      "../migrations/0003_lp03_reporting_experience.sql",
      import.meta.url,
    ),
  },
];

export const readMigration = async (
  definition: MigrationDefinition,
): Promise<{ checksum: string; sql: string }> => {
  const sql = await readFile(definition.url, "utf8");
  return {
    sql,
    checksum: createHash("sha256").update(sql).digest("hex"),
  };
};

export const expectedMigrationRows = async (
  ledger?: MigrationLedger,
): Promise<{ id: string; checksum: string }[]> =>
  Promise.all(
    MIGRATION_CATALOG.filter(
      (definition) => ledger === undefined || definition.ledger === ledger,
    ).map(async (definition) => ({
      id: definition.id,
      checksum: (await readMigration(definition)).checksum,
    })),
  );
