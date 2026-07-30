# Technical Plan Review: LP-01 核心基础与 Idea 流程（Cycle 1）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-01-core-idea-flow/requirements.md`
  - `docs/feature/lp-01-core-idea-flow/design.md`
  - `docs/feature/lp-01-core-idea-flow/implementation-plan.md`
- Reviewed plan commit: `905f858201de591022ba50de33abf8f4f4a9c2b7`
- Reviewed composite SHA-256: `f8d46e5b633f4f3a9135c0539b2035d274c45a98a106ca7409ee40d976ebbde8`
- Review request: `a58ca4b39183494bfc78fd4059b0bf0ab0d1e6ae235e5ecd08f4ae00b4e6f726`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 范围、模块边界、依赖基线、事务目标和验证计划较完整，但精确设计没有锁定全部新增持久化/API 字段及核心对象删除/过期语义，也没有任何执行或数据流图。这两项是 mandatory design criteria；在开发者仍需自行设计公共契约和关键数据路径时，不能授权进入实现。

## Handoff Judgment

当前快照不应直接交给开发者开始 F4。实施计划已经把工作拆成六个结果型 slice，并列出
目标文件、命令、数据库测试和回滚边界；但设计只为 `Idea` 与
`ValidationProject` 提供了部分规则表，其他新增表、回答请求、读取响应、错误 details、
幂等记录和 audit event 仍缺少完整字段级定义。实现者必须自行决定列类型、必填性、
默认值、约束、序列化形态和对象寿命，这会把 F2 决策推迟到编码阶段。

此外，三份被审制品没有 flowchart、sequence diagram、state diagram 或等价图。已有
模块依赖文本和编号算法能够解释局部规则，但不能替代 mandatory execution/data-path
diagram。根据 `technical-plan-review` 的明确规则，评审者不能自行补图后批准。

本轮 Fail 只针对 commit
`905f858201de591022ba50de33abf8f4f4a9c2b7` 和 composite digest
`f8d46e5b633f4f3a9135c0539b2035d274c45a98a106ca7409ee40d976ebbde8`。
原计划不得由 Review 修改；Main 修订后应以新的 exact snapshot 重新送审。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的 Problem、Desired scenarios、Goals、Non-goals 和 22 项功能需求清楚限定 LP-01。 | 无。 |
| Data structure clarity | Fail | Design §6 只完整列出两个聚合的部分字段；§7 仅列十张表的用途和少量约束；§9.1 对回答请求只列字段名，§9.2–9.3 未定义各端点的 `data`/列表/detail 字段。 | 为所有新增持久化对象、命令和响应提供字段级权威矩阵或 Schema：类型、必填/可选、默认、owner、校验、索引/约束、序列化、兼容与迁移。 |
| New/changed fields highlighted | Fail | 当前设计未系统标出相对既有 domain/config 输入的重命名与变更，例如 `AI_API_TOKEN` → `AI_WRITE_TOKEN`、Idea/Project 字段形态变化。 | 明确列出新增、重命名、移除和保留字段，并说明无运行时迁移时仍需处理的文档/API 兼容影响。 |
| Data flow clarity | Pass | Design §5、§8 和 §13 用依赖方向、事务步骤与失败表说明请求、幂等、领域写入、audit 和 PostgreSQL 的主要流向。 | 图形化缺口单列于 Flow diagram；并发 SQL 机制建议在修订时进一步锁定。 |
| Core object lifecycle | Fail | Idea 的创建/澄清/推进与 Project 的创建状态已有规则，但没有明确声明 Idea、Project、question、answer、idempotency record 的删除、过期、保留和归档语义；“无 DELETE 路由”不能替代设计结论。 | 对每个核心对象明确 creation、transition、update owner、persistence、observable state、deletion/expiration/retention；不支持删除或过期时也须显式写出。 |
| Flow diagram | Fail | 对三份精确制品搜索 Mermaid/flowchart/sequence/state diagram 无结果；模块目录树和编号列表不是 execution/data-path diagram。 | 至少加入一张覆盖 create/clarify/promote 主路径及 auth、idempotency、application、transaction、PostgreSQL、audit、replay/failure 的 Mermaid 图。 |
| Developer handoff readiness | Fail | Implementation plan 的文件与 slice 边界清楚，但开发者仍需自行决定公共响应、数据库列、生命周期保留策略和 readiness 启动行为。 | 先关闭 TPR-001–TPR-003，再开始 F4。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 中的文件逐一一致。
- Requirements 自确认提交 `42078fa3...` 至 plan commit 没有变化；implementation plan
  头部正确引用修订后的 design commit `da247f8...`。
- 需求背景、22 项 LP1-REQ、14 项 LP1-AC、非目标、安全边界和 failure recovery 清楚。
- 模块化单体边界、依赖方向、目标目录和六个 implementation slice 具有可执行结构。
- 明确区分“信息完整”和“显式推进”，并用 Idea row lock、expected version 与数据库
  unique constraint 保护单项目不变量。
