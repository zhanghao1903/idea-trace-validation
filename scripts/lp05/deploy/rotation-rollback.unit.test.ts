import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDeploymentConfig } from "./config.js";
import { createHostRollbackAdapter } from "./host-rollback.js";
import { rollbackApplication } from "./rollback.js";
import { rotateCredentials } from "./rotate-credentials.js";
import { canonicalSha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("LP-05 credential rotation", () => {
  it("proves old credentials rejected and new credentials accepted", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-rotation-"));
    roots.push(root);
    const oldAi = "old-ai-token-000000000000000000000001";
    const oldHuman = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const nextAi = "new-ai-token-000000000000000000000001";
    const nextHuman = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
    await Promise.all([
      writeFile(join(root, "ai_api_token"), oldAi, { mode: 0o600 }),
      writeFile(join(root, "human_control_token"), oldHuman, { mode: 0o600 }),
    ]);
    const observations: string[] = [];
    await rotateCredentials({
      secretsRoot: root,
      nextAi,
      nextHuman,
      adapter: {
        restartApp: async () => {
          observations.push("restart");
        },
        verifyAiCredential: async (value, expected) => {
          observations.push(
            `ai:${value === nextAi ? "new" : "old"}:${expected}`,
          );
        },
        verifyHumanCredential: async (value, expected) => {
          observations.push(
            `human:${value === nextHuman ? "new" : "old"}:${expected}`,
          );
        },
      },
    });
    expect(observations).toEqual([
      "restart",
      "ai:old:REJECT",
      "ai:new:ACCEPT",
      "human:old:REJECT",
      "human:new:ACCEPT",
    ]);
    expect(await readFile(join(root, "ai_api_token"), "utf8")).toBe(nextAi);
    expect((await stat(join(root, "ai_api_token"))).mode & 0o777).toBe(0o644);
    expect((await stat(join(root, "human_control_token"))).mode & 0o777).toBe(
      0o644,
    );
  });

  it("restores both old files if proof fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "lp05-rotation-"));
    roots.push(root);
    const oldAi = "old-ai-token-000000000000000000000001";
    const oldHuman = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    await Promise.all([
      writeFile(join(root, "ai_api_token"), oldAi, { mode: 0o600 }),
      writeFile(join(root, "human_control_token"), oldHuman, { mode: 0o600 }),
    ]);
    await expect(
      rotateCredentials({
        secretsRoot: root,
        nextAi: "new-ai-token-000000000000000000000001",
        nextHuman: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        adapter: {
          restartApp: async () => undefined,
          verifyAiCredential: async () => {
            throw new Error("PROBE_FAIL");
          },
          verifyHumanCredential: async () => undefined,
        },
      }),
    ).rejects.toThrow("PROBE_FAIL");
    expect(await readFile(join(root, "ai_api_token"), "utf8")).toBe(oldAi);
    expect(await readFile(join(root, "human_control_token"), "utf8")).toBe(
      oldHuman,
    );
    expect((await stat(join(root, "ai_api_token"))).mode & 0o777).toBe(0o644);
    expect((await stat(join(root, "human_control_token"))).mode & 0o777).toBe(
      0o644,
    );
  });
});

describe("LP-05 application rollback", () => {
  it("disables ingress and does not restore a database on a fresh install", async () => {
    const calls: string[] = [];
    const evidence = await rollbackApplication({
      previousRelease: null,
      adapter: {
        disableIngress: async () => {
          calls.push("disable");
        },
        restorePreviousRelease: async () => {
          calls.push("restore");
        },
        verifyReadiness: async () => "a".repeat(64),
        verifyCoreReads: async () => "b".repeat(64),
      },
    });
    expect(calls).toEqual(["disable"]);
    expect(evidence.status).toBe("NOT_APPLICABLE");
    expect(evidence).not.toHaveProperty("databaseRestore");
  });

  it("recreates the exact previous app and proves readiness on an upgrade", async () => {
    const previousEnvironment: JsonRecord = {
      DEPLOY_DOMAIN: "demo.example.com",
      ACME_EMAIL: "operator@example.com",
      RELEASE_ID: "lp05-aaaaaaaaaaaa-amd64",
      SOURCE_COMMIT: "a".repeat(40),
      SOURCE_TREE: "b".repeat(40),
      APP_IMAGE_ID: `sha256:${"c".repeat(64)}`,
      APP_IMAGE: "idea-trace-validation:lp05-aaaaaaaaaaaa-amd64",
      APP_PLATFORM: "linux/amd64",
      POSTGRES_USER: "idea_validation",
      POSTGRES_DB: "idea_validation",
      DEPLOY_ROOT: "/srv/idea-validation",
      BACKUP_ROOT: "/srv/idea-validation-backups",
      SECRETS_ROOT: "/etc/idea-validation/secrets",
      COMPOSE_PROJECT_NAME: "idea-validation-prod",
    };
    const config = loadDeploymentConfig(
      previousEnvironment as Record<string, string>,
    );
    const previousRelease: JsonRecord = {
      releaseId: config.releaseId,
      sourceCommit: config.sourceCommit,
      imageId: config.appImageId,
      configSha256: canonicalSha256(config as unknown as JsonRecord),
    };
    const calls: string[] = [];
    let stopped = false;
    let restored = false;
    const adapter = createHostRollbackAdapter({
      composeProject: config.composeProject,
      publicOrigin: "https://demo.example.com/",
      previousEnvironment,
      runDocker: async (args, environment) => {
        calls.push(args.join(" "));
        if (args[0] === "ps") {
          const service = String(
            args.find((value) =>
              value.startsWith("label=com.docker.compose.service="),
            ),
          )
            .split("=")
            .at(-1);
          if (restored) return `restored-${service}`;
          if (stopped) return "";
          return `candidate-${service}`;
        }
        if (args[0] === "stop") {
          stopped = true;
          return "";
        }
        if (args[0] === "compose") {
          expect(environment?.RELEASE_ID).toBe(config.releaseId);
          expect(environment?.APP_IMAGE_ID).toBe(config.appImageId);
          restored = true;
          return "";
        }
        if (args[0] === "inspect")
          return JSON.stringify([{ Image: config.appImageId }]);
        return "";
      },
      fetchImpl: async (request) =>
        new Response(new URL(String(request)).pathname, { status: 200 }),
    });

    const evidence = await rollbackApplication({
      previousRelease,
      adapter,
      startedAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    expect(evidence.status).toBe("PASS");
    expect(evidence.previousRelease).toEqual(previousRelease);
    expect(evidence.readinessSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(evidence.smokeSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(calls).toContain(
      `tag ${config.appImageId} idea-trace-validation:${config.releaseId}`,
    );
    expect(calls).toContain(
      "compose -p idea-validation-prod -f deploy/compose.production.yaml up --detach --no-deps --force-recreate app caddy",
    );
    expect(calls).toContain("inspect restored-app");
  });
});
