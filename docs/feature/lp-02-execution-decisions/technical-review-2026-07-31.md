# Technical Plan Review: LP-02 项目执行与决策闭环（Cycle 1）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-02-execution-decisions/requirements.md`
  - `docs/feature/lp-02-execution-decisions/design.md`
  - `docs/feature/lp-02-execution-decisions/implementation-plan.md`
- Reviewed plan commit: `43e5f48d280455ecb7d9214774ea1d334e8bca8b`
- Reviewed composite SHA-256: `1849fd57caf1c0d132719956b497e4f73d48e76a682b2785eb875013306717a2`
- Review request: `a33bf32dd17f400e9fc8b2cf218b22838d5f0ee1b040be15da4db78fe058de9b`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 计划对 LP-01 基线、数据对象、事务、迁移、API、图示和验证的覆盖已经很完整，但安全关键的确认摘要仍不是可实现的权威协议，结论/确认及关注事项纠正也各缺一段确定状态机。开发者仍需自行决定“人实际批准了哪些字段”以及若干持久化状态如何变化，因此本 exact snapshot 不能进入实现。

## Handoff Judgment

当前计划大部分已经达到可交付给开发者的细度：新增/变更对象有字段表，API 有请求与响应
Shape，迁移、幂等、项目锁、审计、回滚和真实 PostgreSQL 验证都有明确路径，且源设计
包含项目状态图与两张关键 sequence diagram。

剩余缺口集中在两个会改变权威事实的协议上。第一，`payloadSummary` 仅被描述为
“bounded JSON”，没有按五种 `ConfirmationOperation` 定义确切字段、规范化与摘要算法；
而批准时又必须从持久化事实重算 digest。不同实现可能遗漏
`completionSummary`、`reopenReason`、`nextStep` 或结论相关字段，无法证明人批准的内容与
最终写入完全一致。第二，结论状态规则把每次确认都描述为
`PENDING_CONFIRMATION -> CONFIRMED/DRAFT`，但 `REOPEN_PROJECT` 没有结论，且已
`CONFIRMED` 的结论仍可能随后进入终态确认。当前规则无法唯一决定这些操作应追加什么
结论事件。另有 `CORRECT_RESPONSE` 已进入公开枚举，却没有请求分支或状态投影规则。

这些不是 Review 应替 Main 补写的实现细节。本轮 Fail 只绑定 commit
`43e5f48d280455ecb7d9214774ea1d334e8bca8b` 与 composite digest
`1849fd57caf1c0d132719956b497e4f73d48e76a682b2785eb875013306717a2`；
Main 只需修订下列三项并用新快照重新送审。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的现状、11 个场景、Goals、28 项需求、16 项验收标准及 Non-goals 清楚限定 LP-02。 | 无。 |
| Data structure clarity | Fail | Design §7 对主要对象有字段表，§11.3–11.4 有 API Shape；但 `HumanConfirmation.payloadSummary` 仍是未定义 Shape 的 JSON，`CORRECT_RESPONSE` 也没有权威请求分支。 | 补充逐操作确认摘要 discriminated union、规范化/digest 算法，以及纠正回应的完整字段契约。 |
| New/changed fields highlighted | Fail | `ValidationProject` 和大多数新增对象已标明 changed/new、owner、null/default 与校验；确认摘要内部字段及纠正回应的必填/可选字段仍未逐项标明。 | 将两处隐藏 JSON/事件载荷展开到字段级权威契约，并统一 persisted decision 值与公开枚举命名。 |
| Data flow clarity | Pass | Design §9 的事务 sequence 与 §10 的人类确认 sequence 覆盖入口、服务、锁、持久化、审计、重放和失败；Implementation §6 映射命令到记录与审计。 | 确认重算 digest 的输入/变换需在 TPR-001 中补足。 |
| Core object lifecycle | Fail | 项目、Evidence、结论、确认和对象寿命均有说明；但结论在不同确认 operation 下的 create/approve/reject/expire 状态事件不完整，`CORRECT_RESPONSE` 也没有状态转换规则。 | 增加 operation × current-state 矩阵和回应纠正生命周期。 |
| Flow diagram | Pass | Design §6 有项目 state diagram；§9 和 §10 分别有人机/事务 sequence diagram。 | 无。 |
| Developer handoff readiness | Fail | 文件清单、五个 slice、迁移顺序、风险、回滚和验证矩阵清楚；安全绑定及两个状态转换仍要求开发者自行做架构决定。 | 关闭 TPR-001–TPR-003 后再进入 F4。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- LP-01 merge/acceptance/closure 基线、无发布事实、依赖版本和单工作空间边界均被明确继承。
- `ValidationProject` 的 widened/new 字段、控制枚举、状态图和项目级 row-lock/version
  并发边界清楚。
