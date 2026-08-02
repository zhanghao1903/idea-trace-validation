import { execFile } from "node:child_process";
import { promises as dns } from "node:dns";
import { readFile } from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { promisify } from "node:util";

import { DemoScenarioRunner } from "../../lp04/scenario.js";
import { runRecordPath } from "../../lp04/run-record.js";
import { sha256 } from "../shared/canonical-json.js";
import { record, type JsonRecord } from "../shared/contracts.js";
import type { PublishedPort } from "./network.js";

const execute = promisify(execFile);

export interface ActiveHttpObservation {
  status: number;
  headers: Record<string, string>;
  requestId: string | null;
  body: string;
}

export interface ExternalSmokeAdapter {
  certificate(origin: string): Promise<JsonRecord>;
  resolveIps(hostname: string): Promise<string[]>;
  publishedPorts(composeProject: string): Promise<PublishedPort[]>;
  observe(url: string, init?: RequestInit): Promise<ActiveHttpObservation>;
  runJourney(input: {
    origin: string;
    proofRoot: string;
    runId: string;
    skillCommitSha: string;
  }): Promise<JsonRecord>;
  candidateIdentity(input: {
    composeProject: string;
    imageId: string;
  }): Promise<string>;
  secretAbsence(composeProject: string): Promise<string>;
  operationsHealthy(composeProject: string): Promise<string>;
}

const command = async (args: readonly string[]): Promise<string> =>
  (
    await execute("docker", [...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  ).stdout;

const logsFor = async (containerId: string): Promise<string> => {
  const result = await execute(
    "docker",
    ["logs", "--tail", "500", containerId],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  return `${result.stdout}\n${result.stderr}`;
};

const containerIds = async (project: string): Promise<string[]> =>
  (
    await command([
      "ps",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--format",
      "{{.ID}}",
    ])
  )
    .trim()
    .split(/\r?\n/u)
    .filter((value) => value !== "");

const inspectContainers = async (project: string): Promise<JsonRecord[]> => {
  const ids = await containerIds(project);
  if (ids.length === 0) throw new Error("SMOKE_RUNTIME_CONTAINERS_MISSING");
  return (JSON.parse(await command(["inspect", ...ids])) as unknown[]).map(
    (value) => record(value, "SMOKE_RUNTIME_CONTAINER"),
  );
};

const serviceName = (container: JsonRecord): string => {
  const config = record(container.Config, "SMOKE_RUNTIME_CONFIG");
  const labels = record(config.Labels, "SMOKE_RUNTIME_LABELS");
  return String(labels["com.docker.compose.service"] ?? "");
};

const observe = async (
  url: string,
  init: RequestInit = {},
): Promise<ActiveHttpObservation> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await response.text();
    if (Buffer.byteLength(body) > 2 * 1024 * 1024)
      throw new Error("SMOKE_RESPONSE_TOO_LARGE");
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      requestId: response.headers.get("x-request-id"),
      body,
    };
  } finally {
    clearTimeout(timer);
  }
};

const certificate = (origin: string): Promise<JsonRecord> => {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: url.hostname,
        port: Number(url.port || "443"),
        servername: url.hostname,
        rejectUnauthorized: true,
        timeout: 10_000,
      },
      () => {
        try {
          const peer = socket.getPeerCertificate(true);
          const identityError = tls.checkServerIdentity(url.hostname, peer);
          if (
            !socket.authorized ||
            identityError !== undefined ||
            peer.raw === undefined
          )
            throw identityError ?? new Error("SMOKE_CERTIFICATE_UNTRUSTED");
          const issuerRaw = peer.issuerCertificate?.raw ?? peer.raw;
          resolve({
            hostname: url.hostname,
            notBefore: new Date(peer.valid_from).toISOString(),
            notAfter: new Date(peer.valid_to).toISOString(),
            issuerSha256: sha256(issuerRaw),
            trusted: true,
          });
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      },
    );
    socket.once("timeout", () =>
      socket.destroy(new Error("SMOKE_TLS_TIMEOUT")),
    );
    socket.once("error", reject);
  });
};

