import { lstat, readFile } from "node:fs/promises";
import { execve } from "node:process";

const maximumSecretBytes = 4096;
const secretRoot = "/run/secrets";

const readSecret = async (name) => {
  if (!/^[a-z][a-z0-9_]{1,63}$/u.test(name))
    throw new Error("SECRET_NAME_INVALID");
  const path = `${secretRoot}/${name}`;
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > maximumSecretBytes
  ) {
    throw new Error(`SECRET_FILE_INVALID:${name}`);
  }
  const value = (await readFile(path, "utf8")).trim();
  if (value.length === 0 || Buffer.byteLength(value) > maximumSecretBytes) {
    throw new Error(`SECRET_VALUE_INVALID:${name}`);
  }
  return value;
};

const [postgresPassword, aiApiToken, humanControlToken] = await Promise.all([
  readSecret("postgres_password"),
  readSecret("ai_api_token"),
  readSecret("human_control_token"),
]);
if (aiApiToken === humanControlToken)
  throw new Error("SECRET_VALUES_MUST_DIFFER");

const databaseUser = process.env.POSTGRES_USER ?? "idea_validation";
const databaseName = process.env.POSTGRES_DB ?? "idea_validation";
if (
  !/^[a-z][a-z0-9_]{0,62}$/u.test(databaseUser) ||
  !/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)
) {
  throw new Error("DATABASE_NAME_INVALID");
}
const databaseUrl = `postgres://${encodeURIComponent(databaseUser)}:${encodeURIComponent(postgresPassword)}@postgres:5432/${encodeURIComponent(databaseName)}`;
const release = JSON.parse(await readFile("/app/release.json", "utf8"));
process.stdout.write(
  JSON.stringify({
    event: "lp05.runtime.start",
    releaseId: release.releaseId,
    sourceCommit: release.sourceCommit,
    node: process.version,
    platform: process.platform,
  }) + "\n",
);

const command = process.argv[2] ?? "/app/apps/api/dist/server.js";
const args = [process.execPath, command, ...process.argv.slice(3)];
execve(process.execPath, args, {
  ...process.env,
  AI_API_TOKEN: aiApiToken,
  DATABASE_URL: databaseUrl,
  HUMAN_CONTROL_TOKEN: humanControlToken,
});
