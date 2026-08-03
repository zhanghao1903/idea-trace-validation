import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { JsonRecord } from "../shared/contracts.js";

const execute = promisify(execFile);
const semver = /(?:v)?(\d+)\.(\d+)\.(\d+)/u;

export const parseSemver = (
  output: string,
  code: string,
): [number, number, number] => {
  const match = semver.exec(output);
  if (match === null) throw new Error(code);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};
const inRange = (
  version: [number, number, number],
  minimum: [number, number, number],
  maximumMajor: number,
): boolean => {
  const [major, minor, patch] = version;
  const [minMajor, minMinor, minPatch] = minimum;
  return (
    major < maximumMajor &&
    (major > minMajor ||
      (major === minMajor &&
        (minor > minMinor || (minor === minMinor && patch >= minPatch))))
  );
};

export interface ToolchainOptions {
  platform?: NodeJS.Platform;
  run?: (command: string, args: readonly string[]) => Promise<string>;
  dockerInstallationSource?: "OFFICIAL_DOCKER_PACKAGE";
  ageInstallationSource?:
    "OS_VENDOR_PACKAGE" | "OFFICIAL_RELEASE_CHECKSUM_VERIFIED";
  now?: Date;
}

export const inspectToolchain = async (
  options: ToolchainOptions = {},
): Promise<JsonRecord> => {
  if ((options.platform ?? process.platform) !== "linux")
    throw new Error("TOOLCHAIN_UNSUPPORTED:HOST_OS");
  const run =
    options.run ??
    (async (command, args) =>
      (await execute(command, [...args], { timeout: 10_000 })).stdout);
  let dockerOutput: string;
  let composeOutput: string;
  let ageOutput: string;
  try {
    [dockerOutput, composeOutput, ageOutput] = await Promise.all([
      run("docker", ["version", "--format", "{{.Server.Version}}"]),
      run("docker", ["compose", "version", "--short"]),
      run("age", ["--version"]),
    ]);
  } catch {
    throw new Error("TOOLCHAIN_UNSUPPORTED:BINARY_OR_DAEMON");
  }
  const docker = parseSemver(
    dockerOutput,
    "TOOLCHAIN_UNSUPPORTED:DOCKER_PARSE",
  );
  const compose = parseSemver(
    composeOutput,
    "TOOLCHAIN_UNSUPPORTED:COMPOSE_PARSE",
  );
  const age = parseSemver(ageOutput, "TOOLCHAIN_UNSUPPORTED:AGE_PARSE");
  if (!inRange(docker, [27, 5, 0], 30))
    throw new Error("TOOLCHAIN_UNSUPPORTED:DOCKER_RANGE");
  if (!inRange(compose, [2, 32, 0], 3))
    throw new Error("TOOLCHAIN_UNSUPPORTED:COMPOSE_RANGE");
  if (!inRange(age, [1, 2, 0], 2))
    throw new Error("TOOLCHAIN_UNSUPPORTED:AGE_RANGE");
  if (
    options.dockerInstallationSource !== "OFFICIAL_DOCKER_PACKAGE" ||
    options.ageInstallationSource === undefined
  ) {
    throw new Error("TOOLCHAIN_UNSUPPORTED:INSTALLATION_SOURCE");
  }
  return {
    dockerEngineVersion: docker.join("."),
    composeVersion: compose.join("."),
    ageVersion: age.join("."),
    dockerInstallationSource: options.dockerInstallationSource,
    ageInstallationSource: options.ageInstallationSource,
    observedAt: (options.now ?? new Date()).toISOString(),
  };
};
