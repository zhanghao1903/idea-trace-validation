import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  createPool,
  migrate,
  PostgresExperienceQueryService,
  PostgresIdeaService,
  PostgresProjectExecutionService,
  PostgresReadiness,
  PostgresReportService,
} from "@idea/db";

import { buildApp } from "../../apps/api/src/app.js";
import { completeGovernedProject } from "./human-facilitator.js";
import { atomicWriteJson } from "./request-journal.js";
import { deriveRequestId } from "./request-identity.js";
import { DemoScenarioRunner } from "./scenario.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test";
const aiToken = randomBytes(32).toString("base64url");
const humanToken = randomBytes(32).toString("base64url");
const port = Number(process.env.LP04_BROWSER_PORT ?? "4174");
const runId = "lp04-browser";
const proofRoot = path.join(repoRoot, ".lp04-demo");

const assertTestEnvironment = (): void => {
  const url = new URL(databaseUrl);
  if (
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  )
    throw new Error("LP04_BROWSER_ENVIRONMENT_GUARD");
};

assertTestEnvironment();
const pool = createPool({ databaseUrl, max: 8, connectTimeoutMs: 2_000 });
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
await rm(path.join(proofRoot, "runs", runId), {
  recursive: true,
  force: true,
});
await rm(path.join(proofRoot, "browser-state.json"), { force: true });
const app = await buildApp({
  config: {
    nodeEnv: "test",
    host: "127.0.0.1",
    port,
    databaseUrl,
    aiApiToken: aiToken,
    aiWriteDisplayName: "LP-04 browser synthetic principal",
    aiWriteClient: "lp04-browser",
    humanControlToken: humanToken,
    logLevel: "silent",
    dbPoolMax: 8,
    dbConnectTimeoutMs: 2_000,
    shutdownGraceMs: 1_000,
    webDistDir: path.join(repoRoot, "apps/web/dist"),
  },
  service: new PostgresIdeaService(pool),
  executionService: new PostgresProjectExecutionService(pool, humanToken),
  reportService: new PostgresReportService(pool),
  experienceService: new PostgresExperienceQueryService(pool),
  readiness: new PostgresReadiness(pool),
});
const origin = await app.listen({ host: "127.0.0.1", port });

const skillCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const runner = await DemoScenarioRunner.create({
  repoRoot,
  proofRoot,
  baseOrigin: origin,
  runId,
  skillCommitSha,
  aiToken,
});
const record = await runner.run();
await completeGovernedProject({
  repoRoot,
  baseUrl: origin,
  proofRoot,
  runId,
  humanControlToken: humanToken,
  allowSyntheticDemo: true,
});

const activeProjectId = record.resourceRefs.activeProjectId;
const activeConclusionId = record.resourceRefs.activeConclusionId;
if (activeProjectId === undefined || activeConclusionId === undefined)
  throw new Error("LP04_BROWSER_ACTIVE_REFS");
const activeRead = await fetch(
  new URL(`/api/v1/projects/${activeProjectId}?view=proposer`, origin),
);
const activeJson = (await activeRead.json()) as {
  data: { project: { authority: { version: number } } };
};
if (activeRead.status !== 200) throw new Error("LP04_BROWSER_ACTIVE_READ");
const pendingKey = deriveRequestId({
  runId,
  manifestSha256: record.manifestSha256,
  stepId: "browser-pending-confirmation",
  semanticAttempt: 0,
});
const pending = await fetch(
  new URL(`/api/v1/projects/${activeProjectId}/human-confirmations`, origin),
  {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "idempotency-key": pendingKey,
      "x-human-control-token": humanToken,
    },
    body: JSON.stringify({
      expectedVersion: activeJson.data.project.authority.version,
      operation: "CONFIRM_CONCLUSION",
      conclusionId: activeConclusionId,
      actor: {
        actorType: "HUMAN",
        role: "PROPOSER",
        displayName: "合成浏览器验收者",
      },
      reason: "SYNTHETIC_DEMO_DATA leave one pending browser context",
    }),
  },
);
const pendingJson = (await pending.json()) as {
  data?: { confirmation?: { id?: string } };
};
if (pending.status !== 201 || pendingJson.data?.confirmation?.id === undefined)
  throw new Error(`LP04_BROWSER_PENDING_CONFIRMATION:${pending.status}`);

await atomicWriteJson(path.join(proofRoot, "browser-state.json"), {
  schemaVersion: "1.0",
  runId,
  skillCommitSha,
  origin,
  resourceRefs: record.resourceRefs,
  pendingConfirmationId: pendingJson.data.confirmation.id,
});
process.stdout.write("LP04_BROWSER_READY\n");

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await app.close();
  await pool.end();
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
