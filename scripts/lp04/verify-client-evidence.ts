import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClientValidationRecordV1 } from "./contracts.js";
import { normalizeLoopbackOrigin } from "./environment.js";
import { readJson } from "./http-client.js";
import { exactValuePresent } from "./public-verification.js";
import { sha256 } from "./request-identity.js";
import { assertSanitizedEvidence } from "./security.js";

const expectedChecks = {
  CODEX: [
    "exact-skill-loaded",
    "unknown-result-replayed",
    "exact-body-key-reused",
    "live-idea-read-reconciled",
    "proposer-collection-unique",
    "human-boundary-respected",
    "transcript-secret-scan",
  ],
  CLAUDE: [
    "exact-skill-loaded",
    "ready-idea-read",
    "promotion-attribution",
    "single-execution-fact",
    "invalid-report-rejected",
    "report-remained-empty",
    "corrected-report-accepted",
    "proposer-experience-reconciled",
    "executor-experience-reconciled",
    "database-authority-reconciled",
    "human-boundary-respected",
    "transcript-secret-scan",
  ],
} as const;

const expectedResourceKeys = {
  CODEX: ["ideaId"],
  CLAUDE: ["ideaId", "projectId", "reportId"],
} as const;

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const containsObjectFields = (
  value: unknown,
  expected: Record<string, unknown>,
): boolean => {
  if (Array.isArray(value))
    return value.some((item) => containsObjectFields(item, expected));
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  if (
    Object.entries(expected).every(([key, expectedValue]) =>
      Object.is(input[key], expectedValue),
    )
  )
    return true;
  return Object.values(input).some((item) =>
    containsObjectFields(item, expected),
  );
};

const bounded = (value: unknown, code: string, maximum = 2_000): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum)
    throw new Error(code);
  return value;
};

