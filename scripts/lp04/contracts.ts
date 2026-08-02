export type DemoRunPhase =
  | "CREATED"
  | "PREFLIGHT_PASSED"
  | "RECOVERING_UNKNOWN"
  | "SEEDED"
  | "SMOKE_PASSED"
  | "VERIFIED"
  | "FAILED";

export type DurableRequestState =
  "PREPARED" | "DISPATCHED" | "OUTCOME_UNKNOWN" | "COMMITTED" | "REJECTED";

export interface DemoActor {
  actorType: "HUMAN" | "AI";
  role: "PROPOSER" | "EXECUTOR";
  displayName: string;
  client?: string;
}

export interface DemoIdeaTemplate {
  key: string;
  intentSummary: string;
  desiredOutcome?: string;
  facts: string[];
  hypotheses: string[];
  clarificationQuestions: { prompt: string; targetField: string }[];
}

export interface DemoScenarioManifestV1 {
  schemaVersion: "1.0";
  scenarioId: string;
  locale: "zh-CN";
  syntheticMarker: "SYNTHETIC_DEMO_DATA";
  actors: { proposer: DemoActor; executor: DemoActor };
  ideas: DemoIdeaTemplate[];
  executionStories: { key: string; ideaKey: string; steps: string[] }[];
  reports: { key: string; template: string }[];
  expectedViews: Record<string, string[]>;
}

export interface SanitizedObservation {
  requestId: string | null;
  status: number | null;
  errorCode: string | null;
}

export interface DurableRequestJournalEntryV1 {
  schemaVersion: "1.0";
  runId: string;
  stepId: string;
  semanticAttempt: number;
  method: "POST";
  path: string;
  canonicalBody: string;
  bodySha256: string;
  authorityInputs: {
    expectedVersion?: number;
    basedOnRevision?: number;
  };
  idempotencyKey: string;
  idempotencyKeySha256: string;
  manifestSha256: string;
  skillCommitSha: string;
  serializationVersion: "canonical-json-v1";
  state: DurableRequestState;
  preparedAt: string;
  dispatchedAt: string | null;
  resolvedAt: string | null;
  lastObservation: SanitizedObservation | null;
  resultResourceRefs: Record<string, string>;
}

export interface RequestTraceEntry {
  stepId: string;
  method: string;
  path: string;
  bodySha256: string;
  idempotencyKeySha256: string;
  requestId: string | null;
  status: number | null;
  errorCode: string | null;
  resourceRefs: Record<string, string>;
}

export interface DemoRunRecordV1 {
  schemaVersion: "1.0";
  runId: string;
  manifestSha256: string;
  skillCommitSha: string;
  baseOrigin: string;
  phase: DemoRunPhase;
  resumePhase: Exclude<DemoRunPhase, "RECOVERING_UNKNOWN"> | null;
  startedAt: string;
  finishedAt: string | null;
  requestTrace: RequestTraceEntry[];
  resourceRefs: Record<string, string>;
  assertions: { id: string; result: "PASS" | "FAIL"; detailCode: string }[];
  result: "PENDING" | "PASS" | "FAIL";
}

export interface ClientValidationRecordV1 {
  schemaVersion: "1.0";
  client: "CODEX" | "CLAUDE";
  clientVersion: string;
  executionMode: "CLI" | "DESKTOP";
  observedBy: string;
  skillCommitSha: string;
  runId: string;
  inputIntent: string;
  startedAt: string;
  finishedAt: string;
  rawTranscriptSha256: string;
  requestIds: string[];
  requestClaims: {
    requestId: string;
    method: "POST";
    path: string;
    status: number;
    outcome: "COMMITTED" | "REJECTED";
  }[];
  resourceRefs: Record<string, string>;
  webPaths: string[];
  objectiveChecks: { id: string; result: "PASS" }[];
  result: "PASS";
  evidenceSha256: string;
}

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  code: string,
) => {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error(code);
};

const string = (value: unknown, code: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000)
    throw new Error(code);
  return value;
};

const stringArray = (value: unknown, code: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some(
      (item) =>
        typeof item !== "string" || item.length === 0 || item.length > 2_000,
    )
  )
    throw new Error(code);
  return value;
};

const actor = (value: unknown, code: string): DemoActor => {
  const input = object(value, code);
  exactKeys(input, ["actorType", "role", "displayName", "client"], code);
  if (input.actorType !== "HUMAN" && input.actorType !== "AI")
    throw new Error(code);
  if (input.role !== "PROPOSER" && input.role !== "EXECUTOR")
    throw new Error(code);
  const result: DemoActor = {
    actorType: input.actorType,
    role: input.role,
    displayName: string(input.displayName, code),
  };
  if (input.client !== undefined) result.client = string(input.client, code);
  return result;
};

