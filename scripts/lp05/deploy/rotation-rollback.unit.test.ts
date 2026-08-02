import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { rollbackApplication } from "./rollback.js";
import { rotateCredentials } from "./rotate-credentials.js";

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
});
