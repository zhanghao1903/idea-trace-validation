import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { canonicalSha256 } from "../shared/canonical-json.js";
import {
  parseIsolatedRestoreTarget,
  record,
  type JsonRecord,
} from "../shared/contracts.js";

const execute = promisify(execFile);

const run = async (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> =>
  (
    await execute(command, [...args], {
      env: environment,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();

const exactOne = (value: string, code: string): string => {
  const lines = value.split(/\r?\n/u).filter((line) => line !== "");
  if (lines.length !== 1 || lines[0] === undefined) throw new Error(code);
  return lines[0];
};

export const inspectLiveIsolatedTarget = async (
  declared: JsonRecord,
  credentials: { user: string; password: string; path?: string },
): Promise<JsonRecord> => {
  const target = parseIsolatedRestoreTarget(declared);
  const project = String(target.composeProject);
  const baseEnvironment: NodeJS.ProcessEnv = { PATH: credentials.path };
  const containerId = exactOne(
    await run(
      "docker",
      [
        "ps",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--filter",
        "label=com.docker.compose.service=postgres",
        "--format",
        "{{.ID}}",
      ],
      baseEnvironment,
    ),
    "RESTORE_LIVE_CONTAINER_COUNT",
  );
  const container = record(
    (
      JSON.parse(
        await run("docker", ["inspect", containerId], baseEnvironment),
      ) as unknown[]
    )[0],
    "RESTORE_LIVE_CONTAINER",
  );
  const config = record(container.Config, "RESTORE_LIVE_CONTAINER_CONFIG");
  const labels = record(config.Labels, "RESTORE_LIVE_CONTAINER_LABELS");
  if (
    labels["com.docker.compose.project"] !== project ||
    labels["com.docker.compose.service"] !== "postgres"
  )
    throw new Error("RESTORE_LIVE_CONTAINER_LABELS");
  const mounts = container.Mounts;
  if (!Array.isArray(mounts)) throw new Error("RESTORE_LIVE_MOUNTS");
  const volumeNames = mounts
    .map((entry) => record(entry, "RESTORE_LIVE_MOUNT"))
    .filter((entry) => entry.Type === "volume")
    .map((entry) => String(entry.Name));
  const volumeName = exactOne(
    volumeNames.join("\n"),
    "RESTORE_LIVE_VOLUME_COUNT",
  );
  const volume = record(
    (
      JSON.parse(
        await run("docker", ["volume", "inspect", volumeName], baseEnvironment),
      ) as unknown[]
    )[0],
    "RESTORE_LIVE_VOLUME",
  );
  const volumeLabels = record(volume.Labels, "RESTORE_LIVE_VOLUME_LABELS");
  if (volumeLabels["com.docker.compose.project"] !== project)
    throw new Error("RESTORE_LIVE_VOLUME_LABELS");
  const databaseEnvironment: NodeJS.ProcessEnv = {
    PATH: credentials.path,
    PGHOST: String(target.databaseHost),
    PGPORT: String(target.databasePort),
    PGDATABASE: String(target.databaseName),
    PGUSER: credentials.user,
    PGPASSWORD: credentials.password,
  };
  const systemIdentifier = exactOne(
    await run(
      "psql",
      [
        "--no-psqlrc",
        "--tuples-only",
        "--no-align",
        "--command",
        "SELECT system_identifier FROM pg_control_system()",
      ],
      databaseEnvironment,
    ),
    "RESTORE_LIVE_SYSTEM_IDENTIFIER",
  );
  return {
    ...target,
    systemIdentifier,
    containerLabelSha256: canonicalSha256(labels),
    volumeLabelSha256: canonicalSha256(volumeLabels),
  };
};
