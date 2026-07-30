import { createPool, PostgresIdeaService, PostgresReadiness } from "@idea/db";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
const pool = createPool({
  databaseUrl: config.databaseUrl,
  max: config.dbPoolMax,
  connectTimeoutMs: config.dbConnectTimeoutMs,
});
const readiness = new PostgresReadiness(pool);
const app = await buildApp({
  config,
  service: new PostgresIdeaService(pool),
  readiness,
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "shutdown requested");
  const timeout = setTimeout(() => {
    app.log.error("shutdown grace period exceeded");
    process.exitCode = 1;
  }, config.shutdownGraceMs);
  timeout.unref();
  await app.close();
  await pool.end();
  clearTimeout(timeout);
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
