import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface MigrationDefinition {
  id: string;
  url: URL;
}

export const MIGRATION_CATALOG: readonly MigrationDefinition[] = [
  {
    id: "0001_lp01_core",
    url: new URL("../migrations/0001_lp01_core.sql", import.meta.url),
  },
  {
    id: "0002_lp02_execution_decisions",
    url: new URL(
      "../migrations/0002_lp02_execution_decisions.sql",
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

export const expectedMigrationRows = async (): Promise<
  { id: string; checksum: string }[]
> =>
  Promise.all(
    MIGRATION_CATALOG.map(async (definition) => ({
      id: definition.id,
      checksum: (await readMigration(definition)).checksum,
    })),
  );
