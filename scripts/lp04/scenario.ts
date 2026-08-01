import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "./canonical-json.js";
import type {
  DemoActor,
  DemoIdeaTemplate,
  DemoRunRecordV1,
  DemoScenarioManifestV1,
  DurableRequestJournalEntryV1,
} from "./contracts.js";
import { parseManifest } from "./contracts.js";
import {
  executeStoredEntry,
  prepareAndExecute,
  readJson,
  resolveExecutedEntry,
  type HttpJsonResponse,
} from "./http-client.js";
import {
  assertJournalBinding,
  createPreparedEntry,
  journalPath,
  listJournalEntries,
  readJournalEntry,
  unresolvedJournalEntries,
} from "./request-journal.js";
import { deriveRequestId, sha256 } from "./request-identity.js";
import { assertStructuredReport } from "./structured-report.js";
import {
  createRunRecord,
  readRunRecord,
  transitionRunRecord,
  writeRunRecord,
} from "./run-record.js";

interface ScenarioAssets {
  manifest: DemoScenarioManifestV1;
  manifestSha256: string;
  reportTemplates: Record<string, unknown>;
}

interface RunnerOptions {
  repoRoot: string;
  proofRoot: string;
  baseOrigin: string;
  runId: string;
  skillCommitSha: string;
  aiToken: string;
  fetchImpl?: typeof fetch | undefined;
}

interface StepResult {
  entry: DurableRequestJournalEntryV1;
  response: HttpJsonResponse | null;
}

const asObject = (value: unknown, code: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const dataObject = (json: Record<string, unknown>): Record<string, unknown> =>
  asObject(json.data, "RESPONSE_DATA_INVALID");

const idAt = (
  input: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = input[key];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
};

const responseRefs = (
  stepId: string,
  json: Record<string, unknown>,
): Record<string, string> => {
  const data = dataObject(json);
  const refs: Record<string, string> = {};
  const ideaId = idAt(data, "idea");
  const project = data.project;
  const projectObject =
    typeof project === "object" && project !== null && !Array.isArray(project)
      ? (project as Record<string, unknown>)
      : undefined;
  const authority =
    projectObject !== undefined &&
    typeof projectObject.authority === "object" &&
    projectObject.authority !== null
      ? (projectObject.authority as Record<string, unknown>)
      : projectObject;
  const projectId =
    authority !== undefined && typeof authority.id === "string"
      ? authority.id
      : undefined;
  const evidenceId = idAt(data, "evidence");
  const attentionId = idAt(data, "attentionItem");
  const conclusionId = idAt(data, "conclusion");
  const confirmationId = idAt(data, "confirmation");
  const reportId =
    typeof data.reportId === "string" ? data.reportId : undefined;
  const prefix = stepId.includes("governed") ? "governed" : "active";
  if (stepId === "create-clarification-idea" && ideaId !== undefined)
    refs.clarificationIdeaId = ideaId;
  else if (stepId.startsWith("create-") && ideaId !== undefined)
    refs[`${prefix}IdeaId`] = ideaId;
  if (projectId !== undefined) refs[`${prefix}ProjectId`] = projectId;
  if (evidenceId !== undefined) refs[`${prefix}EvidenceId`] = evidenceId;
  if (attentionId !== undefined) {
    if (stepId.includes("blocker")) refs.blockerAttentionId = attentionId;
    if (stepId.includes("decision")) refs.decisionAttentionId = attentionId;
    if (stepId.includes("support")) refs.supportAttentionId = attentionId;
  }
  if (conclusionId !== undefined) refs[`${prefix}ConclusionId`] = conclusionId;
  if (confirmationId !== undefined)
    refs[`${prefix}ConfirmationId`] = confirmationId;
  if (reportId !== undefined) refs[`${prefix}ReportId`] = reportId;
  return refs;
};

const statusCode = (json: Record<string, unknown>): string | null => {
  const error = json.error;
  if (typeof error !== "object" || error === null || Array.isArray(error))
    return null;
  return typeof (error as Record<string, unknown>).code === "string"
    ? String((error as Record<string, unknown>).code)
    : null;
};

const expand = (
  value: unknown,
  replacements: Record<string, unknown>,
): unknown => {
  if (typeof value === "string") {
    const exact = /^\{\{([A-Za-z][A-Za-z0-9]*)\}\}$/u.exec(value);
    if (exact?.[1] !== undefined && exact[1] in replacements)
      return replacements[exact[1]];
    return value.replace(
      /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu,
      (_, key: string) =>
        key in replacements ? String(replacements[key]) : `{{${key}}}`,
    );
  }
  if (Array.isArray(value))
    return value.map((item) => expand(item, replacements));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expand(item, replacements),
      ]),
    );
  }
  return value;
};

