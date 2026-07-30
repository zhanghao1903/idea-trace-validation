import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

export const EXPECTED_MIGRATION_ID = "0001_lp01_core";
export const migrationUrl = new URL(
  "../migrations/0001_lp01_core.sql",
  import.meta.url,
);

export const migrationChecksum = async (): Promise<string> =>
  createHash("sha256")
    .update(await readFile(migrationUrl))
    .digest("hex");

export const migrate = async (
  pool: Pool,
): Promise<{ id: string; applied: boolean }> => {
  const sql = await readFile(migrationUrl, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id varchar(128) PRIMARY KEY,
        checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE id = $1 FOR UPDATE",
      [EXPECTED_MIGRATION_ID],
    );
    if (existing.rowCount === 1) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error("MIGRATION_CHECKSUM_MISMATCH");
      }
      await client.query("COMMIT");
      return { id: EXPECTED_MIGRATION_ID, applied: false };
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
      [EXPECTED_MIGRATION_ID, checksum],
    );
    await client.query("COMMIT");
    return { id: EXPECTED_MIGRATION_ID, applied: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
