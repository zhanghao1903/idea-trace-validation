import type { Pool } from "pg";

import {
  MIGRATION_CATALOG,
  expectedMigrationRows,
  readMigration,
  type MigrationDefinition,
} from "./migrations.js";

const LEGACY_LEDGER = "schema_migrations";
const FEATURE_LEDGER = "schema_feature_migrations";

const migrationLedger = (definition: MigrationDefinition): string =>
  definition.ledger === "legacy" ? LEGACY_LEDGER : FEATURE_LEDGER;

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
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_feature_migrations (
        id varchar(128) PRIMARY KEY,
        checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    for (const definition of MIGRATION_CATALOG) {
      const { checksum, sql } = await readMigration(definition);
      const ledger = migrationLedger(definition);
      await client.query("BEGIN");
      try {
        if (definition.ledger === "feature") {
          const legacy = await client.query<{
            applied_at: Date;
            checksum: string;
          }>(
            `
              SELECT checksum, applied_at
              FROM schema_migrations
              WHERE id = $1
              FOR UPDATE
            `,
            [definition.id],
          );
          if (legacy.rowCount === 1) {
            if (legacy.rows[0]?.checksum !== checksum) {
              throw new Error("MIGRATION_CHECKSUM_MISMATCH");
            }
            await client.query(
              `
                INSERT INTO schema_feature_migrations (id, checksum, applied_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO NOTHING
              `,
              [definition.id, checksum, legacy.rows[0]?.applied_at],
            );
            const feature = await client.query<{ checksum: string }>(
              `
                SELECT checksum
                FROM schema_feature_migrations
                WHERE id = $1
                FOR UPDATE
              `,
              [definition.id],
            );
            if (feature.rows[0]?.checksum !== checksum) {
              throw new Error("MIGRATION_CHECKSUM_MISMATCH");
            }
            await client.query("DELETE FROM schema_migrations WHERE id = $1", [
              definition.id,
            ]);
          }
        }
        const existing = await client.query<{ checksum: string }>(
          `SELECT checksum FROM ${ledger} WHERE id = $1 FOR UPDATE`,
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
          `INSERT INTO ${ledger} (id, checksum) VALUES ($1, $2)`,
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
