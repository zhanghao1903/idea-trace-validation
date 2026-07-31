# Technical Plan Review: LP-02 项目执行与决策闭环（Cycle 2）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-02-execution-decisions/requirements.md`
  - `docs/feature/lp-02-execution-decisions/design.md`
  - `docs/feature/lp-02-execution-decisions/implementation-plan.md`
- Reviewed plan commit: `090b99d5e3d3a5a9caa4a9b228aa25a1bc2ba21c`
- Reviewed composite SHA-256: `c74b9ea03989a5fdff0d054b9817407edd19ddc77bef8e7548818734128ad8b9`
- Previous result: `6ce967e57c6f0e471faeec31a3c58bfc7b84108df932e2c031ac052e9295c80f`
- Review request: `3c338fc66b9a1c818dded2d2b7362f30960b538acfcbc4b46b8908bf269104fd`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 1 的确认载荷、结论/确认状态矩阵和 `CORRECT_RESPONSE` 三项缺口已在源设计及实施计划中闭环。mandatory criteria 全部满足，剩余一处错误恢复文案冲突是局部 Minor，不影响安全性、持久化状态或开发者开始实现。

## Handoff Judgment

该 exact snapshot 可以交给开发者进入 F4。修订没有扩大产品范围，而是把 Cycle 1
要求的三项隐藏决策转成了权威协议：

- 五种 `ConfirmationPayloadSummary` 是 closed discriminated union，逐字段绑定项目、
  结论、终态或重开意图，并规定 NFC、递归 key ordering、UTF-8、domain-separated
  SHA-256/HMAC、first-class intended-value columns 和 decide-time 重算；
- 结论与确认有 operation × current state × create/approve/reject/expire 矩阵，明确
  DRAFT 同步确认、CONFIRMED 复用、REOPEN 零结论事件及 usable pending 唯一性；
- `CORRECT_RESPONSE` 有 closed request union、同事项 current-leaf、one-successor、
  human-readable-only correction、status 不变和 effective response projection。

这些规则已同步到 command mapping、implementation slices、negative tests 和 AC
verification matrix。开发者不再需要自行决定人批准了什么、结论事件如何推进或回应
纠正怎样影响当前状态。

本轮只发现一处局部文案不一致：`CONFIRMATION_ALREADY_PENDING` 的专用 recovery 要求
使用现有 active opportunity，而通用 `CONFIRMATION_*` details 示例仍写创建新机会。
专用规则足够明确，错误本身 fail-closed，修正文案不会改变架构或业务状态，因此记为
Minor、不中断 Pass。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的现状、场景、Goals、28 项需求、16 项验收标准、Non-goals 和恢复边界保持不变。 | 无。 |
| Data structure clarity | Pass | Design §7 逐对象定义字段；§10.2 定义五种 exact confirmation Shape、first-class intended values 与摘要协议；§11.3–11.4 定义 closed requests/responses。 | 无阻塞缺口。 |
| New/changed fields highlighted | Pass | `ValidationProject` changed fields、`correctedKind`、confirmation intended-value columns、persisted decision 与 derived usability 均标明类型、null/default、owner、校验和兼容。 | 无。 |
| Data flow clarity | Pass | §9 事务 sequence 和 §10.3 confirmation sequence 覆盖 auth、idempotency、locks、重算、状态事件、audit、commit/replay/failure。 | 无。 |
| Core object lifecycle | Pass | §6 项目状态图、§7.4 attention matrix、§7.6 conclusion/confirmation matrix、§7.7 usability 和 §8.3 lifetime 完整覆盖创建、转换、更新、过期与不可删除历史。 | 无。 |
| Flow diagram | Pass | 项目 state diagram、写事务 sequence diagram、人类确认 sequence diagram 均存在且与文字规则一致。 | 无。 |
| Developer handoff readiness | Pass | package/file ownership、五个 slices、迁移顺序、command mapping、stop conditions、验证矩阵、rollback 和状态同步均足以直接实施。 | 仅 TPR-004 文案清理，不阻塞。 |