- Progress、AttentionItem/Event、Evidence、ValidationConclusion 和
  HumanConfirmation 均有持久化字段、owner、长度/数量、同项目引用及 append-only 规则。
- 迁移 `0001 -> 0002`、checksum catalog、readiness fail-closed、旧二进制 downgrade
  限制和 forward-fix/restore 策略与现有 LP-01 实现吻合。
- 公共 `/api/v1` 路径、AI write 与 human-control/cookie 分离、OpenAPI v1 保留与 v2
  生成、稳定错误和调用方恢复均有清晰边界。
- 每个成功命令的业务事实、项目版本、audit 与 idempotency 原子性，以及 deterministic
  rejection / infrastructure rollback / same-key replay，已有一致的数据流。
- 验证计划覆盖领域、契约、迁移、并发、过期/消费、故障注入、LP-01 回归和完整
  AC-016 客观闭环，并明确事务类证明必须使用 PostgreSQL 17.10。
- Scope、文件清单、五个 implementation slice、stop conditions、commit intent 与
  管理文档状态同步足以约束实现边界。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Blocker | 人类确认绑定载荷不是权威、可重算的协议 | Design §7.7 只把 `payloadSummary` 定义为“bounded JSON”和若干示例类别；§11.3 分别给出 `completionSummary`、`terminalTransitionId`、`reopenReason`、`nextStep`，但没有说明每个 operation 的摘要确切字段；§10.2 又要求批准时从持久化事实重算 canonical digest。 | 开发者必须自行决定哪些字段被人批准、如何规范化和 hash。若遗漏 `nextStep`、完成摘要或相关结论事实，载荷变化可能仍被批准；若不同层使用不同编码，合法确认会不可重放或在重启后失效。该缺口直接落在 LP2-REQ-013–016 与 AC-007/008 的安全边界。 | 定义 `ConfirmationPayloadSummary` 的五个 operation-specific discriminated Shape，逐字段写明类型、必填/null、来源和边界；锁定 trim/Unicode/JSON key-order/UTF-8/domain-separation 与 SHA/HMAC 输入；说明创建时保存什么、决定时从哪些 immutable/current facts 重算，并为每个绑定字段给出 mutation/stale 测试。 | yes |