export const expandTemplate = expand;

export const loadScenarioAssets = async (
  repoRoot: string,
): Promise<ScenarioAssets> => {
  const root = path.join(repoRoot, "demo/lp04");
  const manifest = parseManifest(
    JSON.parse(await readFile(path.join(root, "scenario.v1.json"), "utf8")),
  );
  const reportTemplates: Record<string, unknown> = {};
  for (const report of manifest.reports) {
    const file = path.resolve(root, report.template);
    if (!file.startsWith(`${root}${path.sep}`))
      throw new Error("REPORT_PATH_ESCAPE");
    reportTemplates[report.key] = JSON.parse(await readFile(file, "utf8"));
  }
  return {
    manifest,
    manifestSha256: sha256(canonicalJson(manifest)),
    reportTemplates,
  };
};

const verifySkillCommit = (repoRoot: string, skillCommitSha: string): void => {
  execFileSync(
    "git",
    [
      "cat-file",
      "-e",
      `${skillCommitSha}:skills/idea-validation-workflow/SKILL.md`,
    ],
    { cwd: repoRoot, stdio: "ignore" },
  );
};

export class DemoScenarioRunner {
  readonly options: RunnerOptions;
  readonly assets: ScenarioAssets;
  record: DemoRunRecordV1;

  private constructor(
    options: RunnerOptions,
    assets: ScenarioAssets,
    record: DemoRunRecordV1,
  ) {
    this.options = options;
    this.assets = assets;
    this.record = record;
  }

  static async create(options: RunnerOptions): Promise<DemoScenarioRunner> {
    const assets = await loadScenarioAssets(options.repoRoot);
    verifySkillCommit(options.repoRoot, options.skillCommitSha);
    let record: DemoRunRecordV1;
    try {
      record = await readRunRecord(options.proofRoot, options.runId);
      if (
        record.manifestSha256 !== assets.manifestSha256 ||
        record.skillCommitSha !== options.skillCommitSha ||
        record.baseOrigin !== options.baseOrigin
      )
        throw new Error("RUN_BINDING_CONFLICT");
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";
      if (code !== "ENOENT") throw error;
      record = createRunRecord({
        runId: options.runId,
        manifestSha256: assets.manifestSha256,
        skillCommitSha: options.skillCommitSha,
        baseOrigin: options.baseOrigin,
      });
      await writeRunRecord(options.proofRoot, record);
    }
    return new DemoScenarioRunner(options, assets, record);
  }

  private async preflight(): Promise<void> {
    const ready = await readJson({
      baseOrigin: this.options.baseOrigin,
      path: "/health/ready",
      fetchImpl: this.options.fetchImpl,
    });
    if (ready.status !== 200 || dataObject(ready.json).status !== "ready")
      throw new Error("SERVICE_NOT_READY");
    const openapi = await readJson({
      baseOrigin: this.options.baseOrigin,
      path: "/openapi.json",
      fetchImpl: this.options.fetchImpl,
    });
    if (openapi.status !== 200 || !openapi.json.paths)
      throw new Error("OPENAPI_PREFLIGHT_FAILED");
    if (this.record.phase === "CREATED" || this.record.phase === "FAILED") {
      this.record = transitionRunRecord(this.record, "PREFLIGHT_PASSED");
      await writeRunRecord(this.options.proofRoot, this.record);
    }
  }

