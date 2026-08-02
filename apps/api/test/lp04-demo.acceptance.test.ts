import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPool,
  migrate,
  PostgresExperienceQueryService,
  PostgresIdeaService,
  PostgresProjectExecutionService,
  PostgresReadiness,
  PostgresReportService,
} from "@idea/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeGovernedProject } from "../../../scripts/lp04/human-facilitator.js";
import { UnknownResultError } from "../../../scripts/lp04/http-client.js";
import {
  journalPath,
  readJournalEntry,
} from "../../../scripts/lp04/request-journal.js";
import {
  DemoScenarioRunner,
  loadCommittedEntry,
  loadScenarioAssets,
} from "../../../scripts/lp04/scenario.js";
import {
  deriveRequestId,
  sha256,
} from "../../../scripts/lp04/request-identity.js";
import { readRunRecord } from "../../../scripts/lp04/run-record.js";
import { assertSanitizedEvidence } from "../../../scripts/lp04/security.js";
import { UnknownResultProxy } from "../../../scripts/lp04/unknown-result-proxy.js";
import { verifyRun } from "../../../scripts/lp04/verify-run.js";
import { buildApp } from "../src/app.js";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const aiToken = "lp04-ai-token-that-is-at-least-thirty-two-characters";
const humanToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
let app: FastifyInstance;
let apiOrigin = "";

const assertIsolatedTestDatabase = (): void => {
  const url = new URL(databaseUrl);
  if (
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  )
    throw new Error("LP04_TEST_DATABASE_GUARD");
};

const childOutput = (child: ChildProcess): { value: string } => {
  const output = { value: "" };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output.value += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    output.value += chunk;
  });
  return output;
};

