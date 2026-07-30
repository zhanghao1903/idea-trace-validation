import type { FastifyInstance } from "fastify";

interface CloseablePool {
  end(): Promise<void>;
}

interface ShutdownOptions {
  app: Pick<FastifyInstance, "close" | "log" | "server">;
  pool: CloseablePool;
  graceMs: number;
  signal: NodeJS.Signals;
  forceExit?: (code: number) => void;
}

type CloseOutcome =
  | { kind: "closed" }
  | { kind: "failed"; error: unknown }
  | { kind: "deadline" };

export const shutdownApplication = async ({
  app,
  pool,
  graceMs,
  signal,
  forceExit = (code) => process.exit(code),
}: ShutdownOptions): Promise<void> => {
  app.log.info({ signal }, "shutdown requested");

  let forced = false;
  const forceClose = (
    message: string,
    bindings: Readonly<Record<string, unknown>>,
  ): void => {
    if (forced) return;
    forced = true;
    app.log.error(bindings, message);
    try {
      app.server.closeAllConnections();
    } catch (error) {
      app.log.error({ err: error }, "failed to force-close connections");
    }
    void pool
      .end()
      .catch((error: unknown) =>
        app.log.error({ err: error }, "failed to close database pool"),
      );
    forceExit(1);
  };

  let deadline: NodeJS.Timeout | undefined;
  const deadlineOutcome = new Promise<CloseOutcome>((resolve) => {
    deadline = setTimeout(
      () => {
        forceClose("shutdown grace period exceeded", { graceMs });
        resolve({ kind: "deadline" });
      },
      Math.max(0, graceMs),
    );
  });
  const closeAttempt: Promise<CloseOutcome> = (async () => {
    try {
      await app.close();
      await pool.end();
      return { kind: "closed" };
    } catch (error) {
      return { kind: "failed", error };
    }
  })();
  const outcome = await Promise.race([closeAttempt, deadlineOutcome]);

  if (outcome.kind === "closed") {
    if (deadline !== undefined) clearTimeout(deadline);
    forceExit(0);
    return;
  }

  if (outcome.kind === "failed") {
    if (deadline !== undefined) clearTimeout(deadline);
    forceClose("graceful shutdown failed", { err: outcome.error });
  }
};