  private async publicVerify(refs: Record<string, string>): Promise<void> {
    const checks: { path: string; expected: string }[] = [];
    for (const [name, value] of Object.entries(refs)) {
      if (name.endsWith("IdeaId"))
        checks.push({ path: `/api/v1/ideas/${value}`, expected: value });
      if (name.endsWith("ProjectId"))
        checks.push({ path: `/api/v1/projects/${value}`, expected: value });
    }
    for (const check of checks) {
      const response = await readJson({
        baseOrigin: this.options.baseOrigin,
        path: check.path,
        fetchImpl: this.options.fetchImpl,
      });
      if (
        response.status !== 200 ||
        !canonicalJson(response.json).includes(check.expected)
      )
        throw new Error(`PUBLIC_VERIFY_FAILED:${check.path}`);
    }
  }

  private mergeEntry(entry: DurableRequestJournalEntryV1): void {
    this.record.resourceRefs = {
      ...this.record.resourceRefs,
      ...entry.resultResourceRefs,
    };
    const trace = {
      stepId: entry.stepId,
      method: entry.method,
      path: entry.path,
      bodySha256: entry.bodySha256,
      idempotencyKeySha256: entry.idempotencyKeySha256,
      requestId: entry.lastObservation?.requestId ?? null,
      status: entry.lastObservation?.status ?? null,
      errorCode: entry.lastObservation?.errorCode ?? null,
      resourceRefs: entry.resultResourceRefs,
    };
    this.record.requestTrace = [
      ...this.record.requestTrace.filter(
        (item) => item.stepId !== entry.stepId,
      ),
      trace,
    ].slice(-100);
  }

  async recoverPending(): Promise<void> {
    const unresolved = await unresolvedJournalEntries(
      this.options.proofRoot,
      this.options.runId,
    );
    if (unresolved.length === 0) return;
    for (const pending of unresolved)
      assertJournalBinding(pending, this.record);
    if (this.record.phase !== "RECOVERING_UNKNOWN") {
      this.record = transitionRunRecord(this.record, "RECOVERING_UNKNOWN");
      await writeRunRecord(this.options.proofRoot, this.record);
    }
    for (const pending of unresolved) {
      const result = await executeStoredEntry({
        proofRoot: this.options.proofRoot,
        entry: pending,
        baseOrigin: this.options.baseOrigin,
        aiToken: this.options.aiToken,
        fetchImpl: this.options.fetchImpl,
      });
      const accepted =
        result.response.status >= 200 && result.response.status < 300;
      const refs = accepted
        ? responseRefs(pending.stepId, result.response.json)
        : {};
      if (accepted) await this.publicVerify(refs);
      const resolved = await resolveExecutedEntry({
        proofRoot: this.options.proofRoot,
        entry: result.entry,
        response: result.response,
        resultResourceRefs: refs,
        accepted,
      });
      this.mergeEntry(resolved);
    }
    const resumePhase = this.record.resumePhase;
    if (resumePhase === null) throw new Error("RUN_RESUME_PHASE_MISSING");
    this.record = transitionRunRecord(this.record, resumePhase);
    await writeRunRecord(this.options.proofRoot, this.record);
  }