const waitForChild = async (
  child: ChildProcess,
  output: { value: string },
  timeoutMs = 60_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`LP04_CHILD_TIMEOUT:${output.value.slice(-2_000)}`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

const startWorker = (input: {
  baseOrigin: string;
  proofRoot: string;
  runId: string;
  skillCommitSha: string;
}): { child: ChildProcess; output: { value: string } } => {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(
        repoRoot,
        "scripts/lp04/test-harness/crash-after-upstream-worker.ts",
      ),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_API_TOKEN: aiToken,
        LP04_BASE_URL: input.baseOrigin,
        LP04_PROOF_ROOT: input.proofRoot,
        LP04_RUN_ID: input.runId,
        LP04_SKILL_COMMIT: input.skillCommitSha,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return { child, output: childOutput(child) };
};

const getJson = async (pathname: string): Promise<Record<string, unknown>> => {
  const response = await fetch(new URL(pathname, apiOrigin));
  expect(response.status, pathname).toBe(200);
  return (await response.json()) as Record<string, unknown>;
};

const exactHead = (): string =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

const startPrepareWorker = (input: {
  proofRoot: string;
  runId: string;
  skillCommitSha: string;
}): { child: ChildProcess; output: { value: string } } => {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(repoRoot, "scripts/lp04/test-harness/prepare-only-worker.ts"),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_API_TOKEN: aiToken,
        LP04_BASE_URL: apiOrigin,
        LP04_PROOF_ROOT: input.proofRoot,
        LP04_RUN_ID: input.runId,
        LP04_SKILL_COMMIT: input.skillCommitSha,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return { child, output: childOutput(child) };
};

beforeAll(async () => {
  assertIsolatedTestDatabase();
  await migrate(pool);
  await pool.query(`
    TRUNCATE TABLE
      audit_events,
      project_hypotheses,
      validation_projects,
      clarification_answers,
      clarification_questions,
      idea_statements,
      idempotency_records,
      ideas
    CASCADE
  `);
  app = await buildApp({
    config: {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 0,
      databaseUrl,
      aiApiToken: aiToken,
      aiWriteDisplayName: "LP-04 synthetic demo principal",
      aiWriteClient: "lp04-acceptance",
      humanControlToken: humanToken,
      logLevel: "silent",
      dbPoolMax: 8,
      dbConnectTimeoutMs: 2_000,
      shutdownGraceMs: 1_000,
    },
    service: new PostgresIdeaService(pool),
    executionService: new PostgresProjectExecutionService(pool, humanToken),
    reportService: new PostgresReportService(pool),
    experienceService: new PostgresExperienceQueryService(pool),
    readiness: new PostgresReadiness(pool),
  });
  apiOrigin = await app.listen({ host: "127.0.0.1", port: 0 });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("LP-04 real HTTP demo and recovery", () => {
  it("recovers exact bytes after process death and keeps human authority separate", async () => {
    const proofRoot = await mkdtemp(path.join(tmpdir(), "lp04-http-proof-"));
    const runId = "lp04-http-acceptance";
    const skillCommitSha = exactHead();
    const assets = await loadScenarioAssets(repoRoot);
    const createKey = deriveRequestId({
      runId,
      manifestSha256: assets.manifestSha256,
      stepId: "create-clarification-idea",
      semanticAttempt: 0,
    });
    const proxy = new UnknownResultProxy(apiOrigin, {
      method: "POST",
      path: "/api/v1/ideas",
      idempotencyKeySha256: sha256(createKey),
      action: "DROP_AFTER_UPSTREAM_RESPONSE",
      remainingFaults: 1,
    });
    const proxyOrigin = await proxy.listen();
    try {
      const first = startWorker({
        baseOrigin: proxyOrigin,
        proofRoot,
        runId,
        skillCommitSha,
      });
      const firstExit = waitForChild(first.child, first.output);
      const triggered = await Promise.race([
        proxy.triggered,
        firstExit.then(({ code, signal }) => {
          throw new Error(
            `LP04_CHILD_EARLY_EXIT:${String(code)}:${String(signal)}:${first.output.value.slice(-2_000)}`,
          );
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("LP04_FAULT_NOT_TRIGGERED")),
            30_000,
          ),
        ),
      ]);
      expect(triggered.status).toBe(201);
      const file = journalPath(
        proofRoot,
        runId,
        "create-clarification-idea",
        0,
      );
      const before = await readJournalEntry(file);
      expect(["DISPATCHED", "OUTCOME_UNKNOWN"]).toContain(before.state);
      first.child.kill("SIGKILL");
      proxy.release();
      const killed = await firstExit;
      expect(killed.signal).toBe("SIGKILL");

      const second = startWorker({
        baseOrigin: proxyOrigin,
        proofRoot,
        runId,
        skillCommitSha,
      });
      const recovered = await waitForChild(second.child, second.output);
      expect(recovered.code, second.output.value).toBe(0);
      const after = await readJournalEntry(file);
      expect(after.state).toBe("COMMITTED");
      expect(after.canonicalBody).toBe(before.canonicalBody);
      expect(after.bodySha256).toBe(before.bodySha256);
      expect(after.idempotencyKey).toBe(before.idempotencyKey);
      expect(after.idempotencyKeySha256).toBe(before.idempotencyKeySha256);

      const ideaId = after.resultResourceRefs.clarificationIdeaId;
      expect(ideaId).toBeDefined();
      expect(
        (
          await pool.query(
            `
                SELECT
                  (SELECT count(*)::int FROM ideas WHERE id=$1) AS ideas,
                  (SELECT count(*)::int FROM audit_events WHERE aggregate_id=$1 AND idempotency_key=$2) AS audits,
                  (SELECT count(*)::int FROM idempotency_records WHERE idempotency_key=$2) AS idempotency
              `,
            [ideaId, createKey],
          )
        ).rows[0],
      ).toEqual({ ideas: 1, audits: 1, idempotency: 1 });

      const verified = await verifyRun({
        repoRoot,
        proofRoot,
        runId,
        baseOrigin: proxyOrigin,
        skillCommitSha,
      });
      expect(verified.requestCount).toBeGreaterThan(10);
      const terminalReads: string[] = [];
      let terminalWrites = 0;
      const terminalRunner = await DemoScenarioRunner.create({
        repoRoot,
        proofRoot,
        baseOrigin: proxyOrigin,
        runId,
        skillCommitSha,
        aiToken,
        fetchImpl: async (url, init) => {
          if ((init?.method ?? "GET") === "POST") terminalWrites += 1;
          else terminalReads.push(new URL(String(url)).pathname);
          return fetch(url, init);
        },
      });
      await expect(terminalRunner.run()).resolves.toMatchObject({
        phase: "VERIFIED",
        result: "PASS",
      });
      expect(terminalWrites).toBe(0);
      expect(terminalReads).toContainEqual(
        expect.stringMatching(/\/reports\/current$/u),
      );
      expect(terminalReads).toContainEqual(
        expect.stringMatching(/\/progress-updates$/u),
      );
      const governed = await loadCommittedEntry({
        proofRoot,
        runId,
        stepId: "conclusion-governed",
      });
      expect(governed.resultResourceRefs.governedConclusionId).toBeDefined();
      const runRecord = await readRunRecord(proofRoot, runId);
      const governedProjectId = runRecord.resourceRefs.governedProjectId;
      const governedConclusionId = runRecord.resourceRefs.governedConclusionId;
      if (governedProjectId === undefined || governedConclusionId === undefined)
        throw new Error("LP04_GOVERNED_REFS_MISSING");
      const governedRead = await getJson(
        `/api/v1/projects/${governedProjectId}?view=proposer`,
      );
      const governedData = governedRead.data as {
        project: { authority: { version: number } };
      };
      const aiAttempt = await fetch(
        new URL(
          `/api/v1/projects/${governedProjectId}/human-confirmations`,
          proxyOrigin,
        ),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${aiToken}`,
            "content-type": "application/json",
            "idempotency-key": "req_01ARZ3NDEKTSV4RRFFQ69G5FAX",
          },
          body: JSON.stringify({
            expectedVersion: governedData.project.authority.version,
            operation: "COMPLETE_PROJECT",
            conclusionId: governedConclusionId,
            completionSummary: "SYNTHETIC_DEMO_DATA unauthorized AI attempt",
            actor: {
              actorType: "AI",
              role: "EXECUTOR",
              displayName: "LP-04 unauthorized AI",
            },
            reason: "SYNTHETIC_DEMO_DATA prove human boundary",
          }),
        },
      );
      expect(aiAttempt.status).toBe(401);
      const humanResult = await completeGovernedProject({
        repoRoot,
        baseUrl: proxyOrigin,
        proofRoot,
        runId,
        humanControlToken: humanToken,
        allowSyntheticDemo: true,
      });
      expect(() =>
        assertSanitizedEvidence(humanResult, [aiToken, humanToken]),
      ).not.toThrow();

      const project = await getJson(
        `/api/v1/projects/${humanResult.projectId}?view=proposer`,
      );
      expect(JSON.stringify(project)).toContain("COMPLETED");
      const proposer = await getJson("/api/v1/experience/proposer/ideas");
      const executor = await getJson("/api/v1/experience/executor/projects");
      expect(JSON.stringify(proposer)).toContain(humanResult.projectId);
      expect(JSON.stringify(executor)).toContain(humanResult.projectId);
      const activeProjectId = runRecord.resourceRefs.activeProjectId;
      if (activeProjectId === undefined)
        throw new Error("LP04_ACTIVE_PROJECT_MISSING");
      const currentReport = await getJson(
        `/api/v1/projects/${activeProjectId}/reports/current`,
      );
      expect(JSON.stringify(currentReport)).toContain("evidence_first");
    } finally {
      await proxy.close();
      await rm(proofRoot, { recursive: true });
    }
  }, 120_000);

  it("recovers a PREPARED journal from a fresh process and sends once", async () => {
    const proofRoot = await mkdtemp(
      path.join(tmpdir(), "lp04-prepared-proof-"),
    );
    const runId = "lp04-prepared-restart";
    const skillCommitSha = exactHead();
    try {
      const preparedWorker = startPrepareWorker({
        proofRoot,
        runId,
        skillCommitSha,
      });
      const preparedExit = await waitForChild(
        preparedWorker.child,
        preparedWorker.output,
      );
      expect(preparedExit.code, preparedWorker.output.value).toBe(86);
      const file = journalPath(
        proofRoot,
        runId,
        "create-clarification-idea",
        0,
      );
      const before = await readJournalEntry(file);
      expect(before.state).toBe("PREPARED");

      const recoveryWorker = startWorker({
        baseOrigin: apiOrigin,
        proofRoot,
        runId,
        skillCommitSha,
      });
      const recoveredExit = await waitForChild(
        recoveryWorker.child,
        recoveryWorker.output,
      );
      expect(recoveredExit.code, recoveryWorker.output.value).toBe(0);
      const after = await readJournalEntry(file);
      expect(after).toMatchObject({
        state: "COMMITTED",
        canonicalBody: before.canonicalBody,
        bodySha256: before.bodySha256,
        idempotencyKey: before.idempotencyKey,
      });
      const ideaId = after.resultResourceRefs.clarificationIdeaId;
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM ideas WHERE id=$1",
            [ideaId],
          )
        ).rows[0]?.count,
      ).toBe(1);
    } finally {
      await rm(proofRoot, { recursive: true });
    }
  }, 120_000);

  it("recovers a dropped response in the same process with the frozen key", async () => {
    const proofRoot = await mkdtemp(path.join(tmpdir(), "lp04-same-proof-"));
    const runId = "lp04-same-process";
    const skillCommitSha = exactHead();
    const assets = await loadScenarioAssets(repoRoot);
    const key = deriveRequestId({
      runId,
      manifestSha256: assets.manifestSha256,
      stepId: "create-clarification-idea",
      semanticAttempt: 0,
    });
    const proxy = new UnknownResultProxy(apiOrigin, {
      method: "POST",
      path: "/api/v1/ideas",
      idempotencyKeySha256: sha256(key),
      action: "DROP_AFTER_UPSTREAM_RESPONSE",
      remainingFaults: 1,
    });
    const proxyOrigin = await proxy.listen();
    try {
      const runner = await DemoScenarioRunner.create({
        repoRoot,
        proofRoot,
        baseOrigin: proxyOrigin,
        runId,
        skillCommitSha,
        aiToken,
      });
      const firstRun = runner.run();
      await proxy.triggered;
      proxy.release();
      await expect(firstRun).rejects.toBeInstanceOf(UnknownResultError);
      const file = journalPath(
        proofRoot,
        runId,
        "create-clarification-idea",
        0,
      );
      const unresolved = await readJournalEntry(file);
      expect(unresolved.state).toBe("OUTCOME_UNKNOWN");
      await expect(runner.run()).resolves.toMatchObject({
        phase: "VERIFIED",
        result: "PASS",
      });
      const resolved = await readJournalEntry(file);
      expect(resolved.idempotencyKey).toBe(unresolved.idempotencyKey);
      expect(resolved.bodySha256).toBe(unresolved.bodySha256);
      expect(resolved.state).toBe("COMMITTED");
    } finally {
      await proxy.close();
      await rm(proofRoot, { recursive: true });
    }
  }, 120_000);
});