## Cycle 1 Finding Closure

| Previous finding | Status | Cycle 2 evidence |
| --- | --- | --- |
| `TPR-001` 人类确认绑定载荷不是权威、可重算协议 | Closed | Design §10.2 锁定五种 Shape、common/conclusion/operation 字段、first-class columns、NFC/canonical JSON、digest/HMAC domains、decision rebuild 与逐字段 stale tests。 |
| `TPR-002` 结论与确认 operation-specific lifecycle 不完整 | Closed | Design §7.6 给出 create/approve/reject/expire 矩阵、允许前置状态、DRAFT/CONFIRMED terminal 差异、REOPEN 零结论事件、usable pending 唯一性与 current projection。 |
| `TPR-003` `CORRECT_RESPONSE` 请求和状态投影未定义 | Closed | Design §7.4/§11.3 定义 target leaf、`correctedKind`、replacement unions、no-status-change、success DTO、effective response、successor uniqueness；Implementation S3/§6/§7/§9 同步测试。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- Requirements SHA 与 Cycle 1 相同，acceptance criteria digest 未变化；本轮只修订技术
  设计和实施计划，没有改变已确认需求。
- Cycle 2 plan commit 直接建立在 Cycle 1 exact plan commit 上，diff 只涉及
  `design.md` 和 `implementation-plan.md` 的三项整改。
- 人类确认 Shape 绑定全部 conclusion 内容、Evidence 顺序、项目 version/status/phase、
  completion summary 或 prior terminal/reopen intent；payload 不是唯一 intended-value
  副本。
- digest 与 capability 使用不同 domain，human-control token 采用固定 32-byte
  base64url 格式，raw capability 只在 scoped secure cookie 中出现。
- DRAFT conclusion 可在终态批准中原子确认；已 CONFIRMED conclusion 后续终态确认不
  降级；REOPEN 不触碰结论；expired/stale 不写 decision 或业务转换。
- Attention correction 只修正 human-readable response，不重写原 state effect；读取方可
  同时观察 original、correction chain、effective response 和原始状态历史。
- 迁移/readiness、LP-01 compatibility、项目 row lock/version、audit/idempotency
  原子性、public/OpenAPI 契约、rollback 和 PostgreSQL objective proof 保持完整。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-004 | Minor | `CONFIRMATION_ALREADY_PENDING` 的 recovery 文案与通用 details 示例不一致 | Design §11.6 的错误表要求“resolve/use the active opportunity or create a new one”，但随后统一写 `CONFIRMATION_* -> recovery:"CREATE_NEW_CONFIRMATION_FROM_CURRENT_STATE"`；§7.6 同时明确 usable pending 存在时新建会再次返回 `CONFIRMATION_ALREADY_PENDING`。 | 若实现照搬通用示例，调用方会被提示执行一个确定失败的恢复动作；不会绕过确认、改变项目事实或泄露秘密。 | 让该错误使用独立 details：`{confirmationId,recovery:"USE_ACTIVE_CONFIRMATION"}`；通用创建新机会文案只用于 expired/stale/适用的 already-decided 场景。 | no |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| `ValidationProject` / transitions | Pass | changed fields、phase/status lifecycle、terminal/reopen history、version owner 完整。 |
| Progress / Evidence | Pass | append-only correction/retraction、same-project references、current leaf 和原历史清楚。 |
| Attention item/event | Pass | exact state matrix、closed correction union、one-successor chain、effective response 与 status effect 分离。 |
| Conclusion/state events | Pass | immutable content、supersession、operation-state matrix 和 time-derived pending resolution 完整。 |
| Human confirmation | Pass | first-class intended fields、closed payload summary、persisted decision、derived usability、expiry/consumption 与 secret representation 完整。 |
| API/error/config | Pass with Minor | request/response、access、cookie、errors 和 base64url control token 明确；仅 TPR-004 recovery 字符串需统一。 |
| Migration/readiness | Pass | additive `0002`、ordered checksum catalog、unknown/missing/out-of-order fail-closed 和 downgrade 行为清楚。 |

