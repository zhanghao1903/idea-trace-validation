# Technical Plan Review: v0.1 可独立验收实施计划拆分与管理（Cycle 2）

- Review date: 2026-07-28
- Reviewed artifact(s):
  - `docs/feature/v0-1-project-management/requirements.md`
  - `docs/feature/v0-1-project-management/design.md`
  - `docs/feature/v0-1-project-management/implementation-plan.md`
- Reviewed plan commit: `752997b64d6b780ed9c777b35633cd72e9c37ea2`
- Reviewed composite SHA-256: `e5acc64c3370e6776d734c549a7d3498328abdcb224cd8977e8dc6156d30c7ab`
- Review request: `aa0e223ccc576a5498aae33a2de83f59a578d9407db4e5dad73ef5c12cd8a21b`
- Previous result: `e9c7509f71bffd28bc0206b18ef503ee860eb9aea1ab1ac8d780076c9c721605`
- Reviewer stance: Architect handoff readiness and cycle-1 finding re-review
- Final decision: Fail
- Decision summary: Cycle 1 的状态/staleness 和 checker 缺口已经闭合，追加式验收历史的总体方向也正确；但修订后的验收 schema 没有保留确认需求指定的验收字段，并把 Code Review 拒绝与指定验收方的 `Rejected` 记录混为同一事件。当前快照仍要求开发者在 authority 与字段契约上自行做高影响决定。

## Handoff Judgment

修订后的依赖、状态转换、staleness、数据流和确定性验证已经达到可实施程度。剩余问题集中在验收契约：确认需求明确要求每份计划具有 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`，但 design 和 implementation plan 中这些字段一次也没有出现；同时 `AcceptanceRecord.Actor` 只允许指定验收方，状态转换却要求 Code Review 拒绝也追加 `Rejected` acceptance record。开发者无法在不违反字段基线或冒充验收 authority 的情况下按当前计划实现，因此不能 Pass。

## Prior Finding Disposition

| Prior finding | Disposition | Evidence |
| --- | --- | --- |
| MAJOR-001：状态、staleness 与恢复契约未闭合 | Resolved | Design 第 141–176 行增加独立 `ProjectionState` 与 pointer；第 257–280 行定义 `StalenessRecord`；第 282–341 行补全状态图和穷举转换；第 343–367 行增加投影同步 sequence diagram。 |
| MAJOR-002：验收记录无法表达不可变历史 | Partially resolved | Design 第 195–229 行新增追加式 `AcceptanceRecord` 和 current/latest pointer，但字段与 actor/事件语义仍存在本轮两个 Major。 |
| MINOR-001：自动检查没有可复现 checker 契约 | Resolved | Implementation plan 第 245–325 行定义固定命令、输入、算法、输出、check ID、排序和退出码。 |

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 第 9–49 行说明问题和目标；design 第 13–44 行冻结背景、目标和非目标。 | 无。 |
| Data structure clarity | Fail | Design 第 132–280 行定义六类 Markdown 管理对象及 owner/default/validation。 | `AcceptanceRecord` 没有实现确认字段名，并且 `Actor` authority 无法覆盖 design 要求的 Review rejection 与 supersede 事件。 |
| New/changed fields highlighted | Fail | Project summary、plan、blocker、change 和 staleness 字段已完整列出。 | 确认需求中的 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence` 未出现在修订设计或实施计划。 |
| Data flow clarity | Pass | Design 第 343–383 行展示 authority → Main → 独立计划/项目入口 → checker 的双投影流程与原子更新规则。 | 无阻塞缺口。 |
| Core object lifecycle | Fail | Design 第 282–341 行提供状态图、穷举 guard、authority、evidence 和 fallback。 | `In Review` 因 Code Review 失败返回时被错误要求创建只有指定验收方才能署名的 acceptance rejection；`Superseded` 的 actor authority 同样未闭合。 |
| Flow diagram | Pass | Design 包含依赖 flowchart、状态图和投影同步 sequence diagram。 | 无。 |
| Developer handoff readiness | Fail | Implementation plan 给出目标文件、PM-S1–PM-S4、追踪基线和确定性 checker。 | 验收字段与 authority 冲突会迫使实现者自行改变确认需求或伪造事件类型；最终 proof commit 的绑定顺序还需局部澄清。 |

## Qualified Areas

