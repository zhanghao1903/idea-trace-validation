import type { Pool } from "pg";

import {
  MIGRATION_CATALOG,
  expectedMigrationRows,
  readMigration,
} from "./migrations.js";

export const EXPECTED_MIGRATION_ID =
  MIGRATION_CATALOG.at(-1)?.id ?? "MISSING_MIGRATION";
export const migrationUrl =
  MIGRATION_CATALOG.at(-1)?.url ?? new URL(import.meta.url);
export const migrationChecksum = async (): Promise<string> =>
  (await expectedMigrationRows()).at(-1)?.checksum ?? "";

export const migrate = async (
  pool: Pool,
): Promise<{ id: string; applied: boolean }> => {
  const client = await pool.connect();
  let result = { id: EXPECTED_MIGRATION_ID, applied: false };
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id varchar(128) PRIMARY KEY,
        checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    for (const definition of MIGRATION_CATALOG) {
      const { checksum, sql } = await readMigration(definition);
      await client.query("BEGIN");
      try {
        const existing = await client.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE id = $1 FOR UPDATE",
          [definition.id],
        );
        if (existing.rowCount === 1) {
          if (existing.rows[0]?.checksum !== checksum) {
            throw new Error("MIGRATION_CHECKSUM_MISMATCH");
          }
          await client.query("COMMIT");
          result = { id: definition.id, applied: false };
          continue;
        }
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
          [definition.id, checksum],
        );
        await client.query("COMMIT");
        result = { id: definition.id, applied: true };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
    return result;
  } finally {
    client.release();
  }
};
