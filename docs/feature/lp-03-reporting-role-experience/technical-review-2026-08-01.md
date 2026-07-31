# Technical Plan Review: LP-03 结构化汇报与双角色体验（Cycle 2）

- Review date: 2026-08-01
- Reviewed artifact(s):
  - `docs/feature/lp-03-reporting-role-experience/requirements.md`
  - `docs/feature/lp-03-reporting-role-experience/design.md`
  - `docs/feature/lp-03-reporting-role-experience/implementation-plan.md`
- Reviewed plan commit: `4d642f95fa8c6886eee312cb118b8d4605a2a7f1`
- Reviewed composite SHA-256: `2be2b770e7658b39b08540df0df64b289602cd1b1f0041483bb639134cda47da`
- Previous result: `b598d13e673c1a41c418e11e111581d502a4d9633df6b20aa374efb06ae99d14`
- Review request: `767650bddc3ab18ec291950bc177634594151d067f3842c7c6dec455ac655ec7`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 1 的提交主体/审计归因、运行时双 render-model 契约和 Idea 分类谓词三项缺口均已在源设计、实施 slices 与验证矩阵中闭环。mandatory criteria 全部满足；仅剩一处旧版 response-descriptor 文案与随后定义的 closed DTO 不一致，属于局部 Minor，不影响实现交接。

## Handoff Judgment

该 exact snapshot 可以交给开发者进入实现。Cycle 2 没有扩大需求范围，而是把上一轮
缺失的跨层决定固化为可验证协议：

- bearer 认证成功后由服务端附加 closed `WritePrincipal`，报告正文和 `generator`
  永远不能声明 actor；revision submitter、audit actor、固定 reason、Fastify request ID
  和已匹配 idempotency key 由同一 typed context 原子写入；
- `ReportCurrentDto` 分离 `accepted`、`primary` 与 nullable
  `runtimeFallback`，每个 render slot 有自己的 revision、compiler、safe model 和
  hydrated refs，并定义了数据库选择、空值、组件异常和浏览器验收规则；
- proposer category 只使用现有 `intakeStatus`、`projectId` 与 linked project
  status，promoted branch 优先，所有分类互斥且有 invariant-failure fixtures。

这三项修订已经同步到 persistence、auth/config、application port、API DTO、DB query、
Web error boundary、contract/integration/component/browser tests 与 AC evidence mapping。
开发者不再需要自行决定 actor 来源、runtime fallback shape 或 Idea 分类 truth table。

本轮仅发现一处局部文案残留：Design §6.1 在 closed `ReportCurrentDto` 前仍称
`acceptedRevision`、`renderedRevision`、`fallbackFromRevision` 和 bounded
diagnostic 是“separate fields”，但紧随其后的 authoritative field table 不包含这些字段，
而改用嵌套 `accepted.revision`、`primary.revision`、
`runtimeFallback.revision` 和 `compatibilityCode`。详细 closed table 与实施计划一致，
因此记为 Minor、不中断 Pass。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的问题、12 个场景、Goals、32 项需求、16 项 AC、Non-goals、失败恢复和 LP-02 关闭依赖保持完整。 | 无。 |
| Data structure clarity | Pass | Design §4–6 定义 canonical report、三张表、principal snapshot、audit mapping、closed accepted/primary/runtimeFallback DTO 和 experience truth table。 | 仅 TPR-004 旧文案清理。 |
| New/changed fields highlighted | Pass | revision actor 五字段、两项 config、typed write context、render slots、hydrated refs、nullability/default/owner/validation/migration 均明确。 | 无阻塞缺口。 |
| Data flow clarity | Pass | validation flow、submission sequence、principal → revision/audit mapping、dual-slot DB selection/hydration 和 React local fallback 均有源到消费者路径。 | 无。 |
| Core object lifecycle | Pass | report aggregate/revision、accepted/renderable pointers、幂等记录、完成态冻结/重开续写、协议 fallback、runtime exception 与 rollback 生命周期完整。 | 无。 |
| Flow diagram | Pass | Architecture、validation flow、credential-aware submission sequence 和 rollout/rollback 描述足以覆盖主路径。 | 无需新增图。 |
| Developer handoff readiness | Pass | 八个 slices、文件归属、exact dependency versions、slice gates、E2E matrix、AC mapping、PR/rollback 流程完整。 | TPR-004 可在实现 DTO 时顺手统一。 |

## Cycle 1 Finding Closure

