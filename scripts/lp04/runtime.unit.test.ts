import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json.js";
import { parseManifest } from "./contracts.js";
import { loadDemoEnvironment, normalizeLoopbackOrigin } from "./environment.js";
import { executeStoredEntry } from "./http-client.js";
import {
  assertJournalBinding,
  createPreparedEntry,
  journalPath,
  listJournalEntries,
  readJournalEntry,
  transitionJournalEntry,
  writeJournalEntry,
} from "./request-journal.js";
import { collectCursorPages } from "./pagination.js";
import { deriveRequestId, sha256 } from "./request-identity.js";
import {
  createRunRecord,
  readRunRecord,
  transitionRunRecord,
  validateRunRecord,
  writeRunRecord,
} from "./run-record.js";
import { assertSanitizedEvidence } from "./security.js";
import { expandTemplate, loadScenarioAssets } from "./scenario.js";
import { assertStructuredReport } from "./structured-report.js";
import { parseClientValidationRecord } from "./verify-client-evidence.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];
const temporaryRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lp04-runtime-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0))
    await rm(root, { recursive: true });
});

describe("LP-04 deterministic runtime contracts", () => {
  it("canonicalizes recursively and derives a stable request identity", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 4] } })).toBe(
      '{"a":{"x":[3,4],"y":2},"z":1}',
    );
    const input = {
      runId: "demo-one",
      manifestSha256: "a".repeat(64),
      stepId: "create-idea",
      semanticAttempt: 0,
    };
    expect(deriveRequestId(input)).toBe(deriveRequestId(input));
    expect(deriveRequestId(input)).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/u);
    expect(deriveRequestId({ ...input, semanticAttempt: 1 })).not.toBe(
      deriveRequestId(input),
    );
  });

  it("validates the committed bounded manifest and rejects unknown fields", async () => {
    const source = JSON.parse(
      await readFile(path.join(repoRoot, "demo/lp04/scenario.v1.json"), "utf8"),
    ) as unknown;
    const manifest = parseManifest(source);
    expect(manifest.ideas).toHaveLength(3);
    expect(manifest.syntheticMarker).toBe("SYNTHETIC_DEMO_DATA");
    expect(() =>
      parseManifest({ ...(source as object), unexpected: true }),
    ).toThrow("MANIFEST_UNKNOWN_FIELD");
  });

  it("accepts only credential-free loopback origins", () => {
    expect(normalizeLoopbackOrigin("http://127.0.0.1:3210")).toBe(
      "http://127.0.0.1:3210",
    );
    expect(() => normalizeLoopbackOrigin("https://127.0.0.1:3210")).toThrow();
    expect(() => normalizeLoopbackOrigin("http://example.test")).toThrow();
    expect(() =>
      normalizeLoopbackOrigin("http://u:p@127.0.0.1:3210"),
    ).toThrow();
    expect(() =>
      normalizeLoopbackOrigin("http://127.0.0.1:3210/api"),
    ).toThrow();
    expect(
      loadDemoEnvironment({
        baseUrl: "http://localhost:3210",
        runId: "demo-one",
        skillCommitSha: "b".repeat(40),
        env: { AI_API_TOKEN: "x".repeat(32) },
      }).baseOrigin,
    ).toBe("http://localhost:3210");
  });

  it("atomically persists exact request bytes and legal recovery transitions", async () => {
    const proofRoot = await temporaryRoot();
    const entry = createPreparedEntry({
      runId: "demo-one",
      stepId: "start-project",
      semanticAttempt: 0,
      path: "/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/transitions",
      body: {
        expectedVersion: 1,
        reason: "SYNTHETIC_DEMO_DATA start",
      },
      authorityInputs: { expectedVersion: 1 },
      manifestSha256: "a".repeat(64),
      skillCommitSha: "b".repeat(40),
      now: "2026-08-01T00:00:00.000Z",
    });
    await writeJournalEntry(proofRoot, entry);
    const dispatched = transitionJournalEntry(entry, "DISPATCHED", {
      now: "2026-08-01T00:00:01.000Z",
    });
    await writeJournalEntry(proofRoot, dispatched);
    const unknown = transitionJournalEntry(dispatched, "OUTCOME_UNKNOWN", {
      now: "2026-08-01T00:00:02.000Z",
    });
    await writeJournalEntry(proofRoot, unknown);
    const recovered = transitionJournalEntry(unknown, "DISPATCHED", {
      now: "2026-08-01T00:00:03.000Z",
    });
    const committed = transitionJournalEntry(recovered, "COMMITTED", {
      now: "2026-08-01T00:00:04.000Z",
      observation: { requestId: "req_observed", status: 200, errorCode: null },
      resultResourceRefs: {
        projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      },
    });
    await writeJournalEntry(proofRoot, committed);
    const stored = await readJournalEntry(
      journalPath(proofRoot, "demo-one", "start-project", 0),
    );
    expect(stored.canonicalBody).toBe(entry.canonicalBody);
    expect(stored.idempotencyKey).toBe(entry.idempotencyKey);
    expect(stored.state).toBe("COMMITTED");
    expect(await listJournalEntries(proofRoot, "demo-one")).toHaveLength(1);
    expect(() => transitionJournalEntry(entry, "COMMITTED")).toThrow(
      "JOURNAL_TRANSITION",
    );
  });

  it("fails closed on body, version and secret journal tampering", async () => {
    const proofRoot = await temporaryRoot();
    const entry = createPreparedEntry({
      runId: "demo-two",
      stepId: "submit-report",
      semanticAttempt: 0,
      path: "/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/reports",
      body: {
        basedOnRevision: 1,
        title: "SYNTHETIC_DEMO_DATA report",
      },
      authorityInputs: { basedOnRevision: 1 },
      manifestSha256: "c".repeat(64),
      skillCommitSha: "d".repeat(40),
    });
    await writeJournalEntry(proofRoot, entry);
    const file = journalPath(proofRoot, "demo-two", "submit-report", 0);
    const tampered = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    tampered.canonicalBody = canonicalJson({
      basedOnRevision: 2,
      authorization: "Bearer hidden",
    });
    tampered.bodySha256 = sha256(String(tampered.canonicalBody));
    await writeFile(file, JSON.stringify(tampered));
    await expect(readJournalEntry(file)).rejects.toThrow("JOURNAL_SECRET");
  });

  it("restores the exact durable run checkpoint after recovery", async () => {
    const proofRoot = await temporaryRoot();
    const created = createRunRecord({
      runId: "demo-three",
      manifestSha256: "e".repeat(64),
      skillCommitSha: "f".repeat(40),
      baseOrigin: "http://127.0.0.1:3000",
      now: "2026-08-01T00:00:00.000Z",
    });
    const preflight = transitionRunRecord(created, "PREFLIGHT_PASSED");
    const seeded = transitionRunRecord(preflight, "SEEDED");
    const recovering = transitionRunRecord(seeded, "RECOVERING_UNKNOWN");
    expect(recovering.resumePhase).toBe("SEEDED");
    const resumed = transitionRunRecord(recovering, "SEEDED");
    expect(resumed.resumePhase).toBeNull();
    await writeRunRecord(proofRoot, resumed);
    expect(() => transitionRunRecord(recovering, "PREFLIGHT_PASSED")).toThrow(
      "RUN_RESUME_PHASE",
    );
    expect((await readRunRecord(proofRoot, "demo-three")).phase).toBe("SEEDED");
    expect(() =>
      validateRunRecord({ ...resumed, resumePhase: "CREATED" }),
    ).toThrow("RUN_RESUME_BINDING");
  });

  it("sends a PREPARED entry once with its exact frozen bytes and key", async () => {
    const proofRoot = await temporaryRoot();
    const entry = createPreparedEntry({
      runId: "demo-send",
      stepId: "create-idea",
      semanticAttempt: 0,
      path: "/api/v1/ideas",
      body: { z: "SYNTHETIC_DEMO_DATA", a: 1 },
      manifestSha256: "1".repeat(64),
      skillCommitSha: "2".repeat(40),
    });
    await writeJournalEntry(proofRoot, entry);
    const sent: { body: string; key: string }[] = [];
    const result = await executeStoredEntry({
      proofRoot,
      entry,
      baseOrigin: "http://127.0.0.1:3000",
      aiToken: "a".repeat(32),
      fetchImpl: async (_url, init) => {
        sent.push({
          body: String(init?.body),
          key: new Headers(init?.headers).get("idempotency-key") ?? "",
        });
        return new Response(
          JSON.stringify({ data: {}, meta: { requestId: "req_seen" } }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    });
    expect(sent).toEqual([
      { body: entry.canonicalBody, key: entry.idempotencyKey },
    ]);
    expect(result.entry.state).toBe("DISPATCHED");
  });

  it("fails bindings and terminal replay before any network send", async () => {
    const proofRoot = await temporaryRoot();
    const prepared = createPreparedEntry({
      runId: "demo-closed",
      stepId: "create-idea",
      semanticAttempt: 0,
      path: "/api/v1/ideas",
      body: { marker: "SYNTHETIC_DEMO_DATA" },
      manifestSha256: "3".repeat(64),
      skillCommitSha: "4".repeat(40),
    });
    const dispatched = transitionJournalEntry(prepared, "DISPATCHED");
    const committed = transitionJournalEntry(dispatched, "COMMITTED", {
      observation: { requestId: "req_seen", status: 201, errorCode: null },
    });
    let sends = 0;
    const fetchImpl: typeof fetch = async () => {
      sends += 1;
      return new Response("{}");
    };
    expect(() =>
      assertJournalBinding(prepared, {
        runId: prepared.runId,
        manifestSha256: "5".repeat(64),
        skillCommitSha: prepared.skillCommitSha,
      }),
    ).toThrow("JOURNAL_RUN_BINDING");
    await expect(
      executeStoredEntry({
        proofRoot,
        entry: committed,
        baseOrigin: "http://127.0.0.1:3000",
        aiToken: "a".repeat(32),
        fetchImpl,
      }),
    ).rejects.toThrow("JOURNAL_TERMINAL");
    expect(sends).toBe(0);
  });

  it("bounds cursors, evidence and expanded structured reports", async () => {
    const pages = new Map<
      string | undefined,
      { items: { id: string }[]; nextCursor: string | null }
    >([
      [undefined, { items: [{ id: "one" }], nextCursor: "next" }],
      ["next", { items: [{ id: "two" }], nextCursor: null }],
    ]);
    await expect(
      collectCursorPages({
        readPage: async (cursor) => pages.get(cursor)!,
        identity: (item) => item.id,
      }),
    ).resolves.toHaveLength(2);
    expect(() =>
      assertSanitizedEvidence({ bearer: `Bearer ${"x".repeat(20)}` }),
    ).toThrow("EVIDENCE_SECRET");
    expect(() =>
      assertSanitizedEvidence({ value: "hidden-value" }, ["hidden-value"]),
    ).toThrow("EVIDENCE_SECRET");
    expect(() =>
      assertStructuredReport({ schemaVersion: "1.0", title: "missing" }),
    ).toThrow("REPORT_TEMPLATE_INVALID");
    const assets = await loadScenarioAssets(repoRoot);
    const template = assets.reportTemplates["active-project"];
    expect(template).toBeDefined();
    expect(() =>
      assertStructuredReport(
        expandTemplate(template, {
          projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          clientRequestId: deriveRequestId({
            runId: "template-check",
            manifestSha256: assets.manifestSha256,
            stepId: "report-active",
            semanticAttempt: 0,
          }),
          basedOnRevision: 0,
          evidenceId: "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          decisionAttentionId: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          supportAttentionId: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertStructuredReport(
        expandTemplate(assets.reportTemplates["completed-project"], {
          projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          clientRequestId: deriveRequestId({
            runId: "template-check",
            manifestSha256: assets.manifestSha256,
            stepId: "report-governed",
            semanticAttempt: 0,
          }),
          basedOnRevision: 0,
          evidenceId: "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          decisionAttentionId: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          supportAttentionId: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts only digest-bound executed client evidence", () => {
    const digestInput = {
      schemaVersion: "1.0",
      client: "CODEX",
      clientVersion: "codex-test",
      executionMode: "CLI",
      observedBy: "LP-04 acceptance",
      skillCommitSha: "a".repeat(40),
      runId: "codex-proof",
      inputIntent: "SYNTHETIC_DEMO_DATA create and read one Idea",
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      rawTranscriptSha256: "b".repeat(64),
      requestIds: ["req_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      resourceRefs: { ideaId: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      webPaths: ["/ideas/idea_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      objectiveChecks: [{ id: "live-read", result: "PASS" }],
      result: "PASS",
    } as const;
    const evidenceSha256 = sha256(assertSanitizedEvidence(digestInput));
    expect(
      parseClientValidationRecord({ ...digestInput, evidenceSha256 }),
    ).toMatchObject({ client: "CODEX", result: "PASS" });
    expect(() =>
      parseClientValidationRecord({
        ...digestInput,
        client: "CLAUDE",
        evidenceSha256,
      }),
    ).toThrow("CLIENT_EVIDENCE_DIGEST");
  });
});
