# Technical Plan Review: v0.1 可独立验收实施计划拆分与管理（Cycle 3）

- Review date: 2026-07-28
- Reviewed artifact(s):
  - `docs/feature/v0-1-project-management/requirements.md`
  - `docs/feature/v0-1-project-management/design.md`
  - `docs/feature/v0-1-project-management/implementation-plan.md`
- Reviewed plan commit: `14e9f57b67edcf142c94f5e1fbad553e8d3fdfc7`
- Reviewed composite SHA-256: `f91a13300735cf95c9ff58b8c098a6e403a4d48878f0b5eec87be85b615622e5`
- Review request: `2f37da0658b1d785f76832d000dd63bd56b43100f15b534c0d8c6edd0aa075c4`
- Previous result: `b0efdf9bb7fa2a94e12c104196f93c099e9eef9dcc10e7aee88e695fa3b183e0`
- Reviewer stance: Architect handoff readiness and cycle-2 finding re-review
- Final decision: Fail
- Decision summary: Cycle 2 的两个 Major 和一个 Minor 已按要求闭合；字段、authority、状态与最终 head 验证模型现在一致。剩余一项 lifecycle 集成 Major：计划要求把自定义 `VerificationEnvelope` 写入 `CodeReviewRequest`，但当前 workflow schema 不接受该字段，因此计划定义的交付门禁无法按现有工具执行。

## Handoff Judgment

除 verification evidence 的跨边界传递方式外，这份计划已经可以交给开发者：目标文件、Markdown schema、数据流、状态机、验收历史、staleness、checker、rollout 和 rollback 都完整。当前唯一不能放行的原因是 PM-S4 与 checker contract 明确要求在 lifecycle `CodeReviewRequest` 中记录 `VerificationEnvelope`；实际 `workflowctl.py prepare-code-review` 没有相关参数，`CodeReviewRequest.body` 又使用 exact-key 校验。实现者只能省略计划规定的门禁、把未支持字段塞入消息并被拒绝，或擅自修改外部 lifecycle 工具，三种选择都超出已批准实施路径。

## Prior Finding Disposition

| Prior finding | Disposition | Evidence |
| --- | --- | --- |
| C2-MAJOR-001：验收历史 schema 删除确认字段 | Resolved | Design 第 211–218 行显式定义 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`；第 222–255 行定义 result-specific 等值、空值、owner 和不可覆盖规则。 |
| C2-MAJOR-002：Code Review 与验收 authority 混用 | Resolved | Design 第 231–244、358–366、454–456 行分离 Review result、验收拒绝和 supersede authority；Main 只记录，不生成决定。 |
| C2-MINOR-001：最终 proof/head 绑定顺序不清 | Resolved | Implementation plan 第 162–192、325–350、409–414 行定义 final clean content commit、外置 evidence、head 变化失效和重新运行规则。 |

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 第 9–49 行和 design 第 13–44 行。 | 无。 |
| Data structure clarity | Pass | Design 第 132–306 行定义 summary、plan、acceptance、blocker、change、staleness 六类对象及类型、required、default/空值、owner、validation。 | 无。 |
| New/changed fields highlighted | Pass | 四个确认验收字段、result authority、recorder、pointer 和 projection 字段均显式定义。 | 无。 |
| Data flow clarity | Pass | Design 第 371–411 行定义 authority → Main → 两份投影 → checker → Current/Stale 的 sequence 和原子更新。 | 无。 |
| Core object lifecycle | Pass | Design 第 308–369 行给出状态图与穷举转换，第 220–255 行给出验收记录生命周期，第 283–306 行给出 staleness 生命周期。 | 无。 |
| Flow diagram | Pass | 依赖 flowchart、状态图和投影 sequence diagram 均存在并与文字契约一致。 | 无。 |
| Developer handoff readiness | Fail | Implementation plan 第 43–196 行给出文件和 PM-S1–PM-S4，第 236–350 行给出 checker 与 envelope。 | `VerificationEnvelope` 被要求进入不支持扩展字段的 `CodeReviewRequest`；必须使用现有 schema 可承载的传递路径。 |

## Qualified Areas

- 确认 requirements 的内容和 SHA-256 在三轮 review 中保持不变。
- `AcceptanceRecord` 已保留确认字段，并为 `Accepted`、`Rejected`、`Superseded` 分别定义 decision authority、Main recorder、空值和 pointer 规则。
- Code Review `REQUEST_CHANGES` 只引用 immutable review result 与 `ChangeRecord`，不会冒充验收方或生成 `Rejected` acceptance record。
- final content commit、clean worktree、checker、PR head 和 head 变化后失效/重跑的关系清楚，避免 self-referential proof commit。
- 状态/staleness、依赖 DAG、单一状态入口、独立 IP authority、失败恢复、安全和兼容性均已闭合。
- Checker contract 覆盖固定输入、算法、输出、排序、退出码、验收字段、Review authority、staleness、trace、links 和 secrets。
- 本次只审查精确计划快照、上一轮 report 和实际 lifecycle helper schema；没有检查或修改 feature 实现代码。

## Disqualified Gaps And Risks

| Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- |
| Major | C3-MAJOR-001：`VerificationEnvelope` 无法写入当前 `CodeReviewRequest` schema | Implementation plan 第 181–190、325–341 行要求把 envelope 写入 PR 描述和 lifecycle `CodeReviewRequest`。当前 `workflowctl.py prepare-code-review --help` 只接受 PR number/url/base/head 参数和 optional previous result；`validate_routed_body("CodeReviewRequest")` 对 body 精确允许 `pullRequest`、`reviewRecordBranch`、`mergePolicy`、optional `previousResultMessageId`，额外字段会 `invalid_payload`。已审查 helper SHA-256：`7614ddbdaafe883c09a85993043d064140582bbe8a1cab92d5ed4a13728c1018`。 | Main 无法满足计划自己的 PM-S4 门禁：省略 envelope 会违反计划，添加字段会被 lifecycle 拒绝，修改外部 workflow helper 又不在本 feature 范围。 | 使用受支持的边界：PR 描述和当前任务证据保存 `VerificationEnvelope`；`CodeReviewRequest` 只通过既有 `pullRequest.headSha` 绑定相同精确 head。要求 Review 从 PR 描述读取 envelope，验证 `CheckedCommit=headSha` 与 digest，并把验证结果写入 immutable code-review report/result。同步修改 PM-S4、checker evidence contract 和 gate。若坚持把 envelope 作为 request 字段，则必须另行确认并实现 lifecycle schema 变更。 | yes |

## Data Structure Review

| Object / schema | Field | New or changed | Type | Required | Default | Validation | Compatibility / migration note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ProjectPlanSummary` | summary、pointer、projection 字段 | New | 已定义 | yes | 已定义 | parity、DAG、pointer、staleness | 新增 Markdown 投影，无运行时迁移。 |
| `ImplementationPlan` | plan metadata 与 history pointer | New | 已定义 | yes | 已定义 | lifecycle、依赖、version、pointer | 新增 Markdown 契约。 |
| `AcceptanceRecord` | decision、recorder、确认字段、恢复字段 | New | 已定义 | yes | result-specific `None` | exact commit、authority、等值、只追加 | 通过；旧 accepted 记录不可覆盖。 |
| `BlockerRecord` | 阻塞与恢复字段 | New | 已定义 | yes | 无活动 record | owner、exit condition、review point | 通过。 |
| `ChangeRecord` | 追加式变更字段 | New | 已定义 | yes | 无 | evidence、authority、补偿修订 | 通过。 |
| `StalenessRecord` | 检测/清除字段 | New | 已定义 | yes | clear 字段 `None` | 成对投影、停止晋级、清除 evidence | 通过。 |
| `VerificationEnvelope` | checker run evidence | New external envelope | 已定义 | yes | 无 | checked commit、digest、UTC、deferred checks | 数据结构本身清楚；transport 不能使用当前 CodeReviewRequest 自定义字段。 |