- 幂等目标覆盖成功、确定性拒绝、冲突、未知结果和并发首次请求，测试矩阵也覆盖真实
  PostgreSQL、故障注入和 transaction rollback。
- TypeBox 作为请求/响应/OpenAPI 单一来源、结构化报告 Schema move、日志脱敏、公开读/
  AI 写边界和不引入身份系统的约束均明确。
- 全部列出的 npm 精确版本在官方 registry 存在；关键 peer dependency 与 Node 24
  范围相容。Node.js 24.18.0/npm 11.16.0 和 PostgreSQL 17.10 也能由官方发布记录确认。
- 验收主场景、clean-checkout 命令、rollout/rollback、状态事实同步与 future LP
  排除项设计得与风险相称。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Blocker | 字段级权威契约与核心对象寿命未锁定 | `design.md` §6.2–§7 仅列部分字段和表用途；§9.1 的回答命令只有字段名，§9.2 的成功 `data` 为空对象示例，§9.3 只有投影描述；没有完整删除/过期/保留规则。 | 不同开发者会产生不同 SQL、TypeBox/OpenAPI、错误 details、投影和保留行为；公共契约及迁移边界无法在编码前审查。 | 补充完整字段/Schema 矩阵和每个核心对象的生命周期/保留规则，并显式记录相对基线的字段与配置变化。 | yes |
| TPR-002 | Blocker | 精确计划缺少执行或数据流图 | 三份被审文件没有 Mermaid 或等价 diagram；Design §5 仅有目录和依赖文本，§8 是编号算法。 | auth、幂等等待/replay、领域 mutation、audit、事务提交和失败回滚之间的路径只能从多段文字拼接，mandatory flow-diagram criterion 未满足。 | 加入与文字契约一致的 sequence/flow/state diagram，覆盖三类写命令和关键失败分支。 | yes |
| TPR-003 | Major | Readiness 启动语义自相矛盾 | Design §12 要求 readiness 失败返回 503，同时写“业务路由在 readiness 未建立时不启动监听”；Implementation LP1-S1 又要求未连接/未迁移时 `/health/ready` 可返回 503。 | 若进程不监听，编排器无法观察 503；若全部路由监听，业务请求在 not-ready 时的 gating 又未定义。AC-013 无唯一实现。 | 明确服务器是否始终监听 health、业务路由如何 gate、启动期与运行期数据库故障分别返回什么，并同步 design/plan/test。 | yes |
| TPR-004 | Minor | Commit and Review Plan 引用旧 design commit | Implementation plan 头部引用 `da247f8739...`，但 §12.1 仍写 `218fe7975...`；后者缺少随后加入的 rejected-idempotency 绑定规则。 | 人工执行或审计 §12 时可能选择过时设计快照。 | 将 §12.1 更新为 exact design commit `da247f8739...`，并保持所有 authority 元数据一致。 | no |

## Data Structure Review

| Object / schema | Current coverage | Missing authority before implementation |
| --- | --- | --- |
| `Idea` | ID、workspace、intent、proposer、outcome、status、version、project link、timestamps 有规则。 | 明确具体类型/序列化、默认值、owner、数据库列和相对既有 domain 字段的变更。 |
| Statement / clarification question / answer | 说明追加、supersedes 和当前指针。 | 完整字段、ID/外键、类型、必填性、长度/数量、版本/纠正约束、保留/删除策略。 |
| `ValidationProject` / hypothesis snapshot | 核心字段与唯一 Idea 关系有规则。 | 完整列与响应字段、snapshot 字段、项目/假设保留与未来 LP 兼容边界。 |
| `idempotency_records` | 状态、全局 key、digest、终态响应和事务目标有说明。 | 列类型、状态时间、响应大小/格式、超时/保留、清理策略及精确 PostgreSQL conflict/wait 机制。 |
| `audit_events` | 同事务追加、禁止 update/delete、成功历史有要求。 | 事件列、actor/reason 摘要 Shape、版本、request correlation、纠正事件 Shape 和查询响应。 |
| API requests/responses | create/promote 示例、统一 envelope、错误码和投影方向。 | answer/correction 精确 Shape；所有 `data`、pagination、detail/history、error `details` 的 TypeBox 权威字段。 |
| Runtime config | `AI_WRITE_TOKEN`、`DATABASE_URL` 有局部说明。 | 相对 baseline `AI_API_TOKEN` 等字段的重命名/兼容决定，以及 LP-01 实际必填/默认配置矩阵。 |

## Data Flow And Lifecycle Review

- Data origin: AI 写请求或公共 GET；服务端生成 ID、时间、version 和 request ID。
- Data path: Fastify/TypeBox → auth/envelope validation → application command/query →
  domain policy → PostgreSQL transaction/repository → response/OpenAPI projection。
