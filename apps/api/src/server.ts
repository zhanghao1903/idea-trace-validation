import { createPool, PostgresIdeaService, PostgresReadiness } from "@idea/db";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { shutdownApplication } from "./shutdown.js";

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

const shutdown = (signal: NodeJS.Signals): Promise<void> =>
  shutdownApplication({
    app,
    pool,
    graceMs: config.shutdownGraceMs,
    signal,
  });

let shutdownStarted = false;
const onSignal = (signal: NodeJS.Signals): void => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  process.removeListener("SIGTERM", onSigterm);
  process.removeListener("SIGINT", onSigint);
  void shutdown(signal);
};
const onSigterm = (): void => onSignal("SIGTERM");
const onSigint = (): void => onSignal("SIGINT");

process.once("SIGTERM", onSigterm);
process.once("SIGINT", onSigint);

await app.listen({ host: config.host, port: config.port });