export const createDefaultExternalSmokeAdapter = (): ExternalSmokeAdapter => ({
  certificate,
  resolveIps: async (hostname) => {
    const [v4, v6] = await Promise.all([
      dns.resolve4(hostname).catch(() => []),
      dns.resolve6(hostname).catch(() => []),
    ]);
    const addresses = [...new Set([...v4, ...v6])].sort();
    if (addresses.length === 0) throw new Error("SMOKE_DNS_EMPTY");
    return addresses;
  },
  publishedPorts: async (composeProject) => {
    const containers = await inspectContainers(composeProject);
    const result: PublishedPort[] = [];
    for (const container of containers) {
      const network = record(
        container.NetworkSettings,
        "SMOKE_RUNTIME_NETWORK",
      );
      const ports = record(network.Ports ?? {}, "SMOKE_RUNTIME_PORTS");
      for (const [targetValue, bindings] of Object.entries(ports)) {
        if (!Array.isArray(bindings)) continue;
        const target = Number(targetValue.split("/")[0]);
        for (const bindingValue of bindings) {
          const binding = record(bindingValue, "SMOKE_RUNTIME_PORT_BINDING");
          result.push({
            service: serviceName(container),
            hostIp: String(binding.HostIp),
            published: Number(binding.HostPort),
            target,
          });
        }
      }
    }
    return result;
  },
  observe,
  runJourney: async (input) => {
    const token = process.env.AI_API_TOKEN;
    if (token === undefined || token.length < 32)
      throw new Error("SMOKE_AI_API_TOKEN_REQUIRED");
    const runner = await DemoScenarioRunner.create({
      repoRoot: process.cwd(),
      proofRoot: input.proofRoot,
      baseOrigin: new URL(input.origin).origin,
      runId: input.runId,
      skillCommitSha: input.skillCommitSha,
      aiToken: token,
    });
    await runner.run();
    return record(
      JSON.parse(
        await readFile(runRecordPath(input.proofRoot, input.runId), "utf8"),
      ),
      "SMOKE_JOURNEY_RECORD",
    );
  },
  candidateIdentity: async ({ composeProject, imageId }) => {
    const containers = await inspectContainers(composeProject);
    const app = containers.find(
      (container) => serviceName(container) === "app",
    );
    if (app === undefined || app.Image !== imageId)
      throw new Error("SMOKE_CANDIDATE_IDENTITY");
    return sha256(String(app.Id));
  },
  secretAbsence: async (composeProject) => {
    const ids = await containerIds(composeProject);
    const logs = (await Promise.all(ids.map((id) => logsFor(id)))).join("\n");
    const secretValues = [
      process.env.AI_API_TOKEN,
      process.env.HUMAN_CONTROL_TOKEN,
      process.env.POSTGRES_PASSWORD,
    ].filter((value): value is string => value !== undefined && value !== "");
    if (
      secretValues.some((secret) => logs.includes(secret)) ||
      /(?:authorization|cookie|database_url)\s*[=:]\s*[^\s]+/iu.test(logs)
    )
      throw new Error("SMOKE_SECRET_EXPOSED");
    return sha256(logs);
  },
  operationsHealthy: async (composeProject) => {
    const containers = await inspectContainers(composeProject);
    for (const container of containers) {
      const state = record(container.State, "SMOKE_RUNTIME_STATE");
      const health =
        state.Health === undefined
          ? null
          : record(state.Health, "SMOKE_RUNTIME_HEALTH");
      if (
        state.Running !== true ||
        Number(container.RestartCount) > 0 ||
        (health !== null && health.Status !== "healthy")
      )
        throw new Error("SMOKE_OPERATIONS_UNHEALTHY");
    }
    return sha256(
      containers
        .map((container) => `${serviceName(container)}:${String(container.Id)}`)
        .sort()
        .join("\n"),
    );
  },
});

export const smokeProofRoot = (value: string): string => {
  const resolved = path.resolve(value);
  if (!path.isAbsolute(value) || resolved === "/")
    throw new Error("SMOKE_PROOF_ROOT_UNSAFE");
  return resolved;
};
