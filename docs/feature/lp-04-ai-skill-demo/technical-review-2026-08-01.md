# Technical Plan Review: LP-04 AI Skill 与可重复演示（Cycle 1）

- Review date: 2026-08-01
- Reviewed artifact(s):
  - `docs/feature/lp-04-ai-skill-demo/requirements.md`
  - `docs/feature/lp-04-ai-skill-demo/design.md`
  - `docs/feature/lp-04-ai-skill-demo/implementation-plan.md`
- Reviewed plan commit: `ff2ca5ee246acb80cd8bbe5fa41531eee7ee5d5d`
- Reviewed composite SHA-256: `a821d32899aad6ff6405f20e4bd74667d360b88e7844fb92de67925abe36c333`
- Review request: `bb63f58cebe61d3aed1f6adc9906460c10effcffa66fc9c91d3b4b966f356911`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: Skill 边界、真实 HTTP demo、客户端证据、安全、人类确认、浏览器验证和完整门禁均已形成清晰实现路径；但未知结果请求只在内存中保留冻结字节，持久化运行记录又明确不保存请求体或请求体摘要/版本输入。进程若在请求到达 API 后、记录结果前终止，重启后无法证明或执行同 body、同 key 的安全重放，因此 AC 7 的关键恢复协议尚未闭合。

## Handoff Judgment

该 exact snapshot 暂不能交给开发者直接实现。整体方案已经相当完整：它保持 LP-01 至
LP-03 runtime/API/database/Web contract 不变，把 Skill、合成 manifest、真实 HTTP runner、
真实数据浏览器验收、Codex/Claude 实际执行证据和项目管理追踪拆成可审查 slices，并明确
AI bearer 与 human-control 能力不可互换。

唯一的阻断性交接缺口位于新增 demo runner 的未知结果恢复协议。Design 要求未知结果只能
重放完全相同的 method、path、body 和 key；Implementation 又要求 same-run restart 在重算
body 与 local record 不同时于写入前失败。但 closed `DemoRunRecordV1.requestTrace` 只保存
step、method、path、key digest、response facts 和 resource refs，并明确不保存 body；HTTP
client 的 frozen request bytes 只保留在内存中。现有写入广泛包含 `expectedVersion`，报告还
包含 `basedOnRevision`，请求已成功但响应丢失时权威版本会推进。重启后重新读取再扩展 body
会产生不同版本值，而 local record 既不能还原旧 bytes，也不能比较其 digest。

这不要求改变既有 runtime contract，但需要在计划层冻结一个安全的、写前持久化的 per-request
journal 及恢复状态机，否则实现者必须自行决定保存什么、何时落盘，以及如何区分已发送未知、
已确认成功和新意图。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 说明现状、目标、18 项 AC、Non-goals、失败恢复、安全、发布边界和 LP-03 精确依赖。 | 无。 |
| Data structure clarity | Fail | Manifest、run record、client validation record 和 fault plan 均有 closed field matrices。 | TPR-001 缺少可跨进程恢复的 request journal：canonical body bytes 或可无歧义重建它们的 immutable inputs、body digest、request state 和 write-before-send 规则。 |
| New/changed fields highlighted | Fail | 大部分新字段均标明 type、required/default、owner、validation 和 persistence。 | 未列出支撑 same-run restart 的 `bodySha256`/frozen expansion inputs、原始 `expectedVersion`/`basedOnRevision` 或等价字段，也未定义其秘密与保留策略。 |
| Data flow clarity | Fail | Skill 写入 sequence 和可重复 demo flow 覆盖 read → freeze → write → verify 与进程内故障代理。 | 未覆盖 atomic journal → send → unknown → restart → replay/reconcile 的跨进程路径。 |
| Core object lifecycle | Fail | Demo run、Skill invocation 和 client evidence 的顶层生命周期已定义。 | Demo run 的 phase 无法表达单个请求的 `PREPARED/SENT/UNKNOWN/RESOLVED` 权威，重启时无法判断应重放旧 intent 还是重新读取形成新 intent。 |
| Flow diagram | Pass with gap | Skill/API sequence 和 demo flow 均存在，主路径与 one-shot dropped response 清楚。 | TPR-001 修订后应在现有 demo flow 或 sequence 中加入 crash/restart recovery branch，无需增加泛化架构图。 |
| Developer handoff readiness | Fail | 六个 slices、文件归属、逐层 gates、真实客户端责任和最终 PR/验收边界明确。 | 恢复 journal 的 field contract、原子性与 crash oracle 仍需开发者自行发明。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- 远端 feature branch 在评审时精确指向 `ff2ca5ee246acb80cd8bbe5fa41531eee7ee5d5d`；
  deterministic review-record branch 创建前不存在。