export const parseClientValidationRecord = (
  value: unknown,
): ClientValidationRecordV1 => {
  const input = object(value, "CLIENT_EVIDENCE_OBJECT");
  const exact = [
    "schemaVersion",
    "client",
    "clientVersion",
    "executionMode",
    "observedBy",
    "skillCommitSha",
    "runId",
    "inputIntent",
    "startedAt",
    "finishedAt",
    "rawTranscriptSha256",
    "requestIds",
    "requestClaims",
    "resourceRefs",
    "webPaths",
    "objectiveChecks",
    "result",
    "evidenceSha256",
  ];
  if (Object.keys(input).some((key) => !exact.includes(key)))
    throw new Error("CLIENT_EVIDENCE_FIELD");
  if (
    input.schemaVersion !== "1.0" ||
    (input.client !== "CODEX" && input.client !== "CLAUDE") ||
    (input.executionMode !== "CLI" && input.executionMode !== "DESKTOP") ||
    input.result !== "PASS" ||
    typeof input.skillCommitSha !== "string" ||
    !/^[a-f0-9]{40}$/u.test(input.skillCommitSha) ||
    typeof input.runId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(input.runId) ||
    typeof input.inputIntent !== "string" ||
    !input.inputIntent.includes("SYNTHETIC_DEMO_DATA") ||
    typeof input.startedAt !== "string" ||
    typeof input.finishedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(input.startedAt) ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(input.finishedAt) ||
    Date.parse(input.finishedAt) < Date.parse(input.startedAt) ||
    typeof input.rawTranscriptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.rawTranscriptSha256) ||
    typeof input.evidenceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.evidenceSha256) ||
    !Array.isArray(input.requestIds) ||
    input.requestIds.length === 0 ||
    input.requestIds.length > 100 ||
    input.requestIds.some(
      (id) =>
        typeof id !== "string" || !/^req_[0-9A-HJKMNP-TV-Z]{26}$/u.test(id),
    ) ||
    new Set(input.requestIds).size !== input.requestIds.length ||
    !Array.isArray(input.requestClaims) ||
    input.requestClaims.length !== input.requestIds.length ||
    !Array.isArray(input.webPaths) ||
    input.webPaths.length === 0 ||
    input.webPaths.length > 20 ||
    input.webPaths.some(
      (item) =>
        typeof item !== "string" ||
        !item.startsWith("/") ||
        item.includes("://") ||
        /(?:token|cookie|authorization)=/iu.test(item),
    ) ||
    !Array.isArray(input.objectiveChecks) ||
    input.objectiveChecks.length === 0 ||
    input.objectiveChecks.length > 30
  )
    throw new Error("CLIENT_EVIDENCE_VALUE");
  const requestClaims = input.requestClaims.map((value) => {
    const claim = object(value, "CLIENT_EVIDENCE_REQUEST_CLAIM");
    if (
      Object.keys(claim).some(
        (key) =>
          key !== "requestId" &&
          key !== "method" &&
          key !== "path" &&
          key !== "status" &&
          key !== "outcome",
      ) ||
      typeof claim.requestId !== "string" ||
      !/^req_[0-9A-HJKMNP-TV-Z]{26}$/u.test(claim.requestId) ||
      claim.method !== "POST" ||
      typeof claim.path !== "string" ||
      !/^\/api\/v1\/(?:ideas|projects)(?:\/[^/?#]+)*$/u.test(claim.path) ||
      !Number.isSafeInteger(claim.status) ||
      Number(claim.status) < 200 ||
      Number(claim.status) > 499 ||
      (claim.outcome !== "COMMITTED" && claim.outcome !== "REJECTED") ||
      (claim.outcome === "COMMITTED" && Number(claim.status) >= 300) ||
      (claim.outcome === "REJECTED" && Number(claim.status) < 400)
    )
      throw new Error("CLIENT_EVIDENCE_REQUEST_CLAIM");
    return {
      requestId: claim.requestId,
      method: "POST" as const,
      path: claim.path,
      status: Number(claim.status),
      outcome: claim.outcome as "COMMITTED" | "REJECTED",
    };
  });
  const claimedIds = requestClaims.map((claim) => claim.requestId);
  if (
    new Set(claimedIds).size !== claimedIds.length ||
    claimedIds.some((requestId) => !input.requestIds.includes(requestId)) ||
    input.requestIds.some(
      (requestId) => !claimedIds.includes(String(requestId)),
    )
  )
    throw new Error("CLIENT_EVIDENCE_REQUEST_CLAIMS");
  const resourceInput = object(input.resourceRefs, "CLIENT_EVIDENCE_REFS");
  const resourceRefs: Record<string, string> = {};
  for (const [key, resource] of Object.entries(resourceInput)) {
    if (
      !/^[a-z][A-Za-z0-9]{1,40}$/u.test(key) ||
      typeof resource !== "string" ||
      !/^(?:idea|proj|rpt)_[0-9A-Za-z]{10,64}$/u.test(resource)
    )
      throw new Error("CLIENT_EVIDENCE_REF");
    resourceRefs[key] = resource;
  }
  if (Object.keys(resourceRefs).length === 0)
    throw new Error("CLIENT_EVIDENCE_REFS");
  const objectiveChecks = input.objectiveChecks.map((value) => {
    const check = object(value, "CLIENT_EVIDENCE_CHECK");
    if (
      Object.keys(check).some((key) => key !== "id" && key !== "result") ||
      check.result !== "PASS"
    )
      throw new Error("CLIENT_EVIDENCE_CHECK");
    return {
      id: bounded(check.id, "CLIENT_EVIDENCE_CHECK", 120),
      result: "PASS" as const,
    };
  });
  const client = input.client as "CODEX" | "CLAUDE";
  const checkIds = objectiveChecks.map((check) => check.id);
  if (
    new Set(checkIds).size !== checkIds.length ||
    checkIds.length !== expectedChecks[client].length ||
    expectedChecks[client].some((check) => !checkIds.includes(check))
  )
    throw new Error("CLIENT_EVIDENCE_OBJECTIVES");
  const resourceKeys = Object.keys(resourceRefs).sort();
  if (
    resourceKeys.length !== expectedResourceKeys[client].length ||
    expectedResourceKeys[client].some((key) => !resourceKeys.includes(key))
  )
    throw new Error("CLIENT_EVIDENCE_RESOURCE_SHAPE");
  if (
    (client === "CODEX" && input.executionMode !== "CLI") ||
    (client === "CLAUDE" && input.executionMode !== "DESKTOP")
  )
    throw new Error("CLIENT_EVIDENCE_MODE");
  const record: ClientValidationRecordV1 = {
    schemaVersion: "1.0",
    client: input.client,
    clientVersion: bounded(input.clientVersion, "CLIENT_EVIDENCE_VERSION", 120),
    executionMode: input.executionMode,
    observedBy: bounded(input.observedBy, "CLIENT_EVIDENCE_OBSERVER", 120),
    skillCommitSha: input.skillCommitSha,
    runId: input.runId,
    inputIntent: bounded(input.inputIntent, "CLIENT_EVIDENCE_INTENT"),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    rawTranscriptSha256: input.rawTranscriptSha256,
    requestIds: input.requestIds as string[],
    requestClaims,
    resourceRefs,
    webPaths: input.webPaths as string[],
    objectiveChecks,
    result: "PASS",
    evidenceSha256: input.evidenceSha256,
  };
  const { evidenceSha256, ...digestInput } = record;
  if (sha256(assertSanitizedEvidence(digestInput)) !== evidenceSha256)
    throw new Error("CLIENT_EVIDENCE_DIGEST");
  assertSanitizedEvidence(record);
  return record;
};

const skillTree = (repoRoot: string, revision: string): string =>
  execFileSync(
    "git",
    ["rev-parse", `${revision}:skills/idea-validation-workflow`],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();

interface AuditEventFact {
  requestId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
}

const auditEvents = (value: unknown): AuditEventFact[] => {
  if (Array.isArray(value)) return value.flatMap(auditEvents);
  if (typeof value !== "object" || value === null) return [];
  const input = value as Record<string, unknown>;
  const own =
    typeof input.requestId === "string" &&
    typeof input.aggregateId === "string" &&
    typeof input.eventType === "string"
      ? [
          {
            requestId: input.requestId,
            aggregateId: input.aggregateId,
            aggregateType:
              typeof input.aggregateType === "string"
                ? input.aggregateType
                : "",
            eventType: input.eventType,
          },
        ]
      : [];
  return [...own, ...Object.values(input).flatMap(auditEvents)];
};

const operationForAuditEvent = (
  event: AuditEventFact,
): TranscriptRequestResponse | null => {
  const operation = (() => {
    switch (event.eventType) {
      case "IDEA_CREATED":
        return { path: "/api/v1/ideas", status: 201 };
      case "IDEA_PROMOTED":
        return {
          path: `/api/v1/ideas/${event.aggregateId}/promotions`,
          status: 201,
        };
      case "PROJECT_TRANSITIONED":
        return {
          path: `/api/v1/projects/${event.aggregateId}/transitions`,
          status: 200,
        };
      case "PROJECT_PROGRESS_RECORDED":
        return {
          path: `/api/v1/projects/${event.aggregateId}/progress-updates`,
          status: 201,
        };
      default:
        return null;
    }
  })();
  return operation === null
    ? null
    : {
        method: "POST",
        path: operation.path,
        status: operation.status,
        requestId: event.requestId,
      };
};

const assertTranscriptEnvelope = (
  record: ClientValidationRecordV1,
  transcriptText: string,
): void => {
  const lines = transcriptText.trim().split("\n");
  if (lines.length === 0 || lines.length > 10_000)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
  const events = lines.map((line) => {
    try {
      return object(
        JSON.parse(line) as unknown,
        "CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE",
      );
    } catch {
      throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
    }
  });
  const started = Date.parse(record.startedAt);
  const finished = Date.parse(record.finishedAt);
  const hasBoundedEvent = events.some((event) => {
    const timestamp = event.timestamp;
    if (typeof timestamp !== "string") return false;
    const observed = Date.parse(timestamp);
    return (
      Number.isFinite(observed) && observed >= started && observed <= finished
    );
  });
  const hasClientEnvelope = events.some((event) => {
    if (record.client === "CODEX") {
      if (event.type !== "session_meta") return false;
      const payload = event.payload;
      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      )
        return false;
      const version = (payload as Record<string, unknown>).cli_version;
      const sessionId = (payload as Record<string, unknown>).session_id;
      return (
        typeof version === "string" &&
        record.clientVersion.includes(version) &&
        typeof sessionId === "string" &&
        sessionId.length > 0
      );
    }
    const version = event.version;
    return (
      (event.type === "user" || event.type === "assistant") &&
      typeof version === "string" &&
      record.clientVersion.includes(version) &&
      typeof event.sessionId === "string" &&
      event.sessionId.length > 0
    );
  });
  if (!hasBoundedEvent || !hasClientEnvelope)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
};

export interface TranscriptRequestResponse {
  method: "POST";
  path: string;
  status: number;
  requestId: string;
}

interface TranscriptHttpExchange {
  method: "GET" | "POST";
  path: string;
  status: number;
  requestId?: string | undefined;
  body: unknown;
  order: number;
}

const eventWithinWindow = (
  event: Record<string, unknown>,
  window?: { startedAt: string; finishedAt: string },
): boolean => {
  if (window === undefined) return true;
  if (typeof event.timestamp !== "string") return false;
  const timestamp = Date.parse(event.timestamp);
  return (
    Number.isFinite(timestamp) &&
    timestamp >= Date.parse(window.startedAt) &&
    timestamp <= Date.parse(window.finishedAt)
  );
};

const claudeTranscriptExchanges = (
  events: Record<string, unknown>[],
  window?: { startedAt: string; finishedAt: string },
): TranscriptHttpExchange[] => {
  const requests = new Map<
    string,
    { method: "GET" | "POST"; path: string; order: number }
  >();
  const responses: TranscriptHttpExchange[] = [];
  for (const [order, event] of events.entries()) {
    if (!eventWithinWindow(event, window)) continue;
    const message = event.message;
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    )
      continue;
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        continue;
      const value = item as Record<string, unknown>;
      if (value.type === "tool_use" && value.name === "Bash") {
        const input = value.input;
        if (typeof input !== "object" || input === null || Array.isArray(input))
          continue;
        const command = (input as Record<string, unknown>).command;
        const matches =
          typeof command === "string"
            ? [
                ...command.matchAll(
                  /(?:^|\n)node lp04-http\.mjs (GET|POST) '([^']+)'(?: |$)/gu,
                ),
              ]
            : [];
        const match = matches.length === 1 ? matches[0] : undefined;
        if (
          typeof value.id === "string" &&
          (match?.[1] === "GET" || match?.[1] === "POST") &&
          match[2] !== undefined
        )
          requests.set(value.id, {
            method: match[1],
            path: match[2],
            order,
          });
      }
      if (value.type !== "tool_result" || typeof value.tool_use_id !== "string")
        continue;
      const request = requests.get(value.tool_use_id);
      if (request === undefined || typeof value.content !== "string") continue;
      try {
        const response = object(
          JSON.parse(value.content) as unknown,
          "CLIENT_EVIDENCE_TRANSCRIPT_RESPONSE",
        );
        const body = object(
          response.body,
          "CLIENT_EVIDENCE_TRANSCRIPT_RESPONSE",
        );
        const meta =
          typeof body.meta === "object" &&
          body.meta !== null &&
          !Array.isArray(body.meta)
            ? (body.meta as Record<string, unknown>)
            : {};
        if (Number.isSafeInteger(response.status))
          responses.push({
            ...request,
            status: Number(response.status),
            requestId:
              typeof meta.requestId === "string" &&
              /^req_[0-9A-HJKMNP-TV-Z]{26}$/u.test(meta.requestId)
                ? meta.requestId
                : undefined,
            body,
          });
      } catch {
        continue;
      }
    }
  }
  return responses;
};