| Previous finding | Status | Cycle 2 evidence |
| --- | --- | --- |
| `TPR-001` 报告提交者与审计 actor 没有权威数据来源 | Closed | Design §3.6/§5 定义 credential-bound `WritePrincipal`、五个 revision actor columns、config/default/validation、fixed audit reason/request/key/summaries；Implementation S2–S3 定义 typed context、auth attachment、migration、正负/rollback/API tests。 |
| `TPR-002` runtime previous render model 没有响应契约 | Closed | Design §6.1 定义 closed `ReportCurrentDto`、accepted/primary/runtimeFallback slots、每槽 fields/refs、selection/nullability；Implementation S3/S6/S7 定义 API、query、error boundary 和 CURRENT/FALLBACK/无 candidate tests。 |
| `TPR-003` 普通 Idea 分类引用不存在的 `DRAFT` | Closed | Design §6.2 与 Implementation S4 使用 `projectId`、`intakeStatus=IDEA|NEEDS_CLARIFICATION` 和 linked project status 的互斥 truth table，并覆盖 stale intake、impossible/duplicate relation fixtures。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- Requirements SHA 与 Cycle 1 相同，acceptance criteria digest 未变化；本轮只修订 design
  与 implementation plan，没有改变已确认需求。
- Cycle 2 commit 是 Cycle 1 exact plan commit 的后代；三个整改 commit 仅修改两份计划
  文档，`git diff --check` 通过。
- canonical submission Schema 继续排除 transport/runtime/actor 字段，避免身份污染
  presentation-only source；principal 只从成功 bearer auth 的 server context 产生。
- `submitted_by_*` 与现有五字段 `ActorDto` / audit columns 对齐，type/role/delegation 固定，
  display/client 配置有默认、长度和 startup failure 规则。
- 双 render-slot query 定义 accepted → greatest supported primary → strictly-lower runtime
  candidate，每槽独立 batch hydration，UI exception 不修改 server displayMode 或数据库。
- Experience category promoted branch 优先；existing unique relation 与 fail-closed invariant
  defense 防止一项多类或静默重复。
- 原有 JSON Schema、有限 Markdown、安全 DOM、reference ownership、append-only revision、
  idempotency/locks、CSP/static hosting、accessibility、migration/rollback 和 LP-01/LP-02
  compatibility 均保持完整。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-004 | Minor | Closed current-response table 前仍保留旧 scalar descriptor 文案 | Design §6.1 先称 `acceptedRevision`、`renderedRevision`、`fallbackFromRevision`、`compatibilityCode` 和 bounded diagnostic 是 separate fields；随后 authoritative `ReportCurrentDto` table 只列 `projectId/reportId/displayMode/accepted/primary/runtimeFallback/compatibilityCode`，Implementation S3 也采用后者。 | 若照旧句生成类型，OpenAPI 可能多出重复 revision scalars 或未定义 diagnostic；详细 closed table、selection 和 tests 已足够明确，因此不会迫使架构重做。 | 删除旧句，或明确把前三个名称映射为 `accepted.revision`、`primary.revision`、`runtimeFallback.revision`，并明确 bounded diagnostic 是否根本不存在。以 closed table 作为唯一 TypeBox/OpenAPI authority。 | no |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| Canonical report / seven blocks | Pass | 单一 Draft 2020-12 Schema、closed objects、复杂度 bounds、`evd_` correction、safe Markdown AST 和 deterministic digest 完整。 |
| `WritePrincipal` / `ReportWriteContext` | Pass | credential origin、fixed actor type/role/delegation、display/client config/default/validation、request/key mapping 和 secret exclusion 明确。 |
| Report aggregate/revision/idempotency/audit | Pass | table fields、PK/FK/pointers、immutable trigger、actor snapshot、reason/summaries、lock order、replay 与 rollback 明确。 |
| `ReportCurrentDto` / render slots | Pass with Minor | accepted/primary/runtimeFallback closed shapes、fields、selection、nullability 和 independent hydration 完整；仅 TPR-004 旧 scalar 文案需删。 |
| Experience projections | Pass | categories/groups、authority fields、unique relation、pagination、batch previews 和 invariant failure 行为明确。 |
| Web/security/config | Pass | URL role mode、scoped confirmation、same-origin/static fallback、CSP、safe renderer、secret redaction 和 stale/error states 完整。 |

## Data Flow And Lifecycle Review

- Submission origin: valid deployment bearer produces immutable server `WritePrincipal`; route
  combines it with Fastify request ID and matched header/body idempotency identity，report source
  cannot supply any of them。
