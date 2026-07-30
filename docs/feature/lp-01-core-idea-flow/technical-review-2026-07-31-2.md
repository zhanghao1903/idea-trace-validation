# Technical Plan Review: LP-01 核心基础与 Idea 流程（Cycle 2）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-01-core-idea-flow/requirements.md`
  - `docs/feature/lp-01-core-idea-flow/design.md`
  - `docs/feature/lp-01-core-idea-flow/implementation-plan.md`
- Reviewed plan commit: `b1e071637dea8e04c3e4cda0f4ac518a2591cd36`
- Reviewed composite SHA-256: `ccfd287524965165808c8610a226412294157b3f549acbf4ca0779b5c30344c3`
- Review request: `6e59ceb627fbce8cd191c9e66bfa27dbf2c66e28106622beb8050b476cb43c92`
- Previous result: `c39f003d1754a10633a9aa7c4c890422dc6049c4f497367819814f585d84b21a`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: Cycle 1 的流程图、对象寿命、readiness 和 authority SHA 问题已经关闭，字段契约也基本补齐。但 LP1-AC-009 明确包含等待执行项目的 proposer/executor 投影，而权威项目 DTO 没有定义任何投影重点字段；实现者仍需自行设计一段公共响应契约，因此本 exact snapshot 暂不能授权实现。

## Handoff Judgment

本轮修订是实质性的：十张表、对象生命周期、配置变化、请求/响应/error Shape、幂等
并发协议、sequence/state diagram 和测试矩阵已足以支持绝大多数实现。上一轮
TPR-002、TPR-003、TPR-004 已完全关闭，TPR-001 的绝大部分也已关闭。

剩余阻断范围很窄。Requirements LP1-AC-009 要求普通 Idea、待澄清 Idea 和等待执行项目
在 proposer/executor 两类基础投影中引用相同对象但展示各自相关字段。Design §9.3 说
项目 focus 会重新排列 goal、hypotheses 和 source idea 摘要；然而 §9.4 的权威
`ProjectSummaryDto`、`ProjectDetailDto` 以及 route response 都没有 `focus` 或两种
discriminated project projection Shape。JSON 字段顺序不是稳定的公共投影语义。开发者
必须自行决定两个项目视图分别返回什么，导致 AC-009 和 OpenAPI contract test 没有唯一
预期。

Main 只需在权威 API 矩阵中补齐项目 proposer/executor 的精确 Shape，并同步列表/detail
响应与 contract test；无需重写架构。其余三项为不阻断实现的局部文字一致性问题。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的 Problem、Goals、Non-goals、22 项 REQ 和 14 项 AC 清楚限定 LP-01。 | 无。 |
| Data structure clarity | Fail | Design §7.2、§9.4 已覆盖主要 SQL/API 字段；Idea focus 有精确 Shape。 | 为 `ProjectSummaryDto` / `ProjectDetailDto` 定义 proposer/executor 的权威投影字段，并同步 route response。 |
| New/changed fields highlighted | Pass | Design §7.4 明确列出基线 domain/config 的保留、重命名与新增决定。 | 无。 |
| Data flow clarity | Pass | Design §8.1–§8.4 锁定 auth、idempotency、事务、audit、replay 和 failure path。 | 无。 |
| Core object lifecycle | Pass | Design §7.3 对十类核心对象逐项声明创建、transition、owner、可观察状态和 delete/expire/archive/retention。 | 无。 |
| Flow diagram | Pass | Design §8.4 有 end-to-end sequence diagram 和 Idea state diagram，覆盖 create/answer/promote、commit、replay 和 failure。 | 无。 |
| Developer handoff readiness | Fail | 六个 implementation slice、文件、门禁和回滚清楚，但 AC-009 的 project projection 仍要求开发者自行设计公共 Shape。 | 关闭 TPR-001 的剩余 project projection 缺口后可进入实现。 |

## Cycle 1 Finding Disposition

| Finding | Cycle 2 status | Evidence |
| --- | --- | --- |
| TPR-001 | Partially resolved; remains blocking only for project view Shape | §7.2–§7.4、§9.4 已补齐绝大多数 persistence/API/config/lifecycle authority；project view 仍未进入权威 DTO。 |
| TPR-002 | Resolved | §8.4 新增 sequence diagram 和 state diagram。 |
| TPR-003 | Resolved | §12 与 Implementation §5 统一为 listener 始终可提供 live/OpenAPI，not-ready 时 ready/business route 返回 503。 |
| TPR-004 | Resolved | Design header 与 Implementation §12 都引用 exact design commit `bdf55be8eb4c56d4efb0fc276f2a467d93738957`。 |