- Cycle 2 正确绑定上一轮结果，requirements 内容与 SHA-256 保持不变。
- `ProjectionState` 与业务 `Status` 已分离，stale 检测、停止晋级、补偿同步、清除证据和历史保留规则清楚。
- `In Review -> Blocked`、`Deferred` 恢复和 `Accepted -> Draft` 已进入穷举转换表，并给出 guard、authority、evidence 与 fallback。
- 追加式验收历史、current/latest pointer 和旧 `Accepted` 不覆盖的总体模型正确。
- 依赖图、关键路径、单一项目入口、跨任务 authority 与 IP-01–IP-08 独立 lifecycle 边界保持一致。
- Checker contract 已给出固定输入、算法、排序、输出 schema 和退出码，能够指导实现者生成可复核证据。
- 本次只审查精确计划快照和上游文档，没有检查或修改 feature 实现代码。

## Disqualified Gaps And Risks

| Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- |
| Major | C2-MAJOR-001：验收历史 schema 删除了确认需求指定字段 | Requirements 第 104、128、152 行明确要求 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence` 并禁止覆盖原 `AcceptedCommit`；design 第 199–213 行改用 `Actor`、`DecidedAt`、`SubmittedCommit`、`Evidence`，且对 design/implementation plan 搜索四个确认字段无匹配。 | 生成的八份计划可能语义近似却不满足确认文档字段契约；checker 也可能错误放行缺少强制字段的计划，破坏 PM-AC-001/002/005 的可观察性。 | 保留并定义四个确认字段。可以把它们放入每条 `Accepted` history record，或作为指向当前 record 的明确投影字段，但必须写清与 generic attempt 字段的映射、空值、owner、验证、重开/升版行为，并让 checker 精确验证。 | yes |
| Major | C2-MAJOR-002：Code Review 结果与验收记录 authority 被混用 | Design 第 207 行要求 `AcceptanceRecord.Actor` 只能是指定验收方；第 332–333、425 行却要求 “Review/验收拒绝” 都追加 `Rejected` record。第 222–228、338 行要求 Main/Requirements 触发 `Superseded`，但 record actor 仍没有按 result 区分 authority。 | Code Review 要求修改或 Requirements 触发升版时，没有合法的指定验收方 actor；实现者只能伪造验收身份、跳过规定记录或自行扩张 owner 权限。 | 将 Code Review result/finding 与 AcceptanceRecord 分离：Review 拒绝引用 immutable review result，不创建验收 `Rejected`；只有真实验收方拒绝才追加 `Rejected`。为 `Accepted`、`Rejected`、`Superseded` 分别定义合法 actor/recorder，且不得改写原 `Accepted` actor。同步更新状态表、失败恢复和 checker。 | yes |
| Minor | C2-MINOR-001：治理证明绑定最终 PR head 的顺序仍有歧义 | Implementation plan 第 167–173 行先运行 checker、写入 `CheckedCommit`，再提交；第 260 行又要求 `CheckedCommit=HEAD`，第 384–389 行描述 F4 内容 commit 与 F5 证据 commit。 | 若 checker 读取未提交工作树，digest 不绑定 `HEAD`；若绑定 F4 后再提交 F5 证据，记录的 commit 又不是最终 CodeReviewRequest head。 | 明确两提交证明协议：F4 clean commit → checker 绑定 F4 → F5 仅写证明 → 对 F5 运行不修改文档的最终 checks 并让 CodeReviewRequest 绑定 F5；或将 proof 外置，使完整 checker 可直接绑定最终 head。 | no |

## Data Structure Review

| Object / schema | Field | New or changed | Type | Required | Default | Validation | Compatibility / migration note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ProjectPlanSummary` | 14 个 summary/pointer 字段 | New | 已定义 | yes | 已定义 | ID、DAG、projection 和 pointer parity | 新增 Markdown 投影，无运行时迁移。 |
| `ImplementationPlan` | 计划元数据和 history pointer | New | 已定义 | yes | 已定义 | lifecycle、版本、依赖、current pointer | 需要补回确认验收字段或明确当前投影。 |
| `AcceptanceRecord` | attempt/history 字段 | New | 已定义 | yes | 部分字段用 `None` | ID、版本、commit、result、pointer | 追加式模型可用；字段名和 result-specific authority 必须修正。 |
| `BlockerRecord` | 阻塞字段 | New | 已定义 | yes | 无活动 record | owner、exit、review point | 通过。 |
| `ChangeRecord` | 变更历史字段 | New | 已定义 | yes | 无 | 只追加、补偿修订 | 通过。 |
| `StalenessRecord` | 检测/清除字段 | New | 已定义 | yes | clear 字段为 `None` | 成对投影、停止晋级、证据清除 | 通过。 |

