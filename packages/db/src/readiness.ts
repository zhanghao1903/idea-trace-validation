import type { Readiness, ReadinessState } from "@idea/application";
import type { Pool, PoolClient } from "pg";

import { expectedMigrationRows } from "./migrations.js";

const PROBE_TIMEOUT_MS = 500;

export class PostgresReadiness implements Readiness {
  private state: ReadinessState = {
    status: "NOT_READY",
    reason: "DATABASE_UNREACHABLE",
    checkedAt: 0,
  };
  private inFlight: Promise<ReadinessState> | undefined;

  constructor(private readonly pool: Pool) {}

  async probe(): Promise<ReadinessState> {
    if (this.inFlight !== undefined) return this.inFlight;
    this.inFlight = this.runProbe();
    try {
      this.state = await this.inFlight;
      return this.state;
    } finally {
      this.inFlight = undefined;
    }
  }

  async current(maxAgeMs: number): Promise<ReadinessState> {
    if (Date.now() - this.state.checkedAt <= maxAgeMs) return this.state;
    return this.probe();
  }

  private async runProbe(): Promise<ReadinessState> {
    const checkedAt = Date.now();
    const client = await this.connectWithinTimeout();
    if (client === undefined) {
      return { status: "NOT_READY", reason: "DATABASE_UNREACHABLE", checkedAt };
    }
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${PROBE_TIMEOUT_MS}`);
      await client.query("SELECT 1");
      const migrations = await client
        .query<{ id: string; checksum: string }>(
          `
            SELECT id, checksum
            FROM schema_migrations
            ORDER BY applied_at, id
          `,
        )
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === "42P01") return undefined;
          throw error;
        });
      if (migrations === undefined) {
        await client.query("COMMIT");
        return { status: "NOT_READY", reason: "MIGRATION_MISSING", checkedAt };
      }
      const expected = await expectedMigrationRows();
      if (Number(migrations.rowCount) < expected.length) {
        await client.query("COMMIT");
        return { status: "NOT_READY", reason: "MIGRATION_MISSING", checkedAt };
      }
      if (
        migrations.rowCount !== expected.length ||
        migrations.rows.some(
          (row, index) =>
            row.id !== expected[index]?.id ||
            row.checksum !== expected[index]?.checksum,
        )
      ) {
        await client.query("COMMIT");
        return { status: "NOT_READY", reason: "MIGRATION_MISMATCH", checkedAt };
      }
      await client.query("COMMIT");
      return { status: "READY", checkedAt };
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
      return { status: "NOT_READY", reason: "DATABASE_UNREACHABLE", checkedAt };
    } finally {
      client.release();
    }
  }

  private async connectWithinTimeout(): Promise<PoolClient | undefined> {
    const pending = this.pool.connect();
    let timeout: NodeJS.Timeout | undefined;
    const timed = new Promise<undefined>((resolve) => {
      timeout = setTimeout(() => resolve(undefined), PROBE_TIMEOUT_MS);
    });
    const client = await Promise.race([pending.catch(() => undefined), timed]);
    if (timeout !== undefined) clearTimeout(timeout);
    if (client === undefined) {
      void pending.then(
        (lateClient) => lateClient.release(),
        () => undefined,
      );
    }
    return client;
  }
}