export const parseManifest = (value: unknown): DemoScenarioManifestV1 => {
  const input = object(value, "MANIFEST_OBJECT");
  exactKeys(
    input,
    [
      "schemaVersion",
      "scenarioId",
      "locale",
      "syntheticMarker",
      "actors",
      "ideas",
      "executionStories",
      "reports",
      "expectedViews",
    ],
    "MANIFEST_UNKNOWN_FIELD",
  );
  if (
    input.schemaVersion !== "1.0" ||
    input.locale !== "zh-CN" ||
    input.syntheticMarker !== "SYNTHETIC_DEMO_DATA"
  )
    throw new Error("MANIFEST_VERSION_OR_MARKER");
  const actors = object(input.actors, "MANIFEST_ACTORS");
  exactKeys(actors, ["proposer", "executor"], "MANIFEST_ACTORS");
  if (
    !Array.isArray(input.ideas) ||
    input.ideas.length < 2 ||
    input.ideas.length > 6
  )
    throw new Error("MANIFEST_IDEAS");
  const ideas = input.ideas.map((candidate) => {
    const idea = object(candidate, "MANIFEST_IDEA");
    exactKeys(
      idea,
      [
        "key",
        "intentSummary",
        "desiredOutcome",
        "facts",
        "hypotheses",
        "clarificationQuestions",
      ],
      "MANIFEST_IDEA_UNKNOWN_FIELD",
    );
    if (
      !Array.isArray(idea.clarificationQuestions) ||
      idea.clarificationQuestions.length > 10
    )
      throw new Error("MANIFEST_QUESTIONS");
    const questions = idea.clarificationQuestions.map((candidateQuestion) => {
      const question = object(candidateQuestion, "MANIFEST_QUESTION");
      exactKeys(question, ["prompt", "targetField"], "MANIFEST_QUESTION");
      return {
        prompt: string(question.prompt, "MANIFEST_QUESTION"),
        targetField: string(question.targetField, "MANIFEST_QUESTION"),
      };
    });
    const parsed: DemoIdeaTemplate = {
      key: string(idea.key, "MANIFEST_IDEA_KEY"),
      intentSummary: string(idea.intentSummary, "MANIFEST_IDEA_INTENT"),
      facts: stringArray(idea.facts, "MANIFEST_IDEA_FACTS"),
      hypotheses: stringArray(idea.hypotheses, "MANIFEST_IDEA_HYPOTHESES"),
      clarificationQuestions: questions,
    };
    if (idea.desiredOutcome !== undefined)
      parsed.desiredOutcome = string(
        idea.desiredOutcome,
        "MANIFEST_IDEA_OUTCOME",
      );
    return parsed;
  });
  if (new Set(ideas.map((idea) => idea.key)).size !== ideas.length)
    throw new Error("MANIFEST_IDEA_KEYS");
  if (
    !Array.isArray(input.executionStories) ||
    input.executionStories.length === 0 ||
    input.executionStories.length > 10
  )
    throw new Error("MANIFEST_STORIES");
  const executionStories = input.executionStories.map((candidate) => {
    const story = object(candidate, "MANIFEST_STORY");
    exactKeys(story, ["key", "ideaKey", "steps"], "MANIFEST_STORY");
    return {
      key: string(story.key, "MANIFEST_STORY_KEY"),
      ideaKey: string(story.ideaKey, "MANIFEST_STORY_IDEA"),
      steps: stringArray(story.steps, "MANIFEST_STORY_STEPS"),
    };
  });
  if (
    new Set(executionStories.map((story) => story.key)).size !==
      executionStories.length ||
    executionStories.some(
      (story) => !ideas.some((idea) => idea.key === story.ideaKey),
    )
  )
    throw new Error("MANIFEST_STORY_REFERENCES");
  if (
    !Array.isArray(input.reports) ||
    input.reports.length < 2 ||
    input.reports.length > 10
  )
    throw new Error("MANIFEST_REPORTS");
  const reports = input.reports.map((candidate) => {
    const report = object(candidate, "MANIFEST_REPORT");
    exactKeys(report, ["key", "template"], "MANIFEST_REPORT");
    const template = string(report.template, "MANIFEST_REPORT_TEMPLATE");
    if (
      template.startsWith("/") ||
      template.includes("..") ||
      !template.endsWith(".json")
    )
      throw new Error("MANIFEST_REPORT_TEMPLATE");
    return {
      key: string(report.key, "MANIFEST_REPORT_KEY"),
      template,
    };
  });
  if (new Set(reports.map((report) => report.key)).size !== reports.length)
    throw new Error("MANIFEST_REPORT_KEYS");
  const expectedViewsRaw = object(input.expectedViews, "MANIFEST_VIEWS");
  if (Object.keys(expectedViewsRaw).length > 10)
    throw new Error("MANIFEST_VIEWS");
  const expectedViews = Object.fromEntries(
    Object.entries(expectedViewsRaw).map(([key, values]) => [
      key,
      stringArray(values, "MANIFEST_VIEW_VALUES"),
    ]),
  );
  return {
    schemaVersion: "1.0",
    scenarioId: string(input.scenarioId, "MANIFEST_SCENARIO"),
    locale: "zh-CN",
    syntheticMarker: "SYNTHETIC_DEMO_DATA",
    actors: {
      proposer: actor(actors.proposer, "MANIFEST_PROPOSER"),
      executor: actor(actors.executor, "MANIFEST_EXECUTOR"),
    },
    ideas,
    executionStories,
    reports,
    expectedViews,
  };
};