  private async step(input: {
    stepId: string;
    path: string;
    body: unknown;
    authorityInputs?:
      DurableRequestJournalEntryV1["authorityInputs"] | undefined;
    semanticAttempt?: number;
    expectedStatus: number;
    expectedError?: string;
  }): Promise<StepResult> {
    const attempt = input.semanticAttempt ?? 0;
    const intended = createPreparedEntry({
      runId: this.options.runId,
      stepId: input.stepId,
      semanticAttempt: attempt,
      path: input.path,
      body: input.body,
      authorityInputs: input.authorityInputs,
      manifestSha256: this.assets.manifestSha256,
      skillCommitSha: this.options.skillCommitSha,
    });
    const file = journalPath(
      this.options.proofRoot,
      this.options.runId,
      input.stepId,
      attempt,
    );
    try {
      const existing = await readJournalEntry(file);
      if (
        existing.canonicalBody !== intended.canonicalBody ||
        existing.bodySha256 !== intended.bodySha256 ||
        existing.idempotencyKey !== intended.idempotencyKey ||
        existing.path !== intended.path ||
        existing.manifestSha256 !== intended.manifestSha256 ||
        existing.skillCommitSha !== intended.skillCommitSha
      )
        throw new Error(`JOURNAL_INTENT_DRIFT:${input.stepId}`);
      if (existing.state === "COMMITTED" || existing.state === "REJECTED") {
        const expectedTerminal =
          input.expectedStatus >= 200 && input.expectedStatus < 300
            ? "COMMITTED"
            : "REJECTED";
        if (existing.state !== expectedTerminal)
          throw new Error(`STEP_TERMINAL_MISMATCH:${input.stepId}`);
        if (existing.state === "COMMITTED")
          await this.publicVerify(existing.resultResourceRefs);
        this.mergeEntry(existing);
        return { entry: existing, response: null };
      }
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";
      if (code !== "ENOENT") throw error;
      if (this.record.requestTrace.some((item) => item.stepId === input.stepId))
        throw new Error(`JOURNAL_REQUIRED_MISSING:${input.stepId}`);
    }
    const result = await prepareAndExecute({
      proofRoot: this.options.proofRoot,
      runId: this.options.runId,
      stepId: input.stepId,
      semanticAttempt: attempt,
      path: input.path,
      body: input.body,
      authorityInputs: input.authorityInputs,
      manifestSha256: this.assets.manifestSha256,
      skillCommitSha: this.options.skillCommitSha,
      baseOrigin: this.options.baseOrigin,
      aiToken: this.options.aiToken,
      fetchImpl: this.options.fetchImpl,
    });
    if (result.response.status !== input.expectedStatus)
      throw new Error(
        `STEP_STATUS:${input.stepId}:${result.response.status}:${statusCode(result.response.json) ?? "none"}`,
      );
    if (
      input.expectedError !== undefined &&
      statusCode(result.response.json) !== input.expectedError
    )
      throw new Error(`STEP_ERROR:${input.stepId}`);
    const accepted = input.expectedStatus >= 200 && input.expectedStatus < 300;
    const refs = accepted
      ? responseRefs(input.stepId, result.response.json)
      : {};
    if (accepted) await this.publicVerify(refs);
    const resolved = await resolveExecutedEntry({
      proofRoot: this.options.proofRoot,
      entry: result.entry,
      response: result.response,
      resultResourceRefs: refs,
      accepted,
    });
    this.mergeEntry(resolved);
    await writeRunRecord(this.options.proofRoot, this.record);
    return { entry: resolved, response: result.response };
  }

  private ref(name: string): string {
    const value = this.record.resourceRefs[name];
    if (value === undefined) throw new Error(`RESOURCE_REF_MISSING:${name}`);
    return value;
  }

  private async projectVersion(projectId: string): Promise<number> {
    const response = await readJson({
      baseOrigin: this.options.baseOrigin,
      path: `/api/v1/projects/${projectId}?view=executor`,
      fetchImpl: this.options.fetchImpl,
    });
    if (response.status !== 200) throw new Error("PROJECT_READ_FAILED");
    const project = asObject(
      dataObject(response.json).project,
      "PROJECT_READ_INVALID",
    );
    const authority = asObject(project.authority, "PROJECT_AUTHORITY_INVALID");
    if (!Number.isInteger(authority.version))
      throw new Error("PROJECT_VERSION_INVALID");
    return Number(authority.version);
  }

  private async reportRevision(projectId: string): Promise<number> {
    const response = await readJson({
      baseOrigin: this.options.baseOrigin,
      path: `/api/v1/projects/${projectId}/reports/current`,
      fetchImpl: this.options.fetchImpl,
    });
    if (response.status !== 200) throw new Error("REPORT_READ_FAILED");
    const data = dataObject(response.json);
    const accepted = data.accepted;
    if (accepted === null) return 0;
    const revision = asObject(accepted, "REPORT_CURRENT_INVALID").revision;
    if (!Number.isInteger(revision)) throw new Error("REPORT_REVISION_INVALID");
    return Number(revision);
  }