const claudeTranscriptPostPaths = (
  events: Record<string, unknown>[],
  window: { startedAt: string; finishedAt: string },
): string[] => {
  const paths: string[] = [];
  for (const event of events) {
    if (!eventWithinWindow(event, window)) continue;
    const message = event.message;
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    )
      continue;
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        continue;
      const value = item as Record<string, unknown>;
      if (value.type !== "tool_use" || value.name !== "Bash") continue;
      const input = value.input;
      if (typeof input !== "object" || input === null || Array.isArray(input))
        continue;
      const command = (input as Record<string, unknown>).command;
      if (typeof command !== "string") continue;
      for (const match of command.matchAll(
        /(?:^|\n)node lp04-http\.mjs POST ['"]([^'"]+)['"](?: |$)/gu,
      )) {
        if (match[1] !== undefined) paths.push(match[1]);
      }
    }
  }
  return [...new Set(paths)];
};

export const parseClientTranscriptRequests = (
  client: ClientValidationRecordV1["client"],
  transcriptText: string,
  window?: { startedAt: string; finishedAt: string },
): TranscriptRequestResponse[] => {
  let events: Record<string, unknown>[];
  try {
    events = transcriptText
      .trim()
      .split("\n")
      .map((line) =>
        object(
          JSON.parse(line) as unknown,
          "CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE",
        ),
      );
  } catch {
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE");
  }
  return client === "CLAUDE"
    ? claudeTranscriptExchanges(events, window).flatMap((exchange) =>
        exchange.method === "POST" && exchange.requestId !== undefined
          ? [
              {
                method: "POST" as const,
                path: exchange.path,
                status: exchange.status,
                requestId: exchange.requestId,
              },
            ]
          : [],
      )
    : [];
};

