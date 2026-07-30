# Technical Plan Review: LP-01 核心基础与 Idea 流程（Cycle 3）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-01-core-idea-flow/requirements.md`
  - `docs/feature/lp-01-core-idea-flow/design.md`
  - `docs/feature/lp-01-core-idea-flow/implementation-plan.md`
- Reviewed plan commit: `f68ae1b2de4a9be4ed0e8334b5e164037d9c4f7a`
- Reviewed composite SHA-256: `e40d1652df180386db01b8d6ef58a4fc7d78f32e43411b23a34dc8159f30adc6`
- Review request: `6f8c71f0942fe8c8f6c74b4667e0b9d12f78235cb96b22f32120d4fee023e89c`
- Previous result: `f481d8b00a5cfaf9d9d3ab07adb9a0fcaefffd32a2e43f289e70c929968428bc`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 2 的项目角色投影 Blocker 和三项局部契约问题均已关闭。计划现在完整定义必需的数据结构、生命周期、执行流、公共 API、实现 slices 和验证门禁，可以交给开发者开始 exact-snapshot 实现；仅保留两个不阻断的局部 Schema/example 清理项。

## Handoff Judgment

该 exact snapshot 可以进入 F4。项目列表和详情现在分别定义
`ProjectAuthorityDto`、`ProjectMutationDto`、proposer/executor discriminated focus、
nullability、嵌套 source Idea、promotion response 和 route data；Idea detail 内嵌项目
summary 也明确复用同一个 query view。LP1-AC-009 因而有唯一、可生成 OpenAPI 且可做
authority-equivalence 断言的实现目标。

Cycle 2 的 Actor optional/null、audit actor columns、write examples 和 idempotency
payload/envelope 边界也已同步到 design 与 implementation tests。开发者不再需要自行
决定公共响应、持久化列、replay 单位、对象寿命、readiness gate 或项目投影。

剩余两项都是局部澄清：create `proposer` 复用通用 `ActorInput` 时没有显式处理
`onBehalfOfRole`，以及非权威 error 示例仍使用旧 request ID/details。权威字段矩阵已
给出主要答案，它们不会阻止实现，但应在 contract Schema/example 落地时收紧。

本 Pass 只授权 commit `f68ae1b2de4a9be4ed0e8334b5e164037d9c4f7a` 和 composite
`e40d1652df180386db01b8d6ef58a4fc7d78f32e43411b23a34dc8159f30adc6`。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的 Problem、Goals、Non-goals、22 项 REQ 和 14 项 AC 清楚限定 LP-01。 | 无。 |
| Data structure clarity | Pass | Design §7.2–§7.4 定义十张表、字段、约束、changed fields；§9.4 定义 request/response/error、Actor 和 Idea/project DTO。 | 两个局部 optional/example 清理见 TPR-008–009。 |
| New/changed fields highlighted | Pass | Design §7.4 明确相对基线的保留、normalize、延后和 config/Schema move。 | 无。 |
| Data flow clarity | Pass | Design §8 锁定 auth、digest、幂等等待/replay、row lock、mutation、audit、commit 和 rollback。 | 无。 |
| Core object lifecycle | Pass | Design §7.3 对十类对象逐项声明 creation、transition、owner、observable state 和 retention/delete/expire。 | 无。 |
| Flow diagram | Pass | Design §8.4 的 sequence 和 state diagrams 覆盖三类写命令及关键 failure/replay path。 | 无。 |
| Developer handoff readiness | Pass | Implementation §3–§8 定义目标文件、六个结果型 slice、PostgreSQL/contract/concurrency/security/acceptance gates 和 rollback。 | 无阻塞项。 |

## Cycle 2 Finding Disposition

| Finding | Cycle 3 status | Evidence |
| --- | --- | --- |
| TPR-001 | Resolved | Design §9.4 新增 project authority/mutation、summary/detail 双 focus Shape；route matrix、Idea detail 嵌套语义与 Implementation AC-009 tests 同步。 |
| TPR-005 | Resolved | §9.1 create/promotion 示例改用合法 targetField 和 Actor 组合。 |
| TPR-006 | Resolved | `audit_events.actor_type` / `actor_role` 独立；`ActorInput` optional 与 `ActorDto` required-null 分离。 |
| TPR-007 | Resolved | `response_payload` 明确只保存 success data 或 rejection error，并由 adapter 使用 first request ID/status 重建 envelope。 |