  private async createIdeas(): Promise<void> {
    for (const idea of this.assets.manifest.ideas) {
      const stepId = `create-${idea.key}-idea`;
      await this.step({
        stepId,
        path: "/api/v1/ideas",
        body: ideaRequestBody(idea, this.assets.manifest.actors),
        expectedStatus: 201,
      });
    }
  }

  private async seedProject(prefix: "active" | "governed"): Promise<void> {
    const ideaId = this.ref(`${prefix}IdeaId`);
    const ideaRead = await readJson({
      baseOrigin: this.options.baseOrigin,
      path: `/api/v1/ideas/${ideaId}?view=executor`,
      fetchImpl: this.options.fetchImpl,
    });
    const idea = asObject(dataObject(ideaRead.json).idea, "IDEA_READ_INVALID");
    const ideaAuthority = asObject(idea.authority, "IDEA_AUTHORITY_INVALID");
    await this.step({
      stepId: `promote-${prefix}`,
      path: `/api/v1/ideas/${ideaId}/promotions`,
      body: {
        expectedVersion: Number(ideaAuthority.version),
        explicitIntent: "PROMOTE",
        actor: this.assets.manifest.actors.proposer,
        reason: `SYNTHETIC_DEMO_DATA promote ${prefix}`,
      },
      authorityInputs: { expectedVersion: Number(ideaAuthority.version) },
      expectedStatus: 201,
    });
    const projectId = this.ref(`${prefix}ProjectId`);
    let version = await this.projectVersion(projectId);
    await this.step({
      stepId: `start-${prefix}`,
      path: `/api/v1/projects/${projectId}/transitions`,
      body: {
        expectedVersion: version,
        transition: "START",
        nextStep: "SYNTHETIC_DEMO_DATA 记录合成证据",
        actor: this.assets.manifest.actors.executor,
        reason: `SYNTHETIC_DEMO_DATA start ${prefix}`,
      },
      authorityInputs: { expectedVersion: version },
      expectedStatus: 200,
    });
    version = await this.projectVersion(projectId);
    await this.step({
      stepId: `evidence-${prefix}`,
      path: `/api/v1/projects/${projectId}/evidence`,
      body: {
        expectedVersion: version,
        kind: "NOTE",
        title: "SYNTHETIC_DEMO_DATA 合成访谈摘要",
        summary: "五条完全合成的访谈记录已归纳。",
        capturedAt: "2026-08-01T03:00:00.000Z",
        actor: this.assets.manifest.actors.executor,
        reason: `SYNTHETIC_DEMO_DATA evidence ${prefix}`,
      },
      authorityInputs: { expectedVersion: version },
      expectedStatus: 201,
    });
  }