export const transcriptRequestClaimMatches = (
  claim: ClientValidationRecordV1["requestClaims"][number],
  requests: TranscriptRequestResponse[],
): boolean =>
  requests.some(
    (request) =>
      request.method === claim.method &&
      request.path === claim.path &&
      request.status === claim.status &&
      request.requestId === claim.requestId,
  );

interface CodexTranscriptFacts {
  postPaths: string[];
  replayedRequests: TranscriptRequestResponse[];
}

const commandFromCodexCall = (
  event: Record<string, unknown>,
): { callId: string; command: string } | null => {
  if (event.type !== "response_item") return null;
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return null;
  const item = payload as Record<string, unknown>;
  if (
    item.type !== "custom_tool_call" ||
    item.name !== "exec" ||
    typeof item.call_id !== "string" ||
    typeof item.input !== "string"
  )
    return null;
  try {
    const input = object(
      JSON.parse(item.input) as unknown,
      "CLIENT_EVIDENCE_CODEX_CALL",
    );
    return typeof input.cmd === "string"
      ? { callId: item.call_id, command: input.cmd }
      : null;
  } catch {
    const encoded = /\bcmd:\s*("(?:\\.|[^"\\])*")/su.exec(item.input)?.[1];
    if (encoded === undefined) return null;
    try {
      const command = JSON.parse(encoded) as unknown;
      return typeof command === "string"
        ? { callId: item.call_id, command }
        : null;
    } catch {
      return null;
    }
  }
};

const codexOutput = (
  event: Record<string, unknown>,
): {
  callId: string;
  text: string;
} | null => {
  if (event.type !== "response_item") return null;
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return null;
  const item = payload as Record<string, unknown>;
  return item.type === "custom_tool_call_output" &&
    typeof item.call_id === "string"
    ? {
        callId: item.call_id,
        text: (() => {
          const strings = (value: unknown): string[] => {
            if (typeof value === "string") return [value];
            if (Array.isArray(value)) return value.flatMap(strings);
            if (typeof value !== "object" || value === null) return [];
            const input = value as Record<string, unknown>;
            return [
              ...(typeof input.text === "string" ? [input.text] : []),
              ...Object.entries(input)
                .filter(([key]) => key !== "text")
                .flatMap(([, child]) => strings(child)),
            ];
          };
          return strings(item.output).join("\n");
        })(),
      }
    : null;
};

