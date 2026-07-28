# Technical Plan Review: v0.1 可独立验收实施计划拆分与管理

- Review date: 2026-07-28
- Reviewed artifact(s):
  - `docs/feature/v0-1-project-management/requirements.md`
  - `docs/feature/v0-1-project-management/design.md`
  - `docs/feature/v0-1-project-management/implementation-plan.md`
- Reviewed plan commit: `22798bbe9b81f407554489436ba29082e2cbbd22`
- Reviewed composite SHA-256: `4d7be5055ea444d7580780243051cbdfbcf39b8ce8eefea0be9f0091f6c0aa1f`
- Review request: `fe8476e8b69ee898669acce017f57421b28b95296b876ef9c6a10907bedf6cc9`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 范围、依赖、authority 边界和文档实施路径清楚，但状态恢复契约与验收历史数据契约仍需实现者自行补决策。两项缺口都直接影响确认需求中的独立验收、重开和一致性纠偏，因此当前快照不应进入开发。

## Handoff Judgment

当前计划已经足以说明要创建哪些文档、八份计划如何依赖、谁拥有何种 authority，以及实现后要验证哪些性质；但尚不足以安全交给开发者直接实现受控状态和验收记录。具体而言，确认需求允许验收失败后进入 `In Progress` 或 `Blocked`，而设计状态图只允许回到 `In Progress`；设计又要求把投影标记为 `stale`，却没有定义承载该状态的字段。与此同时，单值验收字段无法表达“重开或新版本后保留原验收记录”的追加式历史。实现者若自行选择表示法，项目入口、独立计划和验证器可能形成不同契约。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 第 9–49 行说明问题、场景和目标；design 第 1–43 行冻结范围与非范围。 | 无。 |
| Data structure clarity | Fail | Design 第 130–206 行定义 `ProjectPlanSummary`、`ImplementationPlan`、`BlockerRecord` 和 `ChangeRecord`。 | 缺少可持久化的 staleness 字段和追加式 `AcceptanceRecord` 历史结构；相关字段的默认值、owner 和验证规则没有闭合。 |
| New/changed fields highlighted | Fail | Design 第 139–170 行列出主要元数据字段。 | 需要补充 staleness、历史验收记录及其当前投影字段，并明确 owner、默认值、验证和版本兼容规则。 |
| Data flow clarity | Pass | Design 第 45–62 行定义 authority 顺序，第 240–253 行定义同一 Git 变更集中的读取、校验、双写、检查和补偿流程。 | 无阻塞缺口。 |
| Core object lifecycle | Fail | Design 第 208–238 行提供状态图和 lifecycle 证据映射。 | 状态图与确认需求的验收失败恢复不一致，且没有定义 `Deferred` 的恢复出口、stale 投影恢复及历史验收记录的创建/保留规则。 |
| Flow diagram | Pass | Design 第 90–128 行包含依赖图，第 208–224 行包含状态图。 | 图已存在，但状态图必须按 MAJOR-001 补全。 |
| Developer handoff readiness | Fail | Implementation plan 第 42–174 行给出目标文件和 PM-S1–PM-S4，第 214–275 行给出验证、rollout 和 rollback。 | 两项核心契约仍需开发者自行设计；确定性检查也缺少可直接复现的命令或 checker 契约。 |

## Qualified Areas

- 文档 feature 与后续 IP-01–IP-08 的独立 RequirementsHandoff、GoalRun、PR、Review 和验收 authority 分离清楚，没有批量授权实现。
- `docs/project-management.md` 与八份独立计划的权威层级、单一状态入口和同提交更新原则明确。
- IP-01–IP-08 的依赖图无环，关键路径以及 IP-04/IP-05 可并行关系与确认基线一致。
- 实现计划列出了精确目标文件、四个实施 slice、回滚边界、追踪基线和文档类验证范围。
- 安全边界明确禁止凭据、token、cookie、数据库 URL、私密样本和临时签名 URL 进入仓库。
- 本次 review 验证了三个计划制品的 SHA-256 与请求完全一致；未审查或修改 feature 实现代码。

## Disqualified Gaps And Risks

| Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- |
| Major | MAJOR-001：状态、staleness 与恢复契约未闭合 | Requirements 第 151 行要求验收失败后回到 `In Progress` 或 `Blocked`；design 第 212–223 行只定义 `InReview -> InProgress`。Design 第 54、252–253 行要求标记 `stale`，但第 139–150 行没有 staleness 字段，受控 `Status` 也不包含 `stale`。 | 实现者无法在不新增隐含规则的情况下同时实现状态图、失败恢复和一致性校验；不同文档或 checker 可能对同一事实给出冲突状态。 | 增加穷举转换表，至少写明 source、target、guard、authority、evidence 和失败回退；补上 `In Review -> Blocked` 及 `Deferred` 恢复规则。为投影另设受控 staleness 字段/状态，定义何时置 stale、谁可清除、清除所需证据，不能把 `stale` 混入计划业务状态。 | yes |
| Major | MAJOR-002：验收记录无法表达不可变历史 | Requirements 第 122–130、151–152 行要求精确 commit 验收、实质变化后重开或新版本并保留原记录；design 第 156–170 行只定义一组单值 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`，第 223 行又允许 `Accepted -> Draft`。 | 重开时是清空、覆盖还是复制这些字段没有契约；任何选择都可能丢失原验收证明，或让当前版本错误沿用旧验收。 | 定义追加式 `AcceptanceRecord`（至少绑定 `PlanId`、plan version、accepted commit、owner/actor、strict UTC、evidence、result），定义当前验收投影与历史记录的关系，以及创建、重开、版本递增、拒绝、保留和禁止覆盖规则。 | yes |
| Minor | MINOR-001：自动检查只有断言清单，没有可复现 checker 契约 | Implementation plan 第 214–230 行仅为第 2–10 项描述验证目标，只有 `git diff --check` 是精确命令。 | 不同实现者可能用不同解析规则判断章节、主归属、Markdown 链接、秘密模式和状态一致性，导致证据难以复核。 | 在实施计划中给出确定性 checker 的伪代码/输入输出契约或精确命令，并规定失败时的非零退出、诊断格式和项目入口证据记录格式。一次性脚本仍可放在 `/private/tmp`。 | no |

## Data Structure Review

| Object / schema | Field | New or changed | Type | Required | Default | Validation | Compatibility / migration note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ProjectPlanSummary` | 已列出的 10 个字段 | New | Design 已定义 | yes | 部分由实施计划推断 | 一致性、ID、依赖、证据规则已定义 | 新增 Markdown 投影；需补充独立 staleness 表示。 |
| `ImplementationPlan` | 计划元数据 | New | Design 已定义 | yes | 已定义主要初始值 | 文件名、依赖、状态和验收门禁已定义 | 新增 Markdown 契约；字段 owner 应在表内或统一规则中明确。 |
| `AcceptanceRecord` | 历史验收结果 | Missing | 未定义 | 必须补充 | 不适用 | 必须绑定精确版本、commit、actor、UTC 与 evidence，并追加不可覆盖 | 需要定义从“未验收单值字段”到历史列表/表的初始形态；这是本 feature 首次引入，无运行时迁移。 |
| `BlockerRecord` | `Reason` 等 | New | 未完整定义 | yes | 未定义 | 业务规则已列出 | 补充字段类型、owner、空值/不存在规则。 |
| `ChangeRecord` | `ChangedAt` 等 | New | 未完整定义 | yes | 未定义 | 业务规则已列出 | 补充字段类型、owner 和追加/禁止改写规则。 |
| Project staleness | stale 标志/记录 | Missing | 未定义 | 按失败恢复需要 | clean/current | 需定义置位、清除和证据规则 | 与业务 `Status` 分离，避免破坏受控状态兼容性。 |

## Data Flow And Lifecycle Review

- Data flow: durable lifecycle、Review、Git/PR/check/merge 和指定验收证据是上游事实；Main 读取并验证 authority 后，在同一 Git commit 中更新独立 IP 计划和 `docs/project-management.md` 投影，随后运行一致性检查并推送。
- Core object lifecycle: 计划创建为 `Draft`，经独立 authority 和依赖门禁进入执行、Review 与 `Accepted`；实质变化重开或递增版本。主路径清楚，但失败回退、延期恢复、stale 恢复和验收历史保留未闭合。
- Missing transitions or ownership rules: `In Review -> Blocked`、`Deferred` 的恢复出口、staleness 的 owner/清除门禁、`AcceptanceRecord` 的创建者与不可变规则。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: 依赖图足以表达八份计划的硬依赖和关键路径；状态图清楚表达主路径，但没有覆盖确认需求允许的全部恢复路径。
- Recommended diagram changes: 补充 MAJOR-001 的转换，并在图后增加穷举转换表；另用一个短 sequence/flow 图展示 durable facts → independent plan → project summary → validation → commit 的投影更新路径。

## Implementation Readiness

- Clear implementation path: 目标文件与 PM-S1–PM-S4 顺序清楚。
- Affected modules/components: `CHANGELOG.md`、原总实施计划、项目管理入口和八份独立计划文件。
- Open decisions developers would still need to make: staleness 的持久化格式与恢复规则；验收历史记录结构及当前投影；验收失败到 `Blocked` 的 guard；`Deferred` 的恢复路径。

## Verification Readiness

- Test strategy: 覆盖文件集、章节、ID、依赖 DAG、状态一致性、REQ/AC/Slice 追踪、链接、验收字段和秘密扫描，并包含人工抽查。
- Missing proof: 对第 2–10 项尚无确定性命令或 checker 输入输出契约。
- Manual or smoke validation needed: 按原总计划逐 Slice、按确认需求逐 REQ/AC 复核；抽查 IP-01、IP-05、IP-08 的独立可理解性和验收门禁。

## Modification Recommendations

1. 先闭合状态、staleness 和恢复契约，使状态图、确认需求、投影字段与 checker 使用同一受控模型。
2. 增加追加式 `AcceptanceRecord`，明确当前投影与历史记录在拒绝、重开、版本递增和补偿修订时的行为。
3. 为文档验证定义可复现 checker 契约和标准化证据输出。

## Re-review Requirements

重新提交同一 feature 的新计划快照，并满足：

1. 设计和实施计划对 MAJOR-001 给出一致、可验证、无隐含状态的完整转换与 staleness 契约；
2. 设计定义 MAJOR-002 的追加式验收历史结构、owner、默认值、验证和不可覆盖规则；
3. 实施计划同步更新目标文档内容、验证规则和失败恢复；
4. requirements、design、implementation plan 位于新的同一精确 commit，并由 lifecycle 生成下一轮 `TechnicalPlanReviewRequest`。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`，workflow ready，feature stage 为 `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：请求作为 cycle 1 新请求接受。
- `git cat-file -t 22798bbe...`：精确对象为 commit。
- `git ls-remote --heads origin codex/review-records/.../plan-1-22798bbe9b81`：创建前远端不存在该 review-record branch。
- `shasum -a 256`：requirements、design、implementation plan 分别匹配请求中的 `9ca2a55...`、`502cee1e...`、`5fd5b25...`。
- 本次是技术计划审查；没有运行运行时代码测试，没有修改 feature 分支，也没有审查实现代码。