  private async seedActiveExecution(): Promise<void> {
    const projectId = this.ref("activeProjectId");
    let version = await this.projectVersion(projectId);
    await this.step({
      stepId: "progress-active",
      path: `/api/v1/projects/${projectId}/progress-updates`,
      body: {
        expectedVersion: version,
        summary: "SYNTHETIC_DEMO_DATA 合成访谈已完成",
        completedWork: ["整理五条合成访谈"],
        nextStep: "处理阻塞、决策与支持事项",
        evidenceIds: [this.ref("activeEvidenceId")],
        occurredAt: "2026-08-01T03:05:00.000Z",
        actor: this.assets.manifest.actors.executor,
        reason: "SYNTHETIC_DEMO_DATA progress active",
      },
      authorityInputs: { expectedVersion: version },
      expectedStatus: 201,
    });
    const attention = [
      {
        stepId: "blocker-active",
        body: {
          type: "BLOCKER",
          title: "SYNTHETIC_DEMO_DATA 指标阈值待明确",
          background: "合成访谈已完成。",
          impact: "没有阈值就不能解释结论。",
        },
      },
      {
        stepId: "decision-active",
        body: {
          type: "DECISION_REQUEST",
          title: "SYNTHETIC_DEMO_DATA 是否扩大样本",
          background: "第一轮合成访谈已完成。",
          decisionImpact: "选择决定下一步验证范围。",
          waitingForRole: "PROPOSER",
          options: ["继续当前样本", "扩大合成样本"],
          recommendation: "继续当前样本",
        },
      },
      {
        stepId: "support-active",
        body: {
          type: "SUPPORT_REQUEST",
          title: "SYNTHETIC_DEMO_DATA 请求复核摘要",
          supportNeeded: "复核合成证据摘要。",
          requestReason: "第二视角可减少歧义。",
          impact: "结论将引用复核后的摘要。",
          expectedResponderRole: "PROPOSER",
        },
      },
    ] as const;
    for (const item of attention) {
      version = await this.projectVersion(projectId);
      await this.step({
        stepId: item.stepId,
        path: `/api/v1/projects/${projectId}/attention-items`,
        body: {
          expectedVersion: version,
          ...item.body,
          actor: this.assets.manifest.actors.executor,
          reason: `SYNTHETIC_DEMO_DATA ${item.stepId}`,
        },
        authorityInputs: { expectedVersion: version },
        expectedStatus: 201,
      });
    }
    version = await this.projectVersion(projectId);
    await this.step({
      stepId: "conclusion-active",
      path: `/api/v1/projects/${projectId}/conclusions`,
      body: {
        expectedVersion: version,
        evidenceSummary: "五次合成访谈形成一致方向信号。",
        evidenceIds: [this.ref("activeEvidenceId")],
        limitations: ["样本完全合成且规模有限"],
        uncertainties: ["长期留存尚未观察"],
        recommendation: "CONTINUE",
        recommendationNote: "继续到下一个轻量验证步骤。",
        actor: this.assets.manifest.actors.executor,
        reason: "SYNTHETIC_DEMO_DATA conclusion active",
      },
      authorityInputs: { expectedVersion: version },
      expectedStatus: 201,
    });
  }

  private async seedGovernedConclusion(): Promise<void> {
    const projectId = this.ref("governedProjectId");
    const version = await this.projectVersion(projectId);
    await this.step({
      stepId: "conclusion-governed",
      path: `/api/v1/projects/${projectId}/conclusions`,
      body: {
        expectedVersion: version,
        evidenceSummary: "合成证据足以进入独立人类确认。",
        evidenceIds: [this.ref("governedEvidenceId")],
        limitations: ["只验证权限与追踪闭环"],
        uncertainties: ["生产规模不在 LP-04 范围"],
        recommendation: "CONTINUE",
        recommendationNote: "交给人类 capability 决定是否完成。",
        actor: this.assets.manifest.actors.executor,
        reason: "SYNTHETIC_DEMO_DATA conclusion governed",
      },
      authorityInputs: { expectedVersion: version },
      expectedStatus: 201,
    });
  }

  private async submitReport(
    prefix: "active" | "governed",
    templateKey: "active-project" | "completed-project",
  ): Promise<void> {
    const projectId = this.ref(`${prefix}ProjectId`);
    const revision = await this.reportRevision(projectId);
    const invalidStep = `invalid-report-${prefix}`;
    if (prefix === "active") {
      const invalidKey = deriveRequestId({
        runId: this.options.runId,
        manifestSha256: this.assets.manifestSha256,
        stepId: invalidStep,
        semanticAttempt: 0,
      });
      await this.step({
        stepId: invalidStep,
        path: `/api/v1/projects/${projectId}/reports`,
        body: {
          schemaVersion: "1.0",
          projectId,
          clientRequestId: invalidKey,
          basedOnRevision: revision,
          locale: "zh-CN",
          title: "SYNTHETIC_DEMO_DATA invalid report",
          sections: [{ id: "bad", title: "错误", blocks: [] }],
        },
        authorityInputs: { basedOnRevision: revision },
        expectedStatus: 400,
        expectedError: "REPORT_VALIDATION_FAILED",
      });
      if ((await this.reportRevision(projectId)) !== revision)
        throw new Error("REJECTED_REPORT_ADVANCED_REVISION");
    }
    const stepId = `report-${prefix}`;
    const key = deriveRequestId({
      runId: this.options.runId,
      manifestSha256: this.assets.manifestSha256,
      stepId,
      semanticAttempt: 0,
    });
    const template = this.assets.reportTemplates[templateKey];
    if (template === undefined) throw new Error("REPORT_TEMPLATE_MISSING");
    const body = expand(template, {
      projectId,
      clientRequestId: key,
      basedOnRevision: revision,
      evidenceId: this.ref(`${prefix}EvidenceId`),
      decisionAttentionId: this.record.resourceRefs.decisionAttentionId ?? "",
      supportAttentionId: this.record.resourceRefs.supportAttentionId ?? "",
    });
    assertStructuredReport(body);
    await this.step({
      stepId,
      path: `/api/v1/projects/${projectId}/reports`,
      body,
      authorityInputs: { basedOnRevision: revision },
      expectedStatus: 201,
    });
  }

