import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { rotateCredentials } from "./rotate-credentials.js";
import { record, type JsonRecord } from "../shared/contracts.js";

const execute = promisify(execFile);
const required = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "")
    throw new Error(`ROTATION_ENV_REQUIRED:${key}`);
  return value.trim();
};

const probe = async (
  origin: string,
  request: JsonRecord,
  token: string,
): Promise<Response> =>
  fetch(new URL(String(request.path), origin), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": String(request.idempotencyKey),
    },
    body: JSON.stringify(request.body),
  });

const main = async (): Promise<void> => {
  const origin = required("ROTATION_ORIGIN");
  const replay = record(
    JSON.parse(await readFile(required("ROTATION_AI_REPLAY_FILE"), "utf8")),
    "ROTATION_REPLAY",
  );
  const nextAi = (
    await readFile(required("NEXT_AI_TOKEN_FILE"), "utf8")
  ).trim();
  const nextHuman = (
    await readFile(required("NEXT_HUMAN_TOKEN_FILE"), "utf8")
  ).trim();
  await rotateCredentials({
    secretsRoot: required("SECRETS_ROOT"),
    nextAi,
    nextHuman,
    adapter: {
      restartApp: async () => {
        const { stdout } = await execute(
          "docker",
          [
            "ps",
            "--filter",
            `label=com.docker.compose.project=${required("COMPOSE_PROJECT_NAME")}`,
            "--filter",
            "label=com.docker.compose.service=app",
            "--format",
            "{{.ID}}",
          ],
          {
            cwd: process.cwd(),
            env: { PATH: process.env.PATH },
            timeout: 60_000,
          },
        );
        const ids = stdout.split(/\r?\n/u).filter((value) => value !== "");
        if (ids.length !== 1 || ids[0] === undefined)
          throw new Error("ROTATION_APP_CONTAINER_COUNT");
        await execute("docker", ["restart", "--time", "15", ids[0]], {
          cwd: process.cwd(),
          env: { PATH: process.env.PATH },
          timeout: 60_000,
        });
      },
      verifyAiCredential: async (value, expected) => {
        const response = await probe(origin, replay, value);
        if (expected === "REJECT" && response.status !== 401)
          throw new Error("ROTATION_OLD_AI_STILL_AUTHORIZED");
        if (expected === "ACCEPT") {
          if (!response.ok) throw new Error("ROTATION_NEW_AI_REJECTED");
          const body = record(await response.json(), "ROTATION_AI_RESPONSE");
          const meta = record(body.meta, "ROTATION_AI_META");
          if (meta.idempotentReplay !== true)
            throw new Error("ROTATION_AI_NOT_REPLAY");
        }
      },
      verifyHumanCredential: async (value, expected) => {
        const response = await fetch(
          new URL("/api/v1/human-confirmations/lp05-rotation-probe", origin),
          {
            headers: { "x-human-control-token": value },
          },
        );
        if (expected === "REJECT" && response.status !== 401)
          throw new Error("ROTATION_OLD_HUMAN_STILL_AUTHORIZED");
        if (expected === "ACCEPT" && response.status !== 404)
          throw new Error("ROTATION_NEW_HUMAN_REJECTED");
      },
    },
  });
  process.stdout.write("LP05_CREDENTIAL_ROTATION_PASS\n");
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "ROTATION_FAILED"}\n`,
  );
  process.exitCode = 1;
});
