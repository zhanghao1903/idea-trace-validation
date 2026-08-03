import { execFile } from "node:child_process";
import tls from "node:tls";
import { promisify } from "node:util";

import { canonicalSha256, sha256 } from "../shared/canonical-json.js";
import {
  parseDatabaseIdentity,
  parseCandidateIdentity,
  parseDeploymentTarget,
  parseProductionResourceIdentity,
  record,
  type JsonRecord,
} from "../shared/contracts.js";
import { createDatabaseIdentity } from "./production-identity.js";

const execute = promisify(execFile);

export type ProductionRuntimeCommand = (
  args: readonly string[],
) => Promise<string>;

const docker: ProductionRuntimeCommand = async (args) =>
  (
    await execute("docker", [...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();

const exactOne = (value: string, code: string): string => {
  const values = value.split(/\r?\n/u).filter((entry) => entry !== "");
  if (values.length !== 1 || values[0] === undefined) throw new Error(code);
  return values[0];
};

const containerFor = async (
  runDocker: ProductionRuntimeCommand,
  project: string,
  service: string,
): Promise<JsonRecord> => {
  const id = exactOne(
    await runDocker([
      "ps",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
      "--format",
      "{{.ID}}",
    ]),
    `PRODUCTION_CONTAINER_COUNT:${service}`,
  );
  const value = (JSON.parse(await runDocker(["inspect", id])) as unknown[])[0];
  return record(value, `PRODUCTION_CONTAINER:${service}`);
};

const labelsFor = (container: JsonRecord, service: string): JsonRecord => {
  const config = record(container.Config, `PRODUCTION_CONFIG:${service}`);
  return record(config.Labels, `PRODUCTION_LABELS:${service}`);
};

export const inspectLiveProductionDatabaseIdentity = async (input: {
  target: unknown;
  databaseName: string;
  runDocker?: ProductionRuntimeCommand;
}): Promise<JsonRecord> => {
  const target = parseDeploymentTarget(input.target);
  const runDocker = input.runDocker ?? docker;
  const postgres = await containerFor(
    runDocker,
    String(target.composeProject),
    "postgres",
  );
  const labels = labelsFor(postgres, "postgres");
  if (labels["com.docker.compose.project"] !== target.composeProject)
    throw new Error("PRODUCTION_DATABASE_PROJECT_LABEL");
  const mounts = postgres.Mounts;
  if (!Array.isArray(mounts)) throw new Error("PRODUCTION_DATABASE_MOUNTS");
  const volumes = mounts
    .map((value) => record(value, "PRODUCTION_DATABASE_MOUNT"))
    .filter((value) => value.Type === "volume");
  if (volumes.length !== 1 || volumes[0] === undefined)
    throw new Error("PRODUCTION_DATABASE_VOLUME_COUNT");
  const volumeName = String(volumes[0].Name);
  const facts = exactOne(
    await runDocker([
      "exec",
      "--user",
      "postgres",
      String(postgres.Id),
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--field-separator",
      "|",
      "--dbname",
      input.databaseName,
      "--command",
      "SELECT system_identifier,current_database(),current_setting('server_version') FROM pg_control_system()",
    ]),
    "PRODUCTION_DATABASE_FACTS",
  ).split("|");
  if (facts.length !== 3 || facts[1] !== input.databaseName)
    throw new Error("PRODUCTION_DATABASE_FACTS");
  return parseDatabaseIdentity(
    createDatabaseIdentity({
      targetId: target.targetId,
      project: target.composeProject,
      containerId: String(postgres.Id),
      volumeName,
      volumeMountId: sha256(`${String(volumes[0].Destination)}:${volumeName}`),
      systemIdentifier: facts[0],
      databaseName: facts[1],
      postgresVersion: facts[2],
    }),
  );
};

const tlsLeafSha256 = (domain: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: true,
        timeout: 10_000,
      },
      () => {
        try {
          const peer = socket.getPeerCertificate(true);
          const identityError = tls.checkServerIdentity(domain, peer);
          if (!socket.authorized || identityError !== undefined || !peer.raw)
            throw identityError ?? new Error("PRODUCTION_TLS_UNTRUSTED");
          resolve(sha256(peer.raw));
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      },
    );
    socket.once("timeout", () =>
      socket.destroy(new Error("PRODUCTION_TLS_TIMEOUT")),
    );
    socket.once("error", reject);
  });

export const inspectLiveProductionIdentity = async (input: {
  target: unknown;
  candidate: unknown;
  databaseName: string;
  runDocker?: ProductionRuntimeCommand;
  fetchImpl?: typeof fetch;
  certificateSha256?: (domain: string) => Promise<string>;
}): Promise<JsonRecord> => {
  const target = parseDeploymentTarget(input.target);
  const candidate = parseCandidateIdentity(input.candidate);
  const runDocker = input.runDocker ?? docker;
  const fetchImpl = input.fetchImpl ?? fetch;
  const [postgres, app, caddy] = await Promise.all(
    ["postgres", "app", "caddy"].map((service) =>
      containerFor(runDocker, String(target.composeProject), service),
    ),
  );
  const postgresLabels = labelsFor(postgres, "postgres");
  const appLabels = labelsFor(app, "app");
  const caddyLabels = labelsFor(caddy, "caddy");
  const mounts = postgres.Mounts;
  if (!Array.isArray(mounts)) throw new Error("PRODUCTION_DATABASE_MOUNTS");
  const mount = mounts
    .map((value) => record(value, "PRODUCTION_DATABASE_MOUNT"))
    .filter((value) => value.Type === "volume");
  if (mount.length !== 1 || mount[0] === undefined)
    throw new Error("PRODUCTION_DATABASE_VOLUME_COUNT");
  const volumeName = String(mount[0].Name);
  const volume = record(
    (
      JSON.parse(
        await runDocker(["volume", "inspect", volumeName]),
      ) as unknown[]
    )[0],
    "PRODUCTION_DATABASE_VOLUME",
  );
  const volumeLabels = record(
    volume.Labels,
    "PRODUCTION_DATABASE_VOLUME_LABELS",
  );
  if (
    postgresLabels["com.docker.compose.project"] !== target.composeProject ||
    appLabels["com.docker.compose.project"] !== target.composeProject ||
    caddyLabels["com.docker.compose.project"] !== target.composeProject ||
    volumeLabels["com.docker.compose.project"] !== target.composeProject
  )
    throw new Error("PRODUCTION_PROJECT_LABEL_MISMATCH");
  const databaseFacts = exactOne(
    await runDocker([
      "exec",
      "--user",
      "postgres",
      String(postgres.Id),
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--field-separator",
      "|",
      "--dbname",
      input.databaseName,
      "--command",
      "SELECT system_identifier,current_database(),current_setting('server_version') FROM pg_control_system()",
    ]),
    "PRODUCTION_DATABASE_FACTS",
  ).split("|");
  if (databaseFacts.length !== 3 || databaseFacts[1] !== input.databaseName)
    throw new Error("PRODUCTION_DATABASE_FACTS");
  const database: JsonRecord = {
    containerId: String(postgres.Id),
    volumeName,
    volumeMountId: sha256(`${String(mount[0].Destination)}:${volumeName}`),
    systemIdentifier: databaseFacts[0],
    databaseName: databaseFacts[1],
    postgresVersion: databaseFacts[2],
    volumeLabelSha256: canonicalSha256(volumeLabels),
    containerLabelSha256: canonicalSha256(postgresLabels),
    databaseInstanceSha256: "",
  };
  database.databaseInstanceSha256 = canonicalSha256(database, [
    "databaseInstanceSha256",
  ]);
  const appConfig = record(app.Config, "PRODUCTION_APP_CONFIG");
  const caddyConfig = record(caddy.Config, "PRODUCTION_CADDY_CONFIG");
  if (app.Image !== candidate.imageId)
    throw new Error("PRODUCTION_APP_IMAGE_MISMATCH");
  const origin = `https://${String(target.domain)}/`;
  const marker = await fetchImpl(new URL("health/live", origin), {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (marker.status !== 200) throw new Error("PRODUCTION_RELEASE_MARKER");
  return parseProductionResourceIdentity({
    targetId: target.targetId,
    composeProject: target.composeProject,
    database,
    app: {
      containerId: String(app.Id),
      imageId: String(app.Image),
      configSha256: canonicalSha256(appConfig),
      containerLabelSha256: canonicalSha256(appLabels),
    },
    caddy: {
      containerId: String(caddy.Id),
      imageId: String(caddy.Image),
      configSha256: canonicalSha256(caddyConfig),
      containerLabelSha256: canonicalSha256(caddyLabels),
      certificateSha256: await (input.certificateSha256 ?? tlsLeafSha256)(
        String(target.domain),
      ),
    },
    releaseMarkerSha256: sha256(await marker.text()),
  });
};
