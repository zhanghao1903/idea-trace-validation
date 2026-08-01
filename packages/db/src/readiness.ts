import type { Readiness, ReadinessState } from "@idea/application";
import type { Pool, PoolClient } from "pg";

import { expectedMigrationRows, type MigrationLedger } from "./migrations.js";

const PROBE_TIMEOUT_MS = 500;
const LEDGER_TABLES: Readonly<Record<MigrationLedger, string>> = {
  legacy: "schema_migrations",
  feature: "schema_feature_migrations",
};

type MigrationRow = { id: string; checksum: string };

const migrationState = (
  actual: readonly MigrationRow[],
  expected: readonly MigrationRow[],
): "READY" | "MIGRATION_MISSING" | "MIGRATION_MISMATCH" => {
  if (actual.length < expected.length) return "MIGRATION_MISSING";
  if (
    actual.length !== expected.length ||
    actual.some(
      (row, index) =>
        row.id !== expected[index]?.id ||
        row.checksum !== expected[index]?.checksum,
    )
  ) {
    return "MIGRATION_MISMATCH";
  }
  return "READY";
};

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
      for (const ledger of ["legacy", "feature"] as const) {
        const migrations = await client
          .query<MigrationRow>(
            `
              SELECT id, checksum
              FROM ${LEDGER_TABLES[ledger]}
              ORDER BY applied_at, id
            `,
          )
          .catch((error: unknown) => {
            if ((error as { code?: string }).code === "42P01") return undefined;
            throw error;
          });
        if (migrations === undefined) {
          await client.query("COMMIT");
          return {
            status: "NOT_READY",
            reason: "MIGRATION_MISSING",
            checkedAt,
          };
        }
        const state = migrationState(
          migrations.rows,
          await expectedMigrationRows(ledger),
        );
        if (state !== "READY") {
          await client.query("COMMIT");
          return { status: "NOT_READY", reason: state, checkedAt };
        }
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
