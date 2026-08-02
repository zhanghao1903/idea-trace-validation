import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { verifyCandidateFiles } from "./candidate/verify.js";
import { verifySecurityHeaders } from "./smoke/security.js";
import type { HttpObservation } from "./smoke/http.js";
import type { JsonRecord } from "./shared/contracts.js";

const execute = promisify(execFile);

const command = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> =>
  (
    await execute("docker", [...args], {
      cwd: process.cwd(),
      env: environment,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  ).stdout;

const observeLocalTls = (path: string): Promise<HttpObservation> =>
  new Promise((resolve, reject) => {
    const operation = request(
      new URL(path, "https://localhost:18443"),
      { method: "GET", rejectUnauthorized: false, timeout: 10_000 },
      (response) => {
        response.resume();
        response.once("end", () => {
          const headers = Object.fromEntries(
            Object.entries(response.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(", ") : String(value ?? ""),
            ]),
          );
          resolve({
            status: response.statusCode ?? 0,
            headers,
            requestId: headers["x-request-id"] ?? null,
          });
        });
      },
    );
    operation.once("error", reject);
    operation.end();
  });

export const runLocalAcceptance = async (
  manifestPath: string,
): Promise<void> => {
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as JsonRecord;
  const sourceCommit = String(parsed.sourceCommit);
  const manifest = await verifyCandidateFiles(manifestPath, {
    phase: "PRE_MERGE",
    reviewedHead: sourceCommit,
  });
  const archive = manifest.ociArchive as JsonRecord;
  const archivePath = join(dirname(manifestPath), String(archive.basename));
  const expectedImageId = String(manifest.imageId);
  const imageName = String(manifest.imageName);
  let loadedImageId = (
    await command(
      ["image", "inspect", "--format", "{{.Id}}", imageName],
      process.env,
    ).catch(() => "")
  ).trim();
  if (loadedImageId === "") {
    await command(["image", "load", "--input", archivePath], process.env);
    loadedImageId = (
      await command(
        ["image", "inspect", "--format", "{{.Id}}", imageName],
        process.env,
      )
    ).trim();
  }
  if (loadedImageId !== expectedImageId)
    throw new Error("LOCAL_LOADED_IMAGE_ID_MISMATCH");

  const temporary = await mkdtemp(join(tmpdir(), "lp05-local-"));
  const secretsRoot = join(temporary, "secrets");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(secretsRoot, { mode: 0o700 });
  const aiToken = "lp05-local-ai-token-0000000000000001";
  const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await Promise.all([
    writeFile(
      join(secretsRoot, "postgres_password"),
      "lp05-local-postgres-password-000001",
      { mode: 0o644 },
    ),
    writeFile(join(secretsRoot, "ai_api_token"), aiToken, { mode: 0o644 }),
    writeFile(join(secretsRoot, "human_control_token"), humanToken, {
      mode: 0o644,
    }),
  ]);
  const project = `lp05-local-${process.pid}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ACME_EMAIL: "operator@example.invalid",
    APP_IMAGE: String(manifest.imageName),
    APP_IMAGE_ID: String(manifest.imageId),
    APP_PLATFORM: String(manifest.platform),
    BACKUP_ROOT: join(temporary, "backups"),
    COMPOSE_PROJECT_NAME: project,
    DEPLOY_DOMAIN: "demo.invalid",
    DEPLOY_ROOT: join(temporary, "deploy"),
    POSTGRES_DB: "idea_validation",
    POSTGRES_USER: "idea_validation",
    RELEASE_ID: String(manifest.releaseId),
    SECRETS_ROOT: secretsRoot,
    SOURCE_COMMIT: sourceCommit,
    SOURCE_TREE: String(manifest.sourceTree),
  };
  const compose = [
    "compose",
    "-p",
    project,
    "-f",
    "deploy/compose.production.yaml",
    "-f",
    "deploy/compose.test.yaml",
  ];
  const redactDiagnostics = (value: string): string =>
    [aiToken, humanToken, "lp05-local-postgres-password-000001"].reduce(
      (current, secret) => current.split(secret).join("[REDACTED]"),
      value,
    );
  try {
    const rendered = await command([...compose, "config"], environment);
    for (const secret of [
      aiToken,
      humanToken,
      "lp05-local-postgres-password-000001",
    ]) {
      if (rendered.includes(secret))
        throw new Error("LOCAL_COMPOSE_SECRET_EXPOSED");
    }
    await command(
      [...compose, "up", "--detach", "--wait", "--wait-timeout", "120"],
      environment,
    );
    const [appId, databaseId, caddyId] = await Promise.all(
      ["app", "postgres", "caddy"].map(async (service) =>
        (
          await command([...compose, "ps", "--quiet", service], environment)
        ).trim(),
      ),
    );
    if ([appId, databaseId, caddyId].some((id) => id === ""))
      throw new Error("LOCAL_CONTAINER_ID_MISSING");
    const [appInspect, databaseInspect, caddyInspect] = await Promise.all(
      [appId, databaseId, caddyId].map(
        async (id) =>
          JSON.parse(
            await command(["inspect", id], environment),
          ) as JsonRecord[],
      ),
    );
    const app = appInspect[0] as JsonRecord;
    const database = databaseInspect[0] as JsonRecord;
    const caddy = caddyInspect[0] as JsonRecord;
    if (
      (app.Config as JsonRecord).User !== "10001:10001" ||
      (app.HostConfig as JsonRecord).ReadonlyRootfs !== true
    )
      throw new Error("LOCAL_APP_HARDENING");
    if (
      Object.keys(
        ((app.HostConfig as JsonRecord).PortBindings ?? {}) as JsonRecord,
      ).length !== 0 ||
      Object.keys(
        ((database.HostConfig as JsonRecord).PortBindings ?? {}) as JsonRecord,
      ).length !== 0
    )
      throw new Error("LOCAL_INTERNAL_PORT_EXPOSED");
    const caddyBindings = (caddy.HostConfig as JsonRecord)
      .PortBindings as JsonRecord;
    if (
      Object.keys(caddyBindings).sort().join(",") !== "8080/tcp,8443/tcp" ||
      Object.values(caddyBindings)
        .flatMap((value) => value as JsonRecord[])
        .some((binding) => binding.HostIp !== "127.0.0.1")
    )
      throw new Error("LOCAL_CADDY_PORTS");
    const readiness = await observeLocalTls("/health/ready");
    if (readiness.status !== 200) throw new Error("LOCAL_READINESS_FAILED");
    verifySecurityHeaders(readiness, true);
    const openapi = await observeLocalTls("/openapi.json");
    if (openapi.status !== 200) throw new Error("LOCAL_OPENAPI_FAILED");
  } catch (error) {
    const diagnostics = await Promise.all([
      command([...compose, "ps", "--all"], environment).catch(
        () => "LOCAL_PS_UNAVAILABLE",
      ),
      command(
        [
          ...compose,
          "logs",
          "--no-color",
          "--tail",
          "80",
          "migrate",
          "app",
          "caddy",
        ],
        environment,
      ).catch(() => "LOCAL_LOGS_UNAVAILABLE"),
    ]);
    const message = error instanceof Error ? error.message : "LOCAL_FAILURE";
    throw new Error(
      `LOCAL_TOPOLOGY_FAILED:${message}\n${redactDiagnostics(diagnostics.join("\n")).slice(-12_000)}`,
    );
  } finally {
    await command(
      [...compose, "down", "--volumes", "--remove-orphans", "--timeout", "10"],
      environment,
    ).catch(() => undefined);
    await rm(temporary, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--manifest");
  const manifest = index >= 0 ? process.argv[index + 1] : undefined;
  if (manifest === undefined)
    throw new Error("LOCAL_CANDIDATE_MANIFEST_REQUIRED");
  await runLocalAcceptance(manifest);
  process.stdout.write("LP05_LOCAL_ACCEPTANCE_PASS\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "LOCAL_ACCEPTANCE_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