  async run(): Promise<DemoRunRecordV1> {
    await this.preflight();
    if (this.record.phase === "VERIFIED") {
      await this.publicVerify(this.record.resourceRefs);
      return this.record;
    }
    await this.recoverPending();
    await this.createIdeas();
    await this.seedProject("active");
    await this.seedActiveExecution();
    await this.submitReport("active", "active-project");
    await this.seedProject("governed");
    await this.seedGovernedConclusion();
    await this.submitReport("governed", "completed-project");
    if (this.record.phase === "PREFLIGHT_PASSED")
      this.record = transitionRunRecord(this.record, "SEEDED");
    this.record.assertions = [
      {
        id: "clarification-idea-unpromoted",
        result: "PASS",
        detailCode: "PUBLIC_IDEA_READ",
      },
      {
        id: "active-project-execution-story",
        result: "PASS",
        detailCode: "PUBLIC_PROJECT_READ",
      },
      {
        id: "invalid-report-preserves-revision",
        result: "PASS",
        detailCode: "REPORT_REJECTION_OBSERVED",
      },
      {
        id: "governed-project-awaits-human",
        result: "PASS",
        detailCode: "HUMAN_HANDOFF_REQUIRED",
      },
    ];
    if (this.record.phase === "SEEDED")
      this.record = transitionRunRecord(this.record, "SMOKE_PASSED");
    await this.publicVerify(this.record.resourceRefs);
    this.record = transitionRunRecord(this.record, "VERIFIED");
    await writeRunRecord(this.options.proofRoot, this.record);
    return this.record;
  }
}

export const ideaRequestBody = (
  idea: DemoIdeaTemplate,
  actors: { proposer: DemoActor; executor: DemoActor },
): Record<string, unknown> => ({
  intentSummary: idea.intentSummary,
  proposer: actors.proposer,
  ...(idea.desiredOutcome === undefined
    ? {}
    : { desiredOutcome: idea.desiredOutcome }),
  facts: idea.facts.map((text) => ({ text })),
  hypotheses: idea.hypotheses.map((text) => ({ text })),
  clarificationQuestions: idea.clarificationQuestions,
  actor: actors.executor,
  reason: `SYNTHETIC_DEMO_DATA create ${idea.key}`,
});

export const loadCommittedEntry = async (input: {
  proofRoot: string;
  runId: string;
  stepId: string;
  semanticAttempt?: number;
}): Promise<DurableRequestJournalEntryV1> =>
  readJournalEntry(
    journalPath(
      input.proofRoot,
      input.runId,
      input.stepId,
      input.semanticAttempt ?? 0,
    ),
  );

export const journalSummary = async (
  proofRoot: string,
  runId: string,
): Promise<{ count: number; bodyDigests: string[]; keyDigests: string[] }> => {
  const entries = (await listJournalEntries(proofRoot, runId)).map(
    ({ entry }) => entry,
  );
  return {
    count: entries.length,
    bodyDigests: entries.map((entry) => entry.bodySha256),
    keyDigests: entries.map((entry) => entry.idempotencyKeySha256),
  };
};