- `ff2ca5e` 只在父提交基础上修改 Design/CHANGELOG 并新增 Implementation Plan；
  `git diff --check` 通过，LP-03 merge `818671c5...` 是该计划提交的祖先。
- Skill 采用 progressive disclosure，canonical OpenAPI/Schema 保持唯一 authority，不复制
  第二套业务状态或新增 AI bypass API。
- `DemoScenarioManifestV1`、`ClientValidationRecordV1`、loopback guard、合成标记、secret
  redaction、真实资源 re-read 和 raw transcript isolation 的字段/责任/验证边界清楚。
- human confirmation 明确终止 AI 自动化；facilitator 是独立命令和凭据路径，不能被 Skill
  或 AI bearer 调用。
- 真实 HTTP、one-shot downstream drop、错误修正、real-data Playwright、实际 Codex/Claude
  运行和全量 LP-01 至 LP-03 regression 都有客观 gates，静态/mock 结果不能冒充通过。
- frozen baseline digests 与计划声明一致：LP-01 OpenAPI `528ff0f4...`、LP-02
  `0c23e1de...`、LP-03 `fe853576...`、structured report Schema `d8481678...`。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Major | 跨进程未知结果恢复没有持久化的请求字节 authority | Design §3 invariant 5、§8 和 §9 要求同 method/path/body/key 重放；§5.2 的 `requestTrace` 只存 step/method/path/key digest/response/resource refs 且明确不存 body。Implementation §4.2 只让 HTTP client 在内存保留 frozen bytes，§4.3 却要求 same-run restart 与 local record 比较 body。现有写请求含 `expectedVersion`，report 含 `basedOnRevision`。 | 请求若已提交但进程在记录响应前终止，权威版本可能已推进。重启无法从 record 还原或验证旧 canonical body；重新读取会产生新版本 body，错误复用旧 key 将冲突，换 key 又可能重复业务意图。AC 7/11/12 只能证明单进程 proxy retry，不能证明声明的 restart/replay contract。 | 定义一个不含凭据的 per-request durable journal：至少绑定 step、method、path、raw key 的安全可恢复表示、canonical body bytes 或足以字节级重建的 immutable expansion inputs、`bodySha256`、原始 version/revision inputs 和 `PREPARED/SENT/UNKNOWN/RESOLVED` 状态；规定在 send 前原子落盘、成功/replay/public-read 后 resolve。恢复必须优先按原 bytes/key 重放或依据权威 read reconcile，只有显式 changed intent 才派生新 key。补一个在 upstream commit 后杀死 runner、重启同 run ID 并证明一条业务结果的真实 HTTP acceptance case，以及 changed-body/version counter-cases。若不希望保存 body，应给出等价且可验证的 deterministic reconstruction contract。 | yes |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| `DemoScenarioManifestV1` | Pass | schema/version、synthetic marker、actors/ideas/stories/reports/views、bounds、placeholder ownership 和兼容策略完整。 |
| `DemoRunRecordV1` | Fail | 顶层 phase、refs、assertions、atomic local proof 和 secret exclusion 明确；缺 per-request frozen body authority 与 request lifecycle，见 TPR-001。 |
| `ClientValidationRecordV1` | Pass | client/version/mode/observer/Skill commit/run/input/transcript digest/request IDs/resources/Web paths/objective checks/evidence digest 均 closed。 |
| `UnknownResultFaultPlan` | Pass for in-process fault | method/path/key digest、drop-after-upstream 和 one-shot state 清楚；它本身不能替代 restart durability proof。 |
| Existing API/domain/report contracts | Pass / unchanged | 计划只消费 frozen LP-03 REST/OpenAPI/Schema；`expectedVersion` 与 `basedOnRevision` 证实 body 对 authority snapshot 敏感。 |

## Data Flow And Lifecycle Review

- Skill flow：natural-language intent → facts/hypotheses/unknowns → authoritative read → freeze body
  and identity → existing API write → public re-read → observed report，边界清楚。
- Demo flow：loopback/digest preflight → deterministic identities → synthetic API story → dropped
  downstream response → identical retry → invalid/corrected report → facilitator → role Web → proof，
  单进程 happy/fault path 清楚。
