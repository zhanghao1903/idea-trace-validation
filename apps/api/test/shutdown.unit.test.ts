import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { shutdownApplication } from "../src/shutdown.js";

const fixture = fileURLToPath(
  new URL("./fixtures/shutdown-child.ts", import.meta.url),
);

const waitForOutput = async (
  child: ChildProcessWithoutNullStreams,
  output: { value: string },
  marker: string,
  timeoutMs = 2_000,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.stdout.off("data", check);
      reject(new Error(`Timed out waiting for ${marker}: ${output.value}`));
    }, timeoutMs);
    const check = (): void => {
      if (!output.value.includes(marker)) return;
      clearTimeout(timeout);
      child.stdout.off("data", check);
      resolve();
    };
    child.stdout.on("data", check);
    check();
  });

const listenerRejectsTraffic = async (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = request(
      { host: "127.0.0.1", port, path: "/health", method: "GET" },
      (response) => {
        response.resume();
        resolve(false);
      },
    );
    probe.setTimeout(300, () => probe.destroy(new Error("PROBE_TIMEOUT")));
    probe.once("error", () => resolve(true));
    probe.end();
  });

describe("finite shutdown grace", () => {
  it("closes the listener and pool before a successful zero exit", async () => {
    const app = Fastify({ logger: false });
    await app.ready();
    let poolClosed = false;
    const exitCodes: number[] = [];

    await shutdownApplication({
      app,
      pool: {
        async end() {
          poolClosed = true;
        },
      },
      graceMs: 1_000,
      signal: "SIGTERM",
      forceExit(code) {
        exitCodes.push(code);
      },
    });

    expect(poolClosed).toBe(true);
    expect(exitCodes).toEqual([0]);
  });

  it("stops accepting traffic and exits a child with a held request by the deadline", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", fixture], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    });
    const output = { value: "" };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output.value += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output.value += chunk;
    });

    try {
      await waitForOutput(child, output, "READY ");
      const port = Number(/READY (\d+)/u.exec(output.value)?.[1]);
      expect(Number.isInteger(port)).toBe(true);

      const held = request({
        host: "127.0.0.1",
        port,
        path: "/hold",
        method: "GET",
      });
      held.once("error", () => undefined);
      held.end();
      await waitForOutput(child, output, "HOLDING");

      const signalAt = Date.now();
      expect(child.kill("SIGTERM")).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await listenerRejectsTraffic(port)).toBe(true);

      const [code, signal] = (await Promise.race([
        once(child, "exit"),
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error(`Child did not exit: ${output.value}`)),
            2_000,
          ),
        ),
      ])) as [number | null, NodeJS.Signals | null];
      const elapsedMs = Date.now() - signalAt;
      expect({ code, signal }).toEqual({ code: 1, signal: null });
      expect(elapsedMs).toBeGreaterThanOrEqual(100);
      expect(elapsedMs).toBeLessThan(1_150);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
  });
});