| TPR-002 | Major | 结论与确认的 operation-specific 生命周期不完整且存在冲突 | Design §7.6 写所有 confirmation creation 都追加 `PENDING_CONFIRMATION`、approval 追加 `CONFIRMED`、rejection 追加 `DRAFT`；但 §11.3 规定 `REOPEN_PROJECT` 没有 `conclusionId`，而 `CONFIRM_CONCLUSION` 可先产生已确认结论，之后仍可能为 COMPLETE/STOP/TRANSFER 创建另一确认。Implementation §6 也把所有 create/reject 映射成结论状态写入。 | REOPEN 无结论可写状态事件；对已 CONFIRMED 结论再次发起终态确认时，失败/拒绝/过期可能被实现为错误地降回 DRAFT，或不同实现完全不写事件。当前结论投影、历史和终态原子性没有唯一答案。 | 增加 `operation × current conclusion status × create/approve/reject/expire` 矩阵：明确允许的前置状态、是否追加结论事件、事件目标状态、终态确认是否可同时确认 DRAFT 或复用 CONFIRMED、REOPEN 明确不触碰结论，以及重复/并发 pending 的规则；同步 §7.6、§10、§11 与 Implementation §6。 | yes |
| TPR-003 | Major | `CORRECT_RESPONSE` 的请求和状态投影规则未定义 | Design §6 已公开 `CORRECT_RESPONSE`；§7.4 仅说 `correctsEventId` 可空且应指向 current leaf，状态映射只覆盖 COMMENT/REQUEST_INFO/PROVIDE_INFO/RESOLVE/CLOSE；§11.3 的 authoritative request Shape 也没有 `CORRECT_RESPONSE` 分支。 | TypeBox、domain policy、SQL constraint 和读取投影会各自猜测 target event、必填字段及 `fromStatus/toStatus`。纠正是否改变当前 item status、可纠正哪些事件、如何形成 current leaf 均无法由计划唯一推出，AC-011 无确定 oracle。 | 定义 CORRECT_RESPONSE 的 discriminated request：`correctsEventId` 必填、允许的目标 kind/leaf、可替换字段、from/to status、current projection 和 successor uniqueness；补充响应 Shape及 contract/domain/integration 测试。 | yes |

## Data Structure Review

| Object / schema | Review result | Remaining authority needed |
| --- | --- | --- |
| `ValidationProject` / `ProjectTransition` | Pass | widened/default/current projection、终态与重开历史均清楚。 |
| `ProgressUpdate` | Pass | 完整新记录纠正、current-leaf 和同项目 Evidence 约束清楚。 |
| `AttentionItem` | Pass | 三种 discriminator、nullable fields、当前状态与对象寿命清楚。 |
| `AttentionEvent` | Fail | 补齐 `CORRECT_RESPONSE` 的必填 target、字段 Shape、状态效果和读取投影。 |
| `Evidence` / `evidence_events` | Pass | metadata kind、correction/retraction、同项目引用和不抓取内容清楚。 |
| `ValidationConclusion` / state events | Fail | 内容 Shape 完整；需补齐每种 confirmation operation 对结论状态的精确事件矩阵。 |
| `HumanConfirmation` | Fail | 列级字段大体清楚；`payloadSummary` 必须从开放 JSON 变为 operation-specific 权威 Shape，并统一 `decision` persisted enum。 |
| API / error / config | Pass with linked gaps | 路由、响应、错误、`HUMAN_CONTROL_TOKEN` 与 cookie 边界清楚；两处失败对象的 public request contract 随 TPR-001/003 修订。 |
| Migration / readiness catalog | Pass | ordered catalog、checksum、unknown/missing/out-of-order 和 downgrade 行为清楚。 |

## Data Flow And Lifecycle Review

- Data origin: AI execution writes、human-control confirmation creation、capability-cookie decision
  与 public reads；服务端生成 ID、commit time、request ID 和 resulting project version。
- Data path: Fastify/TypeBox/auth → application port → idempotency ownership → project row lock →
  domain policy → business/history rows → project current projection → audit/idempotency → commit。
- Human path: control credential 创建机会并收到 scoped cookie；cookie 决定 route 锁定
  confirmation + project，验证 expiry/consumption/version/digest 后原子批准或拒绝。
- Recovery: validation/auth 在事务前失败；确定性 4xx 保存可重放 rejection；基础设施失败
  全部 rollback；未知结果使用相同 key/intent；stale confirmation 基于当前事实重建。
