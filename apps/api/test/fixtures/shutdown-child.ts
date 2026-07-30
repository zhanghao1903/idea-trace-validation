import Fastify from "fastify";

import { shutdownApplication } from "../../src/shutdown.js";

const app = Fastify({ logger: false });

app.get("/hold", async () => {
  process.stdout.write("HOLDING\n");
  await new Promise<never>(() => undefined);
});
app.addHook("onClose", async () => {
  await new Promise<never>(() => undefined);
});

await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (address === null || typeof address === "string") {
  throw new Error("TEST_LISTENER_ADDRESS_UNAVAILABLE");
}
process.stdout.write(`READY ${address.port}\n`);

let shutdownStarted = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  process.removeListener("SIGTERM", onSigterm);
  process.removeListener("SIGINT", onSigint);
  process.stdout.write(`SIGNAL ${signal}\n`);
  void shutdownApplication({
    app,
    pool: { async end() {} },
    graceMs: 150,
    signal,
    forceExit(code) {
      process.stdout.write(`FORCE_EXIT ${code}\n`);
      process.exit(code);
    },
  });
};

const onSigterm = (): void => shutdown("SIGTERM");
const onSigint = (): void => shutdown("SIGINT");

process.once("SIGTERM", onSigterm);
process.once("SIGINT", onSigint);