## Data Flow And Lifecycle Review

- Data flow: durable authority 与 Git/Review/验收事实由 Main 读取并投影到独立计划和项目入口，同 change 验证；实现完成后 checker 对 clean final head 生成外置 envelope。
- Core object lifecycle: 计划、验收 history、blocker/change history 和 staleness 均有创建、状态/更新、owner、保留和恢复规则。
- Missing transitions or ownership rules: 无。剩余问题仅是 envelope 从 Main 到 Review 的实际 transport。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: 三类 Mermaid 图足以说明依赖、状态和投影数据流。
- Recommended diagram changes: 无强制图修改；修复 C3-MAJOR-001 后可在 PM-S4 文字中标注 PR description → Review report 的 evidence 读取路径。

## Implementation Readiness

- Clear implementation path: PM-S1–PM-S3 生成最终 tracked 内容；PM-S4 在 clean head 上验证、推送、建 PR、准备 Code Review。
- Affected modules/components: `CHANGELOG.md`、原总计划、项目管理入口、八份独立计划、PR 描述和 lifecycle review metadata。
- Open decisions developers would still need to make: 只能选择 envelope 的受支持 transport；其余核心设计决定已闭合。

## Verification Readiness

- Test strategy: 完整且确定性。
- Missing proof: 当前 plan 尚未指定与实际 `CodeReviewRequest` exact schema 兼容的 envelope transport。
- Manual or smoke validation needed: 修订后用 `workflowctl.py prepare-code-review --help` 与一次 dry schema review 证明 request 不含额外字段，并确认 Review 可从 PR 描述读取同 head envelope。

## Modification Recommendations

1. 从“在 `CodeReviewRequest` 中记录 envelope”改为“request 只绑定 exact `headSha`，envelope 保存在 PR 描述/任务证据并由 Review 验证后写入 immutable report”。
2. 在 Code Review handoff 说明中明确 PR description envelope、request `headSha`、live PR head 三者必须一致；任一变化使证据失效。

## Re-review Requirements

提交 cycle 4 新快照，或在另行确认的 scope 中扩展 lifecycle schema。若采用现有 schema，至少：

1. PM-S4、VerificationEnvelope 和 gate 不再要求 `CodeReviewRequest` 承载不支持的字段；
2. 明确 Review 读取 PR 描述/任务证据、核对 exact head/digest、写入 immutable review report 的步骤；
3. implementation plan 与 checker 仍保持“tracked head 变化即重跑”的规则；
4. requirements、design、implementation plan 位于新的同一精确 commit，并由 lifecycle 生成下一轮 `TechnicalPlanReviewRequest`。

## Review Evidence And Limitations

- `workflowctl.py status`：ready Review，feature cycle 3、stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：cycle-3 请求作为新请求接受并验证上一 result message ID。
- `git cat-file -t 14e9f57...`：精确对象为 commit，parent 为 cycle-2 snapshot。
- `git ls-remote --heads origin codex/review-records/.../plan-3-14e9f57b67ed`：创建前远端不存在 review branch。
- `shasum -a 256`：三份计划制品匹配请求中的 `9ca2a55...`、`52b6092...`、`afae669...`。
- `git diff --check 752997...14e9f57`：通过。
- `workflowctl.py prepare-code-review --help` 与 `validate_routed_body` exact-key schema：不支持 `VerificationEnvelope`。
- 本次是计划 re-review；没有运行运行时代码测试，没有修改 feature 分支，也没有审查实现代码。