## Data Flow And Lifecycle Review

- Data flow: Main 从 durable lifecycle、Review、Git/PR/check/merge 与验收 authority 读取精确事实，在同一 change 中更新独立计划和 project summary，再由 checker 比较并产生 Current/Stale 结果。
- Core object lifecycle: Draft、Ready、In Progress、Blocked、In Review、Accepted、Deferred 的进入、恢复和 fallback 已穷举；验收历史只追加并通过 pointer 表达当前有效记录。
- Missing transitions or ownership rules: Code Review failure 不应制造 acceptance rejection；`Superseded` 的合法 actor/recorder 未按 result 定义；确认验收字段与 generic history 字段的映射缺失。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: 依赖图、状态图和投影同步 sequence diagram 足以表达依赖、核心生命周期和数据投影路径。
- Recommended diagram changes: 修复 C2-MAJOR-002 后，在状态表 evidence 列分别引用 `TechnicalPlanReviewResult`/`CodeReviewResult` 与 `AcceptanceRecord`，避免把两类 authority 合并为“Review/验收”。

## Implementation Readiness

- Clear implementation path: PM-S1 创建八份计划，PM-S2 创建入口，PM-S3 收敛旧入口与 Changelog，PM-S4 生成验证证据和 Review request。
- Affected modules/components: `CHANGELOG.md`、原总实施计划、`docs/project-management.md` 和八份 `docs/implementation-plans/v0-1/*.md`。
- Open decisions developers would still need to make: 确认字段如何保留；Review rejection 与 acceptance rejection 如何分离；`Superseded` 的 actor authority；最终 proof/head 的两提交顺序。

## Verification Readiness

- Test strategy: 文件、metadata、章节、DAG、summary parity、trace、AC、transitions、acceptance history、staleness、links 和 secrets 均有固定 check ID。
- Missing proof: checker 尚未要求确认的四个验收字段；F4/F5 与最终 CodeReview head 的绑定顺序未完全明确。
- Manual or smoke validation needed: 继续抽查 IP-01、IP-05、IP-08，并在修复后手工演练 Code Review rejection、acceptance rejection、accepted-version supersede 三条不同路径。

## Modification Recommendations

1. 保留确认需求指定的验收字段，并把 current projection 与 append-only history 的关系写成可由 checker 验证的唯一映射。
2. 分离 Review result 与 AcceptanceRecord，按 result 明确 actor/recorder authority，尤其是 `Rejected` 与 `Superseded`。
3. 明确 F4 内容 commit、F5 proof commit 和最终 CodeReviewRequest head 的验证顺序。

## Re-review Requirements

重新提交 cycle 3 的同一 feature 新快照，并满足：

1. design 和 implementation plan 显式包含并验证 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`；
2. Code Review rejection 不再要求伪造指定验收方的 `Rejected` record，三种 acceptance result 的合法 actor/recorder 完整；
3. checker contract 覆盖上述字段与 authority 规则；
4. 澄清最终 PR head 与治理 proof 的绑定顺序；
5. requirements、design、implementation plan 位于新的同一精确 commit，并由 lifecycle 生成下一轮 `TechnicalPlanReviewRequest`。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务为 ready Review，feature cycle 2、stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：cycle-2 请求作为新请求接受，并验证上一结果 message ID。
- `git cat-file -t 752997...`：精确对象为 commit，parent 为 cycle-1 snapshot。
- `git ls-remote --heads origin codex/review-records/.../plan-2-752997b64d6b`：创建前远端不存在该 review-record branch。
- `shasum -a 256`：requirements、design、implementation plan 分别匹配请求中的 `9ca2a55...`、`7e34a36...`、`59b3474...`。
- `git diff --check 22798...752997`：通过。
- `rg "AcceptedBy|AcceptedAt|AcceptedCommit|AcceptanceEvidence"` 对 design/implementation plan 无匹配。
- 本次是计划 re-review；没有运行运行时代码测试，没有修改 feature 分支，也没有审查实现代码。