- Missing recovery flow：canonical request 在 send 前没有持久化 authority；`requestTrace` 又可能
  在 crash 前没有可区分 entry。重启后的 `FAILED → PREFLIGHT_PASSED` 不能决定 replay 哪个
  request/version/body，也不能执行计划声称的 body comparison。
- Authority risk：public re-read 是判断最终成功的正确来源，但它不能单独恢复用于 idempotent
  replay 的旧 request bytes；特别是版本已推进、响应未记录时。
- Deletion/rollback：只删除 exact ignored proof path，不删除 API business records；rollback
  仅 revert repository assets，安全边界合格。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: architecture boundary、Skill/API sequence、reproducible demo 和 run state diagram
  足以表达正常流程及进程内 downstream-drop retry。
- Required update: 把 request journal 的 write-before-send、unknown/crash、restart、same-byte replay、
  authoritative reconcile 与 changed-intent new-key 分支加入现有 sequence/flow，并映射到 closed
  per-request states。

## Implementation Readiness

- Clear implementation path: no，直到 TPR-001 的 durable replay contract 被固定；其余 Skill、
  manifest、HTTP runner、facilitator、browser、client evidence 和 docs slices 可直接执行。
- Affected remediation surfaces: Design §5.2/§6.1/§7–9/§15，Implementation Slice 2–3 与
  final verification matrix；预期仍只涉及 `scripts/lp04`、local ignored proof 和 acceptance tests。
- Open decision developers would otherwise need to make: 保存 canonical body 还是 deterministic
  reconstruction inputs；何时原子落盘；如何表示 send/unknown/resolved；如何在 restart 时避免
  re-read 后误用旧 key 或新 key 重复 intent。

## Verification Readiness

- 已计划的有效证明：Skill validation、deterministic identity、loopback guard、Schema/route drift、
  真实 HTTP core flow、单次 response drop、same-key changed-body conflict、version re-read/new key、
  invalid/corrected report、human boundary、real-data browser、actual Codex/Claude、secret scan 和
  existing full gates。
- 缺失证明：runner 进程在 upstream 已提交但 downstream 结果未持久化时终止；新进程使用同
  run ID 恢复 exact old bytes/key，随后 public read 与 count/history 证明只有一条权威业务结果。
- 修订后的 test 还应证明 journal 不含 Authorization/token/cookie/database URL，corrupt/missing
  body authority fail-closed，changed manifest/Skill/intent 不能复用旧 request entry。

## Modification Recommendations

1. 以独立、ignored、原子写入的 request journal 承担恢复 authority；`result.json` 可继续只做
   sanitized evidence，避免把恢复数据和提交证据混为一体。
2. canonical body 若全是合成业务数据，可直接持久化；若继续禁止存 body，则保存完整 immutable
   expansion inputs、serialization version 与 digest，并用 golden test 证明跨进程重建 bytes 一致。
3. 保留现有 runtime/API/DB/Web no-change、人类确认、loopback、实际客户端证据和全量门禁设计；
   TPR-001 不需要扩大功能范围。

## Re-review Requirements

Main 修订后应创建新的 plan commit、逐文件 SHA-256 与 composite digest，并发起 Cycle 2
TechnicalPlanReviewRequest。复审至少需要看到：

1. closed per-request durable journal 字段、秘密/保留规则和 atomic write-before-send ordering；
2. `PREPARED/SENT/UNKNOWN/RESOLVED` 或等价 lifecycle，以及 restart 时 replay、reconcile、
   changed-intent/new-key 的确定性决策；
3. upstream commit 后进程终止、跨进程恢复同 body/key、最终单一业务结果的真实 HTTP case，
   连同 corrupted journal、changed body/version 的 fail-closed counter-cases。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-04 cycle 1、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `bb63f58cebe61d3aed1f6adc9906460c10effcffa66fc9c91d3b4b966f356911`
  作为有效 Cycle 1 请求接受。
- 远端 feature branch 与 isolated review worktree HEAD 均为
  `ff2ca5ee246acb80cd8bbe5fa41531eee7ee5d5d`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `8fdf05ea...`、design `ea484988...`、implementation plan
  `c3c5ff4c...`，均匹配请求；composite digest 由 Lifecycle 请求绑定。
- 读取并核对了完整 requirements/design/implementation plan、frozen artifact digests、现有
  `expectedVersion` 和 report `basedOnRevision` contracts、CI/test credential environment 与
  `npm run verify` 集成方向。
- 本次是 exact-snapshot 设计评审；没有修改源计划、执行 feature 实现、改动 feature branch、
  调用实际 Codex/Claude 客户端或发起 merge。