- Core lifecycle gap: `REOPEN_PROJECT`、已确认结论的后续终态确认，以及
  `CORRECT_RESPONSE` 没有唯一的状态/事件结果。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: 项目状态图清楚覆盖 queued/in-progress/paused/completed；事务 sequence
  覆盖幂等、项目锁、领域校验、audit 与 rollback；确认 sequence 覆盖 create、cookie、
  decide、expire/stale 与原子终态。
- Recommended diagram changes: 图本身无需新增；TPR-002 的 operation/state matrix 应作为
  文字与表格权威补入，必要时在现有确认 sequence 的分支标出“无结论事件”与“复用已确认
  结论”。

## Implementation Readiness

- Clear implementation path: package ownership、目标文件、迁移、五个 slice 和顺序明确。
- Affected modules/components: `apps/api`、`packages/contracts`、`packages/domain`、
  `packages/application`、`packages/db`、OpenAPI/acceptance scripts 与管理文档。
- Open decisions developers would still need to make:
  - 五种 confirmation operation 的 exact approved payload 与 canonical digest；
  - 已确认结论、终态确认、拒绝/过期及 REOPEN 的结论事件矩阵；
  - `CORRECT_RESPONSE` 的 request union、目标范围和 status projection。

## Verification Readiness

- Test strategy: 领域/contract/integration/security/acceptance 分层完整，事务、并发、expiry
  与 objective acceptance 使用真实 PostgreSQL。
- Missing proof definition: TPR-001 修订前，“payload-change”没有可枚举的字段集合；
  TPR-002 修订前，结论 current status 没有唯一 oracle；TPR-003 修订前，AC-011 的回应
  纠正没有唯一预期状态。
- Manual/smoke: 不需要额外 UI 验证；clean checkout、OpenAPI drift、LP-01 compatibility、
  migration/readiness 与 secret scan 已足够。

## Modification Recommendations

1. 先锁定五种 `ConfirmationPayloadSummary` Shape 与 canonical digest/HMAC 输入，使人类
   批准内容能够逐字段证明、重算和失效。
2. 增加结论/确认 operation-state matrix，明确 DRAFT、PENDING_CONFIRMATION、
   CONFIRMED、SUPERSEDED 在 create/approve/reject/expire 下的唯一结果，特别覆盖已确认
   结论与 REOPEN。
3. 补齐 `CORRECT_RESPONSE` 的请求 discriminator、target/current-leaf 规则、状态效果和
   测试 oracle。
4. 同步统一 `HumanConfirmation.decision` 的数据库值与公开枚举
   `PENDING|APPROVED|REJECTED`，`EXPIRED` 继续只作为 time-derived projection。

## Re-review Requirements

下一轮至少必须：

1. 关闭 TPR-001：确认摘要与 digest 成为逐操作、逐字段、可规范化和可重算的权威协议；
2. 关闭 TPR-002：结论/确认在所有 operation 和 current state 下具有唯一事件结果；
3. 关闭 TPR-003：`CORRECT_RESPONSE` 具有完整契约与 lifecycle；
4. 同步 design、implementation plan、验证矩阵和 machine-readable contract 计划；
5. 用新的 plan commit、文件 SHA 与 composite digest 发送下一轮
   `TechnicalPlanReviewRequest`。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review` 且 bootstrap ready；LP-02 cycle 1、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：请求作为本 cycle 的有效新请求接受。
- exact review worktree HEAD：
  `43e5f48d280455ecb7d9214774ea1d334e8bca8b`；feature branch 与请求一致。
- SHA-256：requirements `53d1ef87...`、design `2ad418b5...`、implementation plan
  `47e69011...`，均与请求一致。
- 读取了现有 LP-01 contracts、domain、database migration/readiness/service 与 API
  composition，计划中的 package/file 边界与仓库现状相符。
- 远端 review-record branch 在创建前不存在；隔离 worktree 写报告前 clean。
- 本次为设计就绪性评审，没有执行 feature 实现测试、修改三份源计划、编写代码或更改
  feature branch。