## Findings

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Blocker | 等待执行项目的 proposer/executor 权威投影 Shape 仍缺失 | Requirements LP1-AC-009 包含等待执行项目；Design §9.3 声明项目 focus，§9.4 的 `ProjectSummaryDto` / `ProjectDetailDto` 和 GET project response 却没有 focus/discriminated projection 字段。 | OpenAPI、实现和 AC-009 contract test 必须自行选择两种项目视图的字段，公共契约没有唯一答案。 | 在 §9.4 定义两种 project focus/projection 的精确字段、nullability 和嵌套 Shape，并同步 list/detail response 与验证断言。 | yes |
| TPR-005 | Minor | 早期 JSON 示例与后续权威 Schema 使用不同 enum/actor 约束 | Design §9.1 create 示例仍写 `EXPECTED_OUTCOME` 且漏 `FACT`；promotion 示例允许 `EXECUTOR`，§9.4 则要求 proposer intent。 | 阅读前段示例或生成文档时可能得到错误请求。 | 删除重复示例或与 §9.4 的权威值完全对齐。 | no |
| TPR-006 | Minor | Actor 的持久化列与 request/response nullability 表述不精确 | `audit_events` 精确列矩阵把 `actor_type/actor_role` 合为一个 row；共享 `ActorContext` 把 client/delegation 写成 optional，而响应说明又要求 null。 | Migration 和 TypeBox/OpenAPI 需要做局部推断，可能形成一列/两列或 optional/null 的 drift。 | 把两列拆开，并分别定义 request Actor 与 response Actor 的 optional/nullable Shape。 | no |
| TPR-007 | Minor | 幂等 response body 的保存单位前后不一致 | §7.2 称 `response_body` 保存终态 envelope、replay 返回原 envelope；§9.4 又要求只保存 response data/status 并重新包装。 | repository 与 replay adapter 可能选择不同 JSON 边界。 | 明确 `response_body` 保存 data 还是完整 envelope，并让字段矩阵、replay 算法和测试使用同一说法。 | no |

## Qualified Areas

- 三份文件的 SHA-256 与请求一致，requirements 相比 Cycle 1 snapshot 未变化。
- Cycle 1 的四项 required fix 均被有针对性地修订；没有扩张到 LP-02–LP-05。
- SQL 字段矩阵、索引/约束、lifecycle/retention、changed-field/config 表和 TypeBox API
  Shape 已把绝大多数编码决策前移到 design。
- PostgreSQL 幂等首次请求、unique conflict、2 秒等待、lock timeout、确定性拒绝和
  transaction rollback 行为清楚。
- sequence diagram 与 state diagram 能与文字算法互相核验。
- readiness listener、shared probe、migration checksum、business gate 和恢复行为只有
  一个可测试解释。
- 六个结果型 slice、真实 PostgreSQL 验证、OpenAPI drift、security/fault injection、
  clean checkout 和范围审查与风险相称。

## Data Flow And Lifecycle Review

- Data origin: AI 写请求或公共 GET；服务器生成 ID、时间、request ID 和 version。
- Write path: envelope/auth → idempotency claim/replay → row lock/version/policy →
  domain mutation → audit + terminal idempotency response → commit → response。
- Read path: 公共 query → 同一 PostgreSQL authority → proposer/executor projection →
  TypeBox response envelope。
- Failure path: validation/auth 在事务前拒绝；确定性业务拒绝绑定 key；基础设施失败回滚；
  同 key 可恢复未知结果。
- Lifecycle: Idea、statement、question、answer、project、snapshot、idempotency、audit
  和 migration record 的 creation、transition、retention 与禁止删除语义均已明确。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: sequence diagram 覆盖 create/answer/promote 的公共路径、auth、
  idempotency、transaction、audit、commit/replay/failure；state diagram 覆盖 Idea
  的待澄清、可推进和已推进状态。
- Required change: 无；项目 projection 缺口属于 API Shape，不需要新增图。

## Implementation And Verification Readiness

- Clear implementation path: yes，除项目投影 Shape 外，模块、slice、commit boundary、
  migration order、rollback 和 stop condition 清楚。
- Verification path: unit、contract、integration、acceptance、OpenAPI、concurrency、
  fault injection、security 和 clean checkout 均已定义。
- Remaining hidden decision: proposer/executor project list/detail 分别突出哪些字段，以及
  该差异在 JSON/OpenAPI 中如何表达。

## Re-review Requirements

下一轮只需：

1. 关闭 TPR-001 的剩余范围：给 project list/detail 的 proposer/executor 投影写出权威
   discriminated Shape，并同步 route matrix 与 AC-009 contract assertion；
2. 同步修正 TPR-005–TPR-007 的局部表述；
3. 以新 exact snapshot 和 composite digest 重新送审。

无需再次重做已经关闭的流程图、生命周期、readiness 或依赖版本工作；Review 下一轮应以
上述差异和整体验证为主。

## Review Evidence And Limitations

- `workflowctl.py accept-plan-review` 已接受 request
  `6e59ceb627fbce8cd191c9e66bfa27dbf2c66e28106622beb8050b476cb43c92`，
  cycle、route、previous result 和 exact authority 有效。
- remote feature branch 与隔离 review worktree 都绑定 exact commit
  `b1e071637dea8e04c3e4cda0f4ac518a2591cd36`。
- `shasum -a 256`：requirements、design、implementation plan 分别为
  `d7a24d2b...`、`02f9aefc...`、`12b36b6c...`，与请求一致。
- `git diff 905f858...b1e0716 -- requirements.md` 为空；修订只改变 design/plan。
- `git diff --check` 通过；写报告前隔离 worktree clean。
- 依赖 exact versions 已在 Cycle 1 通过官方 registry/发布记录核验；本轮未变更依赖表。
- 本次只审查计划制品与既有输入，没有修改 feature branch、编写实现或替 Main 补设计。