- Write path: auth → size/schema/semantic/security/reference validation → idempotency ownership →
  project/report locks → status/revision checks → immutable revision/pointers → redacted audit →
  stored replay/commit；failpoints roll back all durable effects。
- Read path: accepted row → greatest supported/renderable primary → strictly lower runtime candidate
  → slot-tagged batch hydration → closed API DTO → fixed authority region plus dynamic renderer。
- Runtime failure: error boundary only replaces dynamic primary with `runtimeFallback` or safe empty；
  accepted/pointers/revisions/displayMode remain unchanged。
- Experience flow: one server authority query joins Idea and unique project，linked project takes
  precedence；React only renders server category/group and never persists role-derived state。
- Lifecycle: first revision from 0，later CAS current accepted；completed freezes writes，LP-02
  reopen resumes sequence；history is append-only，unsupported versions and runtime failures never
  rewrite source。
- Missing transitions or ownership rules: none blocking。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: architecture diagram defines package/data boundaries；validation flow covers all
  fail-closed stages；submission sequence now includes bearer → principal before transaction and
  atomic revision/pointer/audit/replay handling。
- Recommended diagram changes: none required；dual-slot selection is sufficiently specified as an
  ordered query plus field table。

## Implementation Readiness

- Clear implementation path: yes；eight slices、file lists、implementation rules、slice gates 与
  final aggregate verification 可以直接执行。
- Affected modules/components: `packages/contracts`、new `packages/reporting`、
  `packages/application`、`packages/db`、`apps/api`、new `apps/web`、
  OpenAPI/CI/Playwright 与 feature/management docs。
- Open decisions developers would still need to make: none blocking；TPR-004 只需以 detailed
  closed table 为唯一 contract 并清理旧句。

## Verification Readiness

- Contract proof: generated report type freshness、seven-block bounds、closed current DTO、all four
  display modes、slot nullability/hydration、experience truth table 与 frozen old OpenAPI。
- Persistence proof: populated migration、immutable trigger、principal/audit equality、idempotent
  replay/conflict/contention、revision conflict、reference ownership、complete/reopen、slot query 和
  transaction failpoints。
- UI/security proof: generic seven renderers、fixed authority isolation、runtime candidate 有/无及
  server FALLBACK、keyboard/narrow layout、scoped confirmation、CSP/DOM/URL/log secret scans。
- Objective proof: exact-head `npm run verify` aggregates LP-01/LP-02/LP-03 acceptance、
  component/browser suites and management evidence update。
- Missing proof: none blocking；为 TPR-004 增加 TypeBox/OpenAPI assertion 可避免重复 scalar
  字段进入公共契约。

## Modification Recommendations

1. 实现 `ReportCurrentDto` 前清理 TPR-004 的旧 descriptor 句，并以 closed field table
   生成 TypeBox/OpenAPI。
2. 建议在 config contract tests 中分别覆盖 unset、whitespace、边界 1/120 和 121
   characters，锁定 principal display/client startup behavior。

## Re-review Requirements

无需因 TPR-004 单独重新送审；本 exact plan snapshot 已通过。若实现前改变
`WritePrincipal` 来源/字段、audit reason/mapping、`ReportCurrentDto` slot shape 或选择、
experience truth table、公共兼容或迁移策略，则必须形成新的 plan commit/digest 并重新评审。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-03 cycle 2、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `767650bddc3ab18ec291950bc177634594151d067f3842c7c6dec455ac655ec7`
  作为有效 Cycle 2 请求接受，并绑定上一结果
  `b598d13e673c1a41c418e11e111581d502a4d9633df6b20aa374efb06ae99d14`。
- remote feature branch 与 exact review worktree HEAD 均为
  `4d642f95fa8c6886eee312cb118b8d4605a2a7f1`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `144e4a5b...`、design `b8b2d08b...`、implementation plan
  `0cc413c3...`，均匹配请求；requirements 与 Cycle 1 相同。
- Cycle 2 plan commit 是 Cycle 1 `2749f21...` 的后代；diff 仅修改 design 与
  implementation plan，`git diff --check` 通过。
- 读取并核对了 Cycle 1 review、canonical requirements、现有
  `authenticateWrite` / `AppConfig`、五字段 `ActorDto`、audit schema/insert、
  Idea/project uniqueness 与现有 API composition。
- 本次是 exact-snapshot 设计复审；没有修改源计划、执行 feature 实现测试、编写代码、
  更改 feature branch 或发起 merge。