- Mutation path: idempotency key 与 digest → Idea lock/version check → fact/project/history
  mutation → audit + idempotency terminal response → commit → client response。
- Failure path: validation/auth 在事务前拒绝；确定性业务拒绝保存 `REJECTED`；基础设施失败
  回滚；相同 key 用于未知结果重试。
- Core lifecycle: Idea 可在 `NEEDS_CLARIFICATION` 与 `IDEA` 间形成当前投影，显式推进
  后关联一个 `PLANNING/QUEUED` Project；不会因澄清自动推进。
- Missing lifecycle authority: 对 Idea/Project/question/answer/idempotency record 的
  delete、expire、archive、retention 没有明确结论；部分纠正链有 append-only 规则，
  但不能外推到所有对象。

## Flow Diagram Review

- Diagram present: no
- Diagram adequacy: 不适用；精确制品没有 diagram。
- Recommended diagram changes: 加入一张 end-to-end sequence diagram；如一张图过密，可再
  增加 Idea 状态图，但不能只用评审报告中的建议图替代源计划修订。

## Implementation Readiness

- Clear implementation path: 文件树、packages、六个 slice、commit boundary、rollback 和
  stop condition 清楚。
- Affected modules/components: `apps/api`、`packages/contracts`、`packages/domain`、
  `packages/application`、`packages/db`、root automation、OpenAPI 与 feature docs。
- Open decisions developers would still need to make:
  - 全部 PostgreSQL 列、TypeBox request/response 与错误 details Shape；
  - 对象删除、过期和 idempotency retention；
  - not-ready 时 listener 与业务路由的精确行为；
  - PostgreSQL unique-conflict 的 2 秒 wait/timeout/transaction recovery 机制。

## Verification Readiness

- Test strategy: domain、contract、repository、API、concurrency、fault injection、
  security、clean checkout 和 objective acceptance 均有覆盖。
- Strong proof: 使用真实 PostgreSQL 证明 transaction、unique、migration、并发和
  rollback，而不是以 mock 替代。
- Missing proof design: readiness matrix 需先消除启动语义冲突；字段级契约完成后才能形成
  可审阅的 OpenAPI/SQL contract assertions。
- Manual/smoke: clean install、build、OpenAPI drift、report Schema 单一来源、范围和
  状态事实同步均已规划。

## Modification Recommendations

1. 为十张表、所有 request/response/error/config Shape 建立字段级权威矩阵或可读 Schema，
   明确类型、必填、默认、owner、校验、索引/约束、兼容和迁移。
2. 对每个核心对象显式声明 creation、transition、update、delete/expire/archive/retention；
   “不支持”也是有效且必须写出的结论。
3. 在 design 中加入 create/clarify/promote 的 Mermaid sequence/flow diagram，包含 auth、
   idempotency、row lock、domain mutation、audit、commit、replay 和 failure。
4. 决定 health listener 与业务 route gating 模型，统一 Design §12、LP1-S1 和 AC-013。
5. 把 implementation plan §12 的 design SHA 更新为 `da247f8739...`。
6. 建议同时锁定 PostgreSQL 并发插入冲突的具体 SQL/timeout/rollback 机制，避免超时后在
   aborted transaction 中继续读取。

## Re-review Requirements

下一轮至少必须：

1. 关闭 TPR-001：完整字段契约、changed-field 说明和对象寿命进入被审 design；
2. 关闭 TPR-002：源计划包含 adequate flow diagram；
3. 关闭 TPR-003：readiness/listener/route gating 只有一个可测试解释；
4. 修正 TPR-004，并同步所有 exact design authority；
5. 重新生成 requirements/design/implementation-plan SHA 与 composite digest，以新的
   `TechnicalPlanReviewRequest` 送审。

## Review Evidence And Limitations

- `workflowctl.py status`：当前任务绑定 `review`，bootstrap ready；本 feature cycle 1、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：请求作为新请求接受，仓库、路由、cycle 和消息 ID
  有效。
- `git ls-remote`：feature branch tip 为 exact commit `905f858...`；创建前远端
  review-record branch 不存在。
- `git cat-file -t 905f858...`：精确对象为 commit。
- `shasum -a 256`：requirements、design、implementation plan 分别匹配请求中的
  `d7a24d2b...`、`81a6240f...`、`5df33c2c...`。
- `git diff --check 30aa271...905f858...`：通过；隔离 worktree 在写报告前 clean。
- diagram pattern search：三份被审制品没有 Mermaid/flowchart/sequence/state diagram。
- `npm view <exact-version>`：表中 19 个 npm 精确版本全部存在；关键 peerDependencies
  与 Node 24/TypeScript 6.0.3 相容。
- Node.js 官方 archive/release 和 PostgreSQL 官方 release/versioning 页面确认
  Node 24.18.0/npm 11.16.0 与 PostgreSQL 17.10。
- 本次只审查计划制品及必要的既有 domain/architecture 输入，没有编写实现、修订计划或
  修改 feature branch。