## Remaining Minor Findings

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-008 | Minor | Create proposer 对通用 delegation 字段的处理未显式锁定 | Design §9.4 让 `proposer` 复用包含 optional `onBehalfOfRole` 的 `ActorInput`，但 `ideas` 没有对应列，`IdeaAuthorityDto.proposer.onBehalfOfRole` 又固定为 null。 | TypeBox 若直接复用通用 Shape，可能接受一个随后被丢弃的字段。 | 为 create proposer 使用收窄 Shape 或明确拒绝 `onBehalfOfRole`；若确需保留则补充列和响应语义。 | no |
| TPR-009 | Minor | Error envelope 示例仍与权威 details/request ID 不一致 | Design §9.2 示例使用 `requestId: "01..."`、额外 `field` 和 `REFETCH_AND_RETRY`；§9.4 的权威 `VERSION_CONFLICT` 使用 `req_<ULID>`、无 `field`、`REFETCH_AND_RETRY_WITH_NEW_KEY`。 | OpenAPI example 或文档测试可能与权威 Schema drift。 | 生成实现时让 error example 直接来自权威 TypeBox fixture，或手工同步三处值。 | no |

## Qualified Areas

- 请求中的 requirements、design 和 implementation-plan SHA-256 与 exact commit 文件一致；
  requirements 相比 Cycle 2 未变化。
- Design authority commit `51c186be...` 是 plan commit 的直接父提交，plan 头部和 §12
  均引用该 exact design commit。
- Project proposer/executor projection 现在有明确字段、literal、nullability、嵌套结构
  和同源 authority 规则，不依赖 JSON 字段顺序表达“重点”。
- Promotion write 使用不含 read focus 的 `ProjectMutationDto`，避免在写响应中伪造 query
  view；公开 list/detail 使用各自的 project DTO。
- Idempotency 记录保存 success data / rejection error payload，status/request ID/replay
  envelope 的重建边界唯一；PostgreSQL lock timeout 与 transaction rollback 语义明确。
- 对象生命周期、migration/readiness、公开读/AI 写、日志脱敏、audit append-only、
  真实 PostgreSQL 并发和 fault injection 设计完整。
- 六个 slice 有清楚的文件、commit boundary、verification、rollback 和 stop condition；
  LP-02–LP-05 未被提前纳入。

## Data Flow And Lifecycle Review

- Data origin: validated public GET 或受凭据保护的 AI write；服务端生成 ID、时间、版本和
  request ID。
- Write flow: readiness/auth/schema → idempotency claim/replay → row lock/version/policy →
  mutation + audit + terminal payload → commit → TypeBox envelope。
- Read flow: 同一 PostgreSQL authority → proposer/executor discriminated projection →
  list/detail envelope；view 不创建第二份状态。
- Failure flow: auth/schema 不绑定 key；确定性拒绝提交 REJECTED payload 而不写事实/audit；
  基础设施错误全事务回滚并允许 same-key retry。
- Lifecycle: Idea、statement、question、answer、project、snapshot、idempotency、audit 和
  migration record 的 transition、retention 与禁止删除语义完整。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: sequence diagram 覆盖 auth、readiness、idempotency owner/conflict/wait、
  row lock、domain policy、audit、commit、replay 和 rollback；state diagram 覆盖 Idea
  intake 与 promoted read-composite state。
- Required change: 无。

## Implementation And Verification Readiness

- Clear implementation path: yes；从 workspace/contracts 到 DB infrastructure、Idea、
  clarification、promotion/project reads、最终 acceptance/documentation 顺序合理。
- Affected modules: `apps/api`、`packages/contracts`、`packages/domain`、
  `packages/application`、`packages/db`、root automation、OpenAPI 和 feature docs。
- Verification: clean install、static/build、Schema/OpenAPI drift、真实 PostgreSQL、
  transaction/concurrency/fault injection、security、双 focus authority equivalence 和
  LP1-AC-014 objective scenario 均有明确证据路径。
- Open decisions requiring F2/F3: none。

## Recommendations

1. 在 LP1-S1/S3 的 TypeBox contract 中收窄 create proposer，不接受没有持久化语义的
   `onBehalfOfRole`，并加一条 negative fixture。
2. 从同一 TypeBox error fixture 生成 §9.2/OpenAPI example，避免 request ID 与 recovery
   literal 再次漂移。

## Review Evidence And Limitations

- `workflowctl.py status`：任务绑定 `review`、bootstrap ready；feature cycle 3、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：请求链、route、cycle、previous result 和 exact
  authority 作为新请求接受。
- `git ls-remote`：feature remote tip 为 exact commit `f68ae1b2...`；创建前远端
  review-record branch 不存在。
- `shasum -a 256`：requirements、design、implementation plan 分别匹配请求中的
  `d7a24d2b...`、`f18ef5ce...`、`459571e2...`。
- `git diff b1e0716...f68ae1b`：只修改 design 与 implementation plan；requirements 未变。
- Cycle 2 Markdown/JSON review artifact digests重新验证为
  `d0e68ab8...` / `b0662912...`，与正式结果 proof 一致。
- `git diff --check` 通过；隔离 review worktree 写报告前 clean。
- 依赖 exact versions 在 Cycle 1 已通过官方 registry/发布记录核验，本轮依赖表未变化。
- 本次只审查计划制品，没有修改 feature branch、编写实现或替 Main 修订计划。