## Data Flow And Lifecycle Review

- Data origin: AI execution writes、human-control confirmation creation、capability-cookie decision
  与 public reads；服务端生成 ID、time、request ID 和 resulting project version。
- Write path: validation/auth → idempotency ownership → project lock/version → domain policy →
  business/history rows → one project version update → audit/idempotency → commit。
- Confirmation path: human control 创建 exact payload/cookie；decision 锁 confirmation/project，
  重建 first-class/current facts，byte/digest/capability/version 全部匹配后按矩阵原子决定。
- Correction path: progress/Evidence/conclusion 使用新对象或事件；Attention response
  correction 形成 leaf chain 与 effective response，但原 state effect 永不重写。
- Expiry/deletion: confirmation expiry/staleness time-/fact-derived；业务历史均不物理删除；
  migration 无 down path。
- Missing transitions or ownership rules: none blocking.

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: state diagram 明确项目 lifecycle；transaction sequence 明确写路径和
  rollback；confirmation sequence 已同步 operation matrix event-or-none 分支。
- Recommended diagram changes: none required.

## Implementation Readiness

- Clear implementation path: yes；五个 slice、files、exit gates 与 commit intent 清楚。
- Affected modules/components: `apps/api`、`packages/contracts`、`packages/domain`、
  `packages/application`、`packages/db`、OpenAPI/acceptance scripts 与 feature/management docs。
- Open decisions developers would still need to make: none blocking；TPR-004 按专用错误规则
  统一 recovery 即可。

## Verification Readiness

- Test strategy: TypeBox/domain/migration/integration/security/acceptance 分层完整。
- Security proof: five canonical payload fixtures、每类 bound-field mutation、token
  separation、cookie attributes、secret scan、expiry/replay/concurrency/fault rollback。
- Historical proof: attention effective response 与原 state effect、conclusion DRAFT/CONFIRMED
  terminal paths、REOPEN 零结论 mutation、LP-01 populated migration/read regression。
- Objective proof: PostgreSQL/API AC-016 闭环及 LP-01 regression 均有精确命令。
- Missing proof: none blocking.

## Modification Recommendations

1. 在实现 public error contracts 时把 `CONFIRMATION_ALREADY_PENDING` 单独映射到
   `USE_ACTIVE_CONFIRMATION`，并增加一条 contract test，避免客户端进入确定失败的重建
   循环。
2. 建议在 canonicalization fixtures 中加入接近 64 KiB body/payload 边界的多字节 Unicode
   用例，证明 `payloadSummary` 上限与 Fastify body limit 的组合行为。

## Re-review Requirements

无需因 TPR-004 单独重新送审；本 exact plan snapshot 已通过。若实现前改变五种
confirmation Shape、digest/HMAC 输入、结论/确认状态矩阵、Attention correction 状态效果、
公共兼容或迁移策略，则必须形成新 plan commit/digest 并重新评审。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-02 cycle 2、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `3c338fc66b9a1c818dded2d2b7362f30960b538acfcbc4b46b8908bf269104fd`
  作为有效 Cycle 2 请求接受，且绑定上一结果
  `6ce967e57c6f0e471faeec31a3c58bfc7b84108df932e2c031ac052e9295c80f`。
- remote feature branch 与 exact HEAD 均为
  `090b99d5e3d3a5a9caa4a9b228aa25a1bc2ba21c`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `53d1ef87...`、design `6eb5359f...`、implementation plan
  `896c9605...`，均匹配请求；requirements 与 Cycle 1 相同。
- `git diff --check 43e5f48..090b99d`：通过；diff 仅修改 design/implementation plan，
  未改 requirements 或 repository code。
- 读取并核对了 Cycle 1 三项 finding 的 exact closure、相关 API Shape、state matrix、
  command mapping、verification/security matrix 和 LP-01 repository package boundaries。
- 本次是 exact-snapshot 设计复审；没有修改源计划、执行 feature 实现测试、编写代码或
  更改 feature branch。
