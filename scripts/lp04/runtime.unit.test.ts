import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json.js";
import { parseManifest } from "./contracts.js";
import { loadDemoEnvironment, normalizeLoopbackOrigin } from "./environment.js";
import {
  executeStoredEntry,
  executeStoredEntryWithInProgressRetry,
  resolveExecutedEntry,
} from "./http-client.js";
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
import { verifyPublicResources } from "./public-verification.js";
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
import {
  parseClientTranscriptRequests,
  parseClientValidationRecord,
  transcriptRequestClaimMatches,
  verifyClientEvidence,
} from "./verify-client-evidence.js";

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
      requestClaims: [
        {
          requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          method: "POST",
          path: "/api/v1/ideas",
          status: 201,
          outcome: "COMMITTED",
        },
      ],
      resourceRefs: { ideaId: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      webPaths: ["/ideas/idea_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      objectiveChecks: [
        { id: "exact-skill-loaded", result: "PASS" },
        { id: "unknown-result-replayed", result: "PASS" },
        { id: "exact-body-key-reused", result: "PASS" },
        { id: "live-idea-read-reconciled", result: "PASS" },
        { id: "proposer-collection-unique", result: "PASS" },
        { id: "human-boundary-respected", result: "PASS" },
        { id: "transcript-secret-scan", result: "PASS" },
      ],
      result: "PASS",
    } as const;
    const evidenceSha256 = sha256(assertSanitizedEvidence(digestInput));
    expect(
      parseClientValidationRecord({ ...digestInput, evidenceSha256 }),
    ).toMatchObject({ client: "CODEX", result: "PASS" });
    expect(() =>
      parseClientValidationRecord({
        ...digestInput,
        observedBy: "different observer",
        evidenceSha256,
      }),
    ).toThrow("CLIENT_EVIDENCE_DIGEST");
  });

  it("gates both committed client records with mandatory objective sets", async () => {
    for (const file of [
      "codex-client-proof.json",
      "claude-client-proof.json",
    ]) {
      const value = JSON.parse(
        await readFile(
          path.join(
            repoRoot,
            "docs/feature/lp-04-ai-skill-demo/evidence",
            file,
          ),
          "utf8",
        ),
      ) as unknown;
      expect(parseClientValidationRecord(value).result).toBe("PASS");
    }
  });

  it("binds client PASS to the exact transcript, request history and resource", async () => {
    const proofRoot = await temporaryRoot();
    const transcriptFile = path.join(proofRoot, "transcript.jsonl");
    const requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const ideaId = "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const requestCommand = (responseFile: string) =>
      'curl --request POST "${LP04_BASE_URL}/api/v1/ideas" ' +
      '--header "Idempotency-Key: ${LP04_IDEMPOTENCY_KEY}" ' +
      `--data-binary @frozen.json --output ${responseFile}`;
    const transcript = [
      {
        timestamp: "2026-08-01T00:00:30.000Z",
        type: "session_meta",
        payload: {
          session_id: "codex-test-session",
          cli_version: "codex-test",
        },
      },
      {
        timestamp: "2026-08-01T00:00:31.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "timeout-call",
          name: "exec",
          input: JSON.stringify({
            cmd: requestCommand("initial-response.json"),
          }),
        },
      },
      {
        timestamp: "2026-08-01T00:00:32.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "timeout-call",
          output: `${"a".repeat(64)}  frozen.json\ncurl_exit=28\nhttp_code=000`,
        },
      },
      {
        timestamp: "2026-08-01T00:00:33.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "replay-call",
          name: "exec",
          input: JSON.stringify({
            cmd: requestCommand("replay-response.json"),
          }),
        },
      },
      {
        timestamp: "2026-08-01T00:00:34.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "replay-call",
          output: `${"a".repeat(64)}  frozen.json\ncurl_exit=0\nhttp_code=201`,
        },
      },
      {
        timestamp: "2026-08-01T00:00:35.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "response-read-call",
          name: "exec",
          input: JSON.stringify({
            cmd: "jq '{requestId: .meta.requestId}' replay-response.json",
          }),
        },
      },
      {
        timestamp: "2026-08-01T00:00:36.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "response-read-call",
          output: JSON.stringify({ requestId }),
        },
      },
      {
        timestamp: "2026-08-01T00:00:37.000Z",
        type: "event_msg",
        payload: { runId: "codex-proof", requestId, ideaId },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    await writeFile(transcriptFile, transcript);
    const digestInput = {
      schemaVersion: "1.0",
      client: "CODEX",
      clientVersion: "codex-test",
      executionMode: "CLI",
      observedBy: "LP-04 acceptance",
      skillCommitSha: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim(),
      runId: "codex-proof",
      inputIntent: "SYNTHETIC_DEMO_DATA create and read one Idea",
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      rawTranscriptSha256: sha256(transcript),
      requestIds: [requestId],
      requestClaims: [
        {
          requestId,
          method: "POST",
          path: "/api/v1/ideas",
          status: 201,
          outcome: "COMMITTED",
        },
      ],
      resourceRefs: { ideaId },
      webPaths: [`/ideas/${ideaId}`],
      objectiveChecks: [
        { id: "exact-skill-loaded", result: "PASS" },
        { id: "unknown-result-replayed", result: "PASS" },
        { id: "exact-body-key-reused", result: "PASS" },
        { id: "live-idea-read-reconciled", result: "PASS" },
        { id: "proposer-collection-unique", result: "PASS" },
        { id: "human-boundary-respected", result: "PASS" },
        { id: "transcript-secret-scan", result: "PASS" },
      ],
      result: "PASS",
    } as const;
    const value = {
      ...digestInput,
      evidenceSha256: sha256(assertSanitizedEvidence(digestInput)),
    };
    const fetchImpl: typeof fetch = async (url) => {
      const requestUrl = new URL(String(url));
      if (requestUrl.pathname === "/api/v1/ideas")
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              items: [{ authority: { id: ideaId } }],
              page: { limit: 100, nextCursor: null },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      expect(requestUrl.pathname).toBe(`/api/v1/ideas/${ideaId}`);
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            idea: {
              authority: {
                id: ideaId,
                intentSummary: "SYNTHETIC_DEMO_DATA proof",
              },
              history: [
                {
                  aggregateId: ideaId,
                  eventType: "IDEA_CREATED",
                  requestId,
                },
              ],
            },
          },
          meta: { requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAW" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ client: "CODEX", resourceRefs: { ideaId } });

    const slurpfileReaderTranscript = transcript
      .split("\n")
      .map((line) => {
        const event = JSON.parse(line) as {
          payload?: {
            type?: string;
            call_id?: string;
            input?: string;
            output?: unknown;
          };
        };
        if (
          event.payload?.type === "custom_tool_call" &&
          event.payload.call_id === "response-read-call" &&
          typeof event.payload.input === "string"
        ) {
          const input = JSON.parse(event.payload.input) as { cmd: string };
          input.cmd =
            "test ! -s initial-response.json\n" +
            "grep -q 'curl: (28)' initial-curl.stderr\n" +
            "jq -n --slurpfile replay replay-response.json " +
            "'{requestIds: [$replay[0].meta.requestId]}'";
          event.payload.input = JSON.stringify(input);
        }
        if (
          event.payload?.type === "custom_tool_call_output" &&
          event.payload.call_id === "response-read-call"
        )
          event.payload.output = JSON.stringify({ requestIds: [requestId] });
        return JSON.stringify(event);
      })
      .join("\n");
    await writeFile(transcriptFile, slurpfileReaderTranscript);
    const slurpfileReaderInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(slurpfileReaderTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...slurpfileReaderInput,
          evidenceSha256: sha256(assertSanitizedEvidence(slurpfileReaderInput)),
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({ client: "CODEX", resourceRefs: { ideaId } });
    await writeFile(transcriptFile, transcript);

    const arbitraryChecksInput = {
      ...digestInput,
      objectiveChecks: [
        ...digestInput.objectiveChecks.slice(0, -1),
        { id: "invented-check", result: "PASS" as const },
      ],
    };
    expect(() =>
      parseClientValidationRecord({
        ...arbitraryChecksInput,
        evidenceSha256: sha256(assertSanitizedEvidence(arbitraryChecksInput)),
      }),
    ).toThrow("CLIENT_EVIDENCE_OBJECTIVES");

    const unrelatedIdeaId = "idea_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    const unrelatedResourceInput = {
      ...digestInput,
      resourceRefs: { ideaId: unrelatedIdeaId },
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...unrelatedResourceInput,
          evidenceSha256: sha256(
            assertSanitizedEvidence(unrelatedResourceInput),
          ),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_TRANSCRIPT_BINDING:${unrelatedIdeaId}`);

    const unrelatedRequestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAX";
    const unrelatedTranscript = transcript.replaceAll(
      requestId,
      unrelatedRequestId,
    );
    await writeFile(transcriptFile, unrelatedTranscript);
    const unrelatedInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(unrelatedTranscript),
      requestIds: [unrelatedRequestId],
      requestClaims: [
        {
          ...digestInput.requestClaims[0],
          requestId: unrelatedRequestId,
        },
      ],
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...unrelatedInput,
          evidenceSha256: sha256(assertSanitizedEvidence(unrelatedInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(
      `CLIENT_EVIDENCE_REQUEST_AUTHORITY:${unrelatedRequestId}`,
    );

    const mixedTranscript = `${transcript}\n${JSON.stringify({
      timestamp: "2026-08-01T00:00:31.000Z",
      type: "event_msg",
      payload: {
        runId: "codex-proof",
        requestIds: [requestId, unrelatedRequestId],
        ideaId,
      },
    })}`;
    await writeFile(transcriptFile, mixedTranscript);
    const mixedInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(mixedTranscript),
      requestIds: [requestId, unrelatedRequestId],
      requestClaims: [
        digestInput.requestClaims[0],
        {
          ...digestInput.requestClaims[0],
          requestId: unrelatedRequestId,
        },
      ],
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...mixedInput,
          evidenceSha256: sha256(assertSanitizedEvidence(mixedInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(
      `CLIENT_EVIDENCE_REQUEST_AUTHORITY:${unrelatedRequestId}`,
    );

    const wrongPathInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(transcript),
      requestClaims: [
        {
          ...digestInput.requestClaims[0],
          path: `/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/reports`,
        },
      ],
    };
    await writeFile(transcriptFile, transcript);
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...wrongPathInput,
          evidenceSha256: sha256(assertSanitizedEvidence(wrongPathInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_REQUEST_PATH:${requestId}`);

    const wrongOperationInput = {
      ...digestInput,
      requestClaims: [
        {
          ...digestInput.requestClaims[0],
          path: `/api/v1/ideas/${ideaId}/promotions`,
          status: 299,
        },
      ],
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...wrongOperationInput,
          evidenceSha256: sha256(assertSanitizedEvidence(wrongOperationInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_REQUEST_AUTHORITY:${requestId}`);

    const mismatchedResponseTranscript = transcript
      .split("\n")
      .map((line) => {
        const event = JSON.parse(line) as {
          payload?: { call_id?: string; output?: unknown };
        };
        if (event.payload?.call_id === "response-read-call")
          event.payload.output = JSON.stringify({
            requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAX",
          });
        return JSON.stringify(event);
      })
      .join("\n");
    await writeFile(transcriptFile, mismatchedResponseTranscript);
    const mismatchedResponseInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(mismatchedResponseTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...mismatchedResponseInput,
          evidenceSha256: sha256(
            assertSanitizedEvidence(mismatchedResponseInput),
          ),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);

    const mismatchedTerminalStatusTranscript = transcript.replace(
      "http_code=201",
      "http_code=202",
    );
    await writeFile(transcriptFile, mismatchedTerminalStatusTranscript);
    const mismatchedTerminalStatusInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(mismatchedTerminalStatusTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...mismatchedTerminalStatusInput,
          evidenceSha256: sha256(
            assertSanitizedEvidence(mismatchedTerminalStatusInput),
          ),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);

    const aliasedResponseFileTranscript = transcript
      .split("\n")
      .map((line) => {
        const event = JSON.parse(line) as {
          payload?: { type?: string; call_id?: string; input?: string };
        };
        if (
          event.payload?.type === "custom_tool_call" &&
          event.payload.call_id === "response-read-call" &&
          typeof event.payload.input === "string"
        ) {
          const input = JSON.parse(event.payload.input) as { cmd: string };
          input.cmd = input.cmd.replace(
            " replay-response.json",
            " unrelated-replay-response.json",
          );
          event.payload.input = JSON.stringify(input);
        }
        return JSON.stringify(event);
      })
      .join("\n");
    await writeFile(transcriptFile, aliasedResponseFileTranscript);
    const aliasedResponseFileInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(aliasedResponseFileTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...aliasedResponseFileInput,
          evidenceSha256: sha256(
            assertSanitizedEvidence(aliasedResponseFileInput),
          ),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);

    const expectRejectedResponseReaderCommand = async (
      command: string,
    ): Promise<void> => {
      const responseReaderTranscript = transcript
        .split("\n")
        .map((line) => {
          const event = JSON.parse(line) as {
            payload?: { type?: string; call_id?: string; input?: string };
          };
          if (
            event.payload?.type === "custom_tool_call" &&
            event.payload.call_id === "response-read-call" &&
            typeof event.payload.input === "string"
          ) {
            const input = JSON.parse(event.payload.input) as { cmd: string };
            input.cmd = command;
            event.payload.input = JSON.stringify(input);
          }
          return JSON.stringify(event);
        })
        .join("\n");
      await writeFile(transcriptFile, responseReaderTranscript);
      const responseReaderInput = {
        ...digestInput,
        rawTranscriptSha256: sha256(responseReaderTranscript),
      };
      await expect(
        verifyClientEvidence({
          repoRoot,
          baseOrigin: "http://127.0.0.1:3000",
          transcriptFile,
          value: {
            ...responseReaderInput,
            evidenceSha256: sha256(
              assertSanitizedEvidence(responseReaderInput),
            ),
          },
          fetchImpl,
        }),
      ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);
    };

    await expectRejectedResponseReaderCommand(
      "jq '{requestId: .meta.requestId}' unrelated-replay-response.json\n" +
        "test -f replay-response.json",
    );
    await expectRejectedResponseReaderCommand(
      "jq '{requestId: .meta.requestId}' unrelated-replay-response.json | " +
        "test -f replay-response.json",
    );
    await expectRejectedResponseReaderCommand(
      "jq '{requestId: .meta.requestId}' unrelated-replay-response.json && " +
        "test -f replay-response.json",
    );
    await expectRejectedResponseReaderCommand(
      "jq '{requestId: .meta.requestId}' replay-response.json >/dev/null\n" +
        "jq '{requestId: .meta.requestId}' unrelated-replay-response.json",
    );

    const crossOperationTranscript = transcript.replaceAll(
      "/api/v1/ideas",
      "/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/transitions",
    );
    await writeFile(transcriptFile, crossOperationTranscript);
    const crossOperationInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(crossOperationTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...crossOperationInput,
          evidenceSha256: sha256(assertSanitizedEvidence(crossOperationInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);

    await writeFile(transcriptFile, transcript);

    const wrongStatusInput = {
      ...digestInput,
      requestClaims: [{ ...digestInput.requestClaims[0], status: 299 }],
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...wrongStatusInput,
          evidenceSha256: sha256(assertSanitizedEvidence(wrongStatusInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_REQUEST_AUTHORITY:${requestId}`);

    const unprovedTranscript = transcript.replace(
      "curl_exit=28\\nhttp_code=000",
      "curl_exit=0\\nhttp_code=201",
    );
    await writeFile(transcriptFile, unprovedTranscript);
    const unprovedInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(unprovedTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...unprovedInput,
          evidenceSha256: sha256(assertSanitizedEvidence(unprovedInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow(`CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${requestId}`);

    const humanBoundaryTranscript = `${transcript}\n${JSON.stringify({
      timestamp: "2026-08-01T00:00:36.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        call_id: "forbidden-human-call",
        name: "exec",
        input: JSON.stringify({
          cmd: `curl --request POST "\${LP04_BASE_URL}/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/human-confirmations"`,
        }),
      },
    })}`;
    await writeFile(transcriptFile, humanBoundaryTranscript);
    const humanBoundaryInput = {
      ...digestInput,
      rawTranscriptSha256: sha256(humanBoundaryTranscript),
    };
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value: {
          ...humanBoundaryInput,
          evidenceSha256: sha256(assertSanitizedEvidence(humanBoundaryInput)),
        },
        fetchImpl,
      }),
    ).rejects.toThrow("CLIENT_EVIDENCE_HUMAN_BOUNDARY");

    await writeFile(transcriptFile, "different transcript");
    await expect(
      verifyClientEvidence({
        repoRoot,
        baseOrigin: "http://127.0.0.1:3000",
        transcriptFile,
        value,
        fetchImpl,
      }),
    ).rejects.toThrow("CLIENT_EVIDENCE_TRANSCRIPT_DIGEST");
  });

  it("pairs a Claude rejected POST with its exact path, status and response request ID", () => {
    const requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const path = "/api/v1/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAV/reports";
    const transcript = [
      {
        type: "assistant",
        timestamp: "2026-08-01T00:00:30.000Z",
        version: "claude-test",
        sessionId: "claude-test-session",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool-call-one",
              name: "Bash",
              input: {
                command: `node lp04-http.mjs POST '${path}' req_01ARZ3NDEKTSV4RRFFQ69G5FAW invalid.json 2>&1`,
              },
            },
          ],
        },
      },
      {
        type: "user",
        timestamp: "2026-08-01T00:00:31.000Z",
        version: "claude-test",
        sessionId: "claude-test-session",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-call-one",
              content: JSON.stringify({
                status: 400,
                body: { ok: false, meta: { requestId } },
              }),
            },
          ],
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const requests = parseClientTranscriptRequests("CLAUDE", transcript);
    expect(requests).toEqual([
      { method: "POST", path, status: 400, requestId },
    ]);
    const claim = {
      method: "POST" as const,
      path,
      status: 400,
      requestId,
      outcome: "REJECTED" as const,
    };
    expect(transcriptRequestClaimMatches(claim, requests)).toBe(true);
    expect(
      transcriptRequestClaimMatches(
        { ...claim, path: `${path}/wrong-resource` },
        requests,
      ),
    ).toBe(false);
    expect(
      transcriptRequestClaimMatches({ ...claim, status: 422 }, requests),
    ).toBe(false);
    expect(
      transcriptRequestClaimMatches(
        { ...claim, requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAX" },
        requests,
      ),
    ).toBe(false);
    expect(parseClientTranscriptRequests("CODEX", transcript)).toEqual([]);
  });

  it("re-reads exact report and execution children and rejects mismatches", async () => {
    const projectId = "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const reportId = "rpt_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const progressId = "prog_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const paths: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      const pathname = new URL(String(url)).pathname;
      paths.push(pathname);
      if (pathname.endsWith("/reports/current"))
        return new Response(JSON.stringify({ data: { projectId, reportId } }), {
          status: 200,
        });
      if (pathname.endsWith("/progress-updates"))
        return new Response(
          JSON.stringify({
            data: {
              items: [{ id: progressId }],
              page: { nextCursor: null },
            },
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({ data: { project: { id: projectId } } }),
        {
          status: 200,
        },
      );
    };
    await expect(
      verifyPublicResources({
        baseOrigin: "http://127.0.0.1:3000",
        resourceRefs: { activeProjectId: projectId, activeReportId: reportId },
        fetchImpl,
      }),
    ).resolves.toEqual({ readCount: 2 });
    await expect(
      verifyPublicResources({
        baseOrigin: "http://127.0.0.1:3000",
        resourceRefs: {
          activeProjectId: projectId,
          activeProgressId: progressId,
        },
        fetchImpl,
      }),
    ).resolves.toEqual({ readCount: 2 });
    expect(paths).toContain(`/api/v1/projects/${projectId}/reports/current`);
    expect(paths).toContain(`/api/v1/projects/${projectId}/progress-updates`);
    await expect(
      verifyPublicResources({
        baseOrigin: "http://127.0.0.1:3000",
        resourceRefs: {
          activeProjectId: projectId,
          activeProgressId: "prog_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        },
        fetchImpl,
      }),
    ).rejects.toThrow("PUBLIC_VERIFY_MISSING");
  });

  it("retries IDEMPOTENCY_IN_PROGRESS with exact bytes and keeps exhaustion unresolved", async () => {
    const proofRoot = await temporaryRoot();
    const entry = createPreparedEntry({
      runId: "retry-proof",
      stepId: "create-idea",
      semanticAttempt: 0,
      path: "/api/v1/ideas",
      body: { marker: "SYNTHETIC_DEMO_DATA" },
      manifestSha256: "6".repeat(64),
      skillCommitSha: "7".repeat(40),
    });
    await writeJournalEntry(proofRoot, entry);
    const sends: { body: string; key: string }[] = [];
    let responseNumber = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      sends.push({
        body: String(init?.body),
        key: new Headers(init?.headers).get("idempotency-key") ?? "",
      });
      responseNumber += 1;
      if (responseNumber === 1)
        return new Response(
          JSON.stringify({
            error: {
              code: "IDEMPOTENCY_IN_PROGRESS",
              retryable: true,
              details: { retryAfterMs: 1, recovery: "RETRY_SAME_KEY" },
            },
            meta: { requestId: "req_wait" },
          }),
          { status: 409 },
        );
      return new Response(
        JSON.stringify({ data: {}, meta: { requestId: "req_done" } }),
        { status: 201 },
      );
    };
    const recovered = await executeStoredEntryWithInProgressRetry({
      proofRoot,
      entry,
      baseOrigin: "http://127.0.0.1:3000",
      aiToken: "a".repeat(32),
      fetchImpl,
      sleepImpl: async () => undefined,
    });
    const committed = await resolveExecutedEntry({
      proofRoot,
      entry: recovered.entry,
      response: recovered.response,
      accepted: true,
    });
    expect(committed.state).toBe("COMMITTED");
    expect(sends).toHaveLength(2);
    expect(new Set(sends.map((send) => send.body))).toEqual(
      new Set([entry.canonicalBody]),
    );
    expect(new Set(sends.map((send) => send.key))).toEqual(
      new Set([entry.idempotencyKey]),
    );

    const exhaustedRoot = await temporaryRoot();
    await writeJournalEntry(exhaustedRoot, entry);
    let attempts = 0;
    await expect(
      executeStoredEntryWithInProgressRetry({
        proofRoot: exhaustedRoot,
        entry,
        baseOrigin: "http://127.0.0.1:3000",
        aiToken: "a".repeat(32),
        fetchImpl: async (_url, init) => {
          attempts += 1;
          expect(String(init?.body)).toBe(entry.canonicalBody);
          expect(new Headers(init?.headers).get("idempotency-key")).toBe(
            entry.idempotencyKey,
          );
          return new Response(
            JSON.stringify({
              error: {
                code: "IDEMPOTENCY_IN_PROGRESS",
                retryable: true,
                details: { retryAfterMs: 1, recovery: "RETRY_SAME_KEY" },
              },
              meta: { requestId: "req_wait" },
            }),
            { status: 409 },
          );
        },
        sleepImpl: async () => undefined,
      }),
    ).rejects.toThrow("IDEMPOTENCY_IN_PROGRESS_EXHAUSTED:create-idea");
    expect(attempts).toBe(3);
    expect(
      (
        await readJournalEntry(
          journalPath(exhaustedRoot, "retry-proof", "create-idea", 0),
        )
      ).state,
    ).toBe("OUTCOME_UNKNOWN");
  });
});
