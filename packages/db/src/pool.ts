import { Pool } from "pg";

export interface PoolConfig {
  databaseUrl: string;
  max: number;
  connectTimeoutMs: number;
}

export const createPool = (config: PoolConfig): Pool =>
  new Pool({
    connectionString: config.databaseUrl,
    max: config.max,
    connectionTimeoutMillis: config.connectTimeoutMs,
    application_name: "idea-validation-lp01",
  });