const normalizedCommandPath = (value: string): string | null => {
  const path = value.replace(/^\$\{LP04_(?:DIRECT_)?BASE_URL\}/u, "");
  return /^\/api\/v1\/(?:ideas|projects)(?:\/[^?#\s]*)?$/u.test(path)
    ? path
    : null;
};

const shellArguments = (command: string): string[] => {
  const arguments_: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = (): void => {
    if (current.length > 0) arguments_.push(current);
    current = "";
  };
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character) || /[;&|<>]/u.test(character)) {
      flush();
      continue;
    }
    current += character;
  }
  if (escaped || quote !== null) return [];
  flush();
  return arguments_;
};

const codexTranscriptFacts = (
  events: Record<string, unknown>[],
  window: { startedAt: string; finishedAt: string },
): CodexTranscriptFacts => {
  const outputs = new Map<string, string>();
  for (const event of events) {
    if (!eventWithinWindow(event, window)) continue;
    const output = codexOutput(event);
    if (output !== null) outputs.set(output.callId, output.text);
  }
  const posts: {
    callId: string;
    order: number;
    path: string;
    bodyFile: string;
    bodySha256: string;
    keyHeader: string;
    output: string;
    responseFile?: string | undefined;
  }[] = [];
  const calls: {
    callId: string;
    command: string;
    order: number;
    output: string;
  }[] = [];
  const allPostPaths: string[] = [];
  for (const [order, event] of events.entries()) {
    if (!eventWithinWindow(event, window)) continue;
    const call = commandFromCodexCall(event);
    if (call === null) continue;
    calls.push({
      ...call,
      order,
      output: outputs.get(call.callId) ?? "",
    });
    for (const match of call.command.matchAll(
      /(?:^|\n)node lp04-http\.mjs POST ['"]([^'"]+)['"](?: |$)/gu,
    )) {
      if (match[1] !== undefined) allPostPaths.push(match[1]);
    }
    for (const line of call.command.split("\n")) {
      if (!/\bcurl\b/u.test(line) || !/(?:--request|-X)\s+POST\b/u.test(line))
        continue;
      const url = /(?:--request|-X)\s+POST\s+["']([^"']+)["']/u.exec(line)?.[1];
      const bodyFile = /--data-binary\s+@([^\s"']+)/u.exec(line)?.[1];
      const keyHeader = /--header\s+["']Idempotency-Key:\s*([^"']+)["']/iu.exec(
        line,
      )?.[1];
      const responseFile = /--output\s+([^\s"']+)/u.exec(line)?.[1];
      const path = url === undefined ? null : normalizedCommandPath(url);
      if (path !== null) allPostPaths.push(path);
      const output = outputs.get(call.callId) ?? "";
      const bodySha256 = /(?:^|[^a-f0-9])([a-f0-9]{64})(?![a-f0-9])/u.exec(
        output,
      )?.[1];
      if (
        path !== null &&
        bodyFile !== undefined &&
        bodySha256 !== undefined &&
        keyHeader !== undefined
      )
        posts.push({
          callId: call.callId,
          order,
          path,
          bodyFile,
          bodySha256,
          keyHeader,
          output,
          responseFile,
        });
    }
  }
  const signatures = new Map<string, typeof posts>();
  for (const post of posts) {
    const signature = `${post.path}\n${post.bodyFile}\n${post.bodySha256}\n${post.keyHeader}`;
    const existing = signatures.get(signature) ?? [];
    existing.push(post);
    signatures.set(signature, existing);
  }
  const replayedRequests: TranscriptRequestResponse[] = [];
  for (const requests of signatures.values()) {
    const timedOut = requests.some(
      (request) =>
        request.output.includes("curl_exit=28") &&
        request.output.includes("http_code=000"),
    );
    if (!timedOut) continue;
    for (const request of requests) {
      const statusText = /(?:^|\n)http_code=(\d{3})(?:\n|$)/u.exec(
        request.output,
      )?.[1];
      if (
        !request.output.includes("curl_exit=0") ||
        statusText === undefined ||
        request.responseFile === undefined
      )
        continue;
      const responseReaders = calls.filter(
        (call) =>
          call.order > request.order &&
          shellArguments(call.command).includes(
            request.responseFile as string,
          ) &&
          /\bjq\b/u.test(call.command) &&
          /(?:requestId|\.meta\.requestId)/u.test(call.command),
      );
      for (const reader of responseReaders) {
        for (const match of reader.output.matchAll(
          /["']requestId["']\s*:\s*["'](req_[0-9A-HJKMNP-TV-Z]{26})["']/gu,
        )) {
          if (match[1] !== undefined)
            replayedRequests.push({
              method: "POST",
              path: request.path,
              status: Number(statusText),
              requestId: match[1],
            });
        }
      }
    }
  }
  return {
    postPaths: [...new Set(allPostPaths)],
    replayedRequests,
  };
};

const claimResourceId = (
  claim: ClientValidationRecordV1["requestClaims"][number],
  resourceRefs: Record<string, string>,
): string => {
  const ideaId = resourceRefs.ideaId;
  const projectId = resourceRefs.projectId;
  if (claim.path === "/api/v1/ideas" && ideaId !== undefined) return ideaId;
  if (ideaId !== undefined && claim.path.startsWith(`/api/v1/ideas/${ideaId}/`))
    return ideaId;
  if (
    projectId !== undefined &&
    claim.path.startsWith(`/api/v1/projects/${projectId}/`)
  )
    return projectId;
  throw new Error(`CLIENT_EVIDENCE_REQUEST_PATH:${claim.requestId}`);
};

const readCollectionItems = async (input: {
  baseOrigin: string;
  path: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<unknown[]> => {
  const items: unknown[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `${input.path}?${query.toString()}`,
      fetchImpl: input.fetchImpl,
    });
    if (response.status !== 200)
      throw new Error(`CLIENT_EVIDENCE_COLLECTION:${input.path}`);
    const data = object(response.json.data, "CLIENT_EVIDENCE_COLLECTION");
    if (!Array.isArray(data.items))
      throw new Error(`CLIENT_EVIDENCE_COLLECTION:${input.path}`);
    items.push(...data.items);
    const page = object(data.page, "CLIENT_EVIDENCE_COLLECTION");
    if (page.nextCursor === null) return items;
    if (
      typeof page.nextCursor !== "string" ||
      page.nextCursor.length === 0 ||
      seen.has(page.nextCursor)
    )
      throw new Error(`CLIENT_EVIDENCE_COLLECTION_CURSOR:${input.path}`);
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error(`CLIENT_EVIDENCE_COLLECTION_LIMIT:${input.path}`);
};

const readProjectAuditEvents = async (input: {
  baseOrigin: string;
  projectId: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<AuditEventFact[]> => {
  const events: AuditEventFact[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `/api/v1/projects/${input.projectId}/history?${query.toString()}`,
      fetchImpl: input.fetchImpl,
    });
    if (response.status !== 200)
      throw new Error(`CLIENT_EVIDENCE_HISTORY:${input.projectId}`);
    events.push(...auditEvents(response.json));
    const data = object(response.json.data, "CLIENT_EVIDENCE_HISTORY");
    const page = object(data.page, "CLIENT_EVIDENCE_HISTORY");
    if (page.nextCursor === null) return events;
    if (
      typeof page.nextCursor !== "string" ||
      page.nextCursor.length === 0 ||
      seen.has(page.nextCursor)
    )
      throw new Error(`CLIENT_EVIDENCE_HISTORY_CURSOR:${input.projectId}`);
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error(`CLIENT_EVIDENCE_HISTORY_LIMIT:${input.projectId}`);
};

export const verifyClientEvidence = async (input: {
  repoRoot: string;
  baseOrigin: string;
  transcriptFile: string;
  value: unknown;
  fetchImpl?: typeof fetch | undefined;
}): Promise<ClientValidationRecordV1> => {
  const record = parseClientValidationRecord(input.value);
  const transcript = await readFile(input.transcriptFile);
  if (sha256(transcript) !== record.rawTranscriptSha256)
    throw new Error("CLIENT_EVIDENCE_TRANSCRIPT_DIGEST");
  const transcriptText = transcript.toString("utf8");
  assertSanitizedEvidence(transcriptText, [], 8_388_608);
  assertTranscriptEnvelope(record, transcriptText);
  const transcriptEvents = transcriptText
    .trim()
    .split("\n")
    .map((line) =>
      object(
        JSON.parse(line) as unknown,
        "CLIENT_EVIDENCE_TRANSCRIPT_ENVELOPE",
      ),
    );
  const window = {
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  };
  const claudeExchanges =
    record.client === "CLAUDE"
      ? claudeTranscriptExchanges(transcriptEvents, window)
      : [];
  const codexFacts =
    record.client === "CODEX"
      ? codexTranscriptFacts(transcriptEvents, window)
      : null;
  const transcriptRequests = parseClientTranscriptRequests(
    record.client,
    transcriptText,
    window,
  );
  for (const expected of [
    record.runId,
    ...record.requestIds,
    ...Object.values(record.resourceRefs),
  ]) {
    if (!transcriptText.includes(expected))
      throw new Error(`CLIENT_EVIDENCE_TRANSCRIPT_BINDING:${expected}`);
  }
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", record.skillCommitSha, "HEAD"],
    {
      cwd: input.repoRoot,
      stdio: "ignore",
    },
  );
  if (
    skillTree(input.repoRoot, record.skillCommitSha) !==
    skillTree(input.repoRoot, "HEAD")
  )
    throw new Error("CLIENT_EVIDENCE_SKILL_TREE");
  const verifiedChecks = new Set<string>([
    "exact-skill-loaded",
    "transcript-secret-scan",
  ]);
  const postPaths =
    record.client === "CLAUDE"
      ? claudeTranscriptPostPaths(transcriptEvents, window)
      : (codexFacts?.postPaths ?? []);
  postPaths.push(...record.requestClaims.map((claim) => claim.path));
  if (
    postPaths.some(
      (path) =>
        /\/human-confirmations(?:\/|$)/u.test(path) ||
        /^\/api\/v1\/human-confirmations(?:\/|$)/u.test(path),
    )
  )
    throw new Error("CLIENT_EVIDENCE_HUMAN_BOUNDARY");
  verifiedChecks.add("human-boundary-respected");
  const authoritativeOperations = new Map<
    string,
    TranscriptRequestResponse[]
  >();
  const resourceBodies = new Map<string, unknown>();
  for (const id of Object.values(record.resourceRefs)) {
    const route = id.startsWith("idea_")
      ? `/api/v1/ideas/${id}`
      : id.startsWith("proj_")
        ? `/api/v1/projects/${id}`
        : null;
    if (route === null) continue;
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: route,
      fetchImpl: input.fetchImpl,
    });
    const body = JSON.stringify(response.json);
    if (response.status !== 200 || !exactValuePresent(response.json, id))
      throw new Error(`CLIENT_EVIDENCE_RESOURCE:${id}`);
    if (!body.includes("SYNTHETIC_DEMO_DATA"))
      throw new Error(`CLIENT_EVIDENCE_NOT_SYNTHETIC:${id}`);
    resourceBodies.set(id, response.json);
    if (id.startsWith("idea_")) {
      authoritativeOperations.set(
        id,
        auditEvents(response.json).flatMap((event) => {
          const operation = operationForAuditEvent(event);
          return operation === null ? [] : [operation];
        }),
      );
    }
    if (id.startsWith("proj_")) {
      const events = await readProjectAuditEvents({
        baseOrigin: input.baseOrigin,
        projectId: id,
        fetchImpl: input.fetchImpl,
      });
      authoritativeOperations.set(
        id,
        events.flatMap((event) => {
          const operation = operationForAuditEvent(event);
          return operation === null ? [] : [operation];
        }),
      );
    }
  }
  let reportBody: unknown;
  for (const id of Object.values(record.resourceRefs).filter((value) =>
    value.startsWith("rpt_"),
  )) {
    const projectId = record.resourceRefs.projectId;
    if (projectId === undefined)
      throw new Error(`CLIENT_EVIDENCE_REPORT_PROJECT:${id}`);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `/api/v1/projects/${projectId}/reports/current`,
      fetchImpl: input.fetchImpl,
    });
    const body = JSON.stringify(response.json);
    if (
      response.status !== 200 ||
      !exactValuePresent(response.json, id) ||
      !body.includes("SYNTHETIC_DEMO_DATA")
    )
      throw new Error(`CLIENT_EVIDENCE_REPORT:${id}`);
    reportBody = response.json;
  }
  for (const claim of record.requestClaims) {
    const resourceId = claimResourceId(claim, record.resourceRefs);
    if (claim.outcome === "COMMITTED") {
      if (
        !transcriptRequestClaimMatches(
          claim,
          authoritativeOperations.get(resourceId) ?? [],
        )
      )
        throw new Error(`CLIENT_EVIDENCE_REQUEST_AUTHORITY:${claim.requestId}`);
      if (
        record.client === "CLAUDE" &&
        !transcriptRequestClaimMatches(claim, transcriptRequests)
      )
        throw new Error(
          `CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${claim.requestId}`,
        );
      if (
        record.client === "CODEX" &&
        !transcriptRequestClaimMatches(
          claim,
          codexFacts?.replayedRequests ?? [],
        )
      )
        throw new Error(
          `CLIENT_EVIDENCE_COMMITTED_TRANSCRIPT:${claim.requestId}`,
        );
      continue;
    }
    if (!transcriptRequestClaimMatches(claim, transcriptRequests))
      throw new Error(`CLIENT_EVIDENCE_REJECTED_REQUEST:${claim.requestId}`);
  }

  if (record.client === "CODEX") {
    const ideaId = record.resourceRefs.ideaId;
    if (ideaId === undefined || !resourceBodies.has(ideaId))
      throw new Error("CLIENT_EVIDENCE_CODEX_IDEA");
    verifiedChecks.add("live-idea-read-reconciled");
    const ideas = await readCollectionItems({
      baseOrigin: input.baseOrigin,
      path: "/api/v1/ideas",
      fetchImpl: input.fetchImpl,
    });
    if (ideas.filter((item) => exactValuePresent(item, ideaId)).length !== 1)
      throw new Error("CLIENT_EVIDENCE_CODEX_IDEA_COLLECTION");
    verifiedChecks.add("proposer-collection-unique");
    if (
      record.requestClaims.every(
        (claim) =>
          claim.outcome !== "COMMITTED" ||
          transcriptRequestClaimMatches(
            claim,
            codexFacts?.replayedRequests ?? [],
          ),
      )
    )
      verifiedChecks.add("unknown-result-replayed");
    if (
      record.requestClaims.every(
        (claim) =>
          claim.outcome !== "COMMITTED" ||
          transcriptRequestClaimMatches(
            claim,
            codexFacts?.replayedRequests ?? [],
          ),
      )
    )
      verifiedChecks.add("exact-body-key-reused");
  } else {
    const ideaId = record.resourceRefs.ideaId;
    const projectId = record.resourceRefs.projectId;
    const reportId = record.resourceRefs.reportId;
    if (
      ideaId === undefined ||
      projectId === undefined ||
      reportId === undefined
    )
      throw new Error("CLIENT_EVIDENCE_CLAUDE_REFS");
    const promotion = record.requestClaims.find(
      (claim) =>
        claim.outcome === "COMMITTED" &&
        claim.path === `/api/v1/ideas/${ideaId}/promotions`,
    );
    const initialIdea = claudeExchanges.find(
      (exchange) =>
        exchange.method === "GET" &&
        exchange.path === `/api/v1/ideas/${ideaId}?view=executor` &&
        exchange.status === 200 &&
        exactValuePresent(exchange.body, ideaId) &&
        containsObjectFields(exchange.body, { readyToPromote: true }),
    );
    if (initialIdea !== undefined) verifiedChecks.add("ready-idea-read");
    if (
      promotion !== undefined &&
      initialIdea !== undefined &&
      containsObjectFields(initialIdea.body, {
        actorType: "HUMAN",
        role: "PROPOSER",
      })
    )
      verifiedChecks.add("promotion-attribution");
    const progressItems = await readCollectionItems({
      baseOrigin: input.baseOrigin,
      path: `/api/v1/projects/${projectId}/progress-updates`,
      fetchImpl: input.fetchImpl,
    });
    if (progressItems.length === 1) verifiedChecks.add("single-execution-fact");
    const rejectedReport = record.requestClaims.find(
      (claim) =>
        claim.outcome === "REJECTED" &&
        claim.path === `/api/v1/projects/${projectId}/reports` &&
        transcriptRequestClaimMatches(claim, transcriptRequests),
    );
    if (rejectedReport !== undefined)
      verifiedChecks.add("invalid-report-rejected");
    const rejectedExchange = claudeExchanges.find(
      (exchange) =>
        exchange.method === "POST" &&
        exchange.requestId === rejectedReport?.requestId,
    );
    const correctedExchange = claudeExchanges.find(
      (exchange) =>
        exchange.method === "POST" &&
        exchange.path === `/api/v1/projects/${projectId}/reports` &&
        exchange.status === 201 &&
        exactValuePresent(exchange.body, reportId),
    );
    if (
      rejectedExchange !== undefined &&
      correctedExchange !== undefined &&
      claudeExchanges.some(
        (exchange) =>
          exchange.method === "GET" &&
          exchange.path === `/api/v1/projects/${projectId}/reports/current` &&
          exchange.status === 200 &&
          exchange.order > rejectedExchange.order &&
          exchange.order < correctedExchange.order &&
          containsObjectFields(exchange.body, {
            displayMode: "EMPTY",
            reportId: null,
          }),
      )
    )
      verifiedChecks.add("report-remained-empty");
    if (
      correctedExchange !== undefined &&
      reportBody !== undefined &&
      exactValuePresent(reportBody, reportId)
    )
      verifiedChecks.add("corrected-report-accepted");
    const [proposerItems, executorItems] = await Promise.all([
      readCollectionItems({
        baseOrigin: input.baseOrigin,
        path: "/api/v1/experience/proposer/ideas",
        fetchImpl: input.fetchImpl,
      }),
      readCollectionItems({
        baseOrigin: input.baseOrigin,
        path: "/api/v1/experience/executor/projects",
        fetchImpl: input.fetchImpl,
      }),
    ]);
    if (
      proposerItems.filter(
        (item) =>
          exactValuePresent(item, ideaId) && exactValuePresent(item, projectId),
      ).length === 1
    )
      verifiedChecks.add("proposer-experience-reconciled");
    if (
      executorItems.filter(
        (item) =>
          exactValuePresent(item, ideaId) && exactValuePresent(item, projectId),
      ).length === 1
    )
      verifiedChecks.add("executor-experience-reconciled");
    if (
      resourceBodies.has(ideaId) &&
      resourceBodies.has(projectId) &&
      reportBody !== undefined
    )
      verifiedChecks.add("database-authority-reconciled");
  }
  for (const check of record.objectiveChecks) {
    if (!verifiedChecks.has(check.id))
      throw new Error(`CLIENT_EVIDENCE_OBJECTIVE:${check.id}`);
  }
  return record;
};

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

if (process.argv[1]?.endsWith("verify-client-evidence.ts") === true) {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const file = path.resolve(argument("--file"));
  const record = await verifyClientEvidence({
    repoRoot,
    baseOrigin: normalizeLoopbackOrigin(argument("--base-url")),
    transcriptFile: path.resolve(argument("--transcript")),
    value: JSON.parse(await readFile(file, "utf8")),
  });
  console.log(
    JSON.stringify({
      result: "PASS",
      client: record.client,
      runId: record.runId,
    }),
  );
}
