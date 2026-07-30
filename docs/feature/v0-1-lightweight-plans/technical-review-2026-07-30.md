# Technical Plan Review: v0.1 轻量实施计划重整（Cycle 1）

- Review date: 2026-07-30
- Reviewed artifact(s):
  - `docs/feature/v0-1-lightweight-plans/requirements.md`
  - `docs/feature/v0-1-lightweight-plans/design.md`
  - `docs/feature/v0-1-lightweight-plans/implementation-plan.md`
- Reviewed plan commit: `431f2f939cc4ad1cebb660b87ec245245b92bec7`
- Reviewed composite SHA-256: `828451f6f9b43397f98e0eba5ec2886adee8c76f7a56bf41e572c23244831fa3`
- Review request: `67d682f442f6aeae7dfb3010f651b67568592b4699646cdb8250d7e2a0b0cc9e`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: 计划把交付物严格限定为五份轻量实施计划、一份项目管理入口及其文档记录，数据模型、更新流、状态生命周期、文件边界、验收和回滚均足以直接实施。验证方式与纯 Markdown 变更的风险相称，未重新引入被明确排除的软件治理系统。

## Handoff Judgment

这份精确计划快照可以交给开发者。确认需求说明了为什么要撤回旧 feature 的过度设计，
设计把目标落实为清晰的 Markdown 文档模型、受控状态和人工更新流，实施计划列出了
目标文件、三个实现 slice、唯一主归属表、验证步骤、回滚方式和明确停止条件。

本次 Pass 只批准 commit `431f2f939cc4ad1cebb660b87ec245245b92bec7` 和 composite
digest `828451f6f9b43397f98e0eba5ec2886adee8c76f7a56bf41e572c23244831fa3`。
后续 requirements、design 或 implementation plan 发生变化时，需要提交新的精确快照。

旧 `v0-1-project-management` GoalRun 当前仍为 `BLOCKED` 并占用 active Goal 槽位。
计划已经把“通过受支持的生命周期修复流程合法释放或归档它”列为 F4 前置条件，并明确
禁止手工修改 durable state。该外部前置条件不构成本计划的设计缺口；如果届时不存在
受支持的修复路径，Main 必须保持阻塞并请求 workflow repair，不得用仓库代码绕过。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 说明旧方案的范围扩张和维护成本，Goals/Non-goals 将结果限定为五份计划与一份轻量入口。 | 无。 |
| Data structure clarity | Pass | Design §6 定义管理入口六列、单计划十个章节、验收记录和五个受控状态；§5 明确 artifact owner。 | 无。 |
| New/changed fields highlighted | Pass | `Plan ID`、依赖、状态、阻塞、下一步及验收结论/验收人/UTC/证据字段均被显式列出，并给出初始值。 | 无。 |
| Data flow clarity | Pass | Design §8 的 Mermaid 图和更新规则说明实际证据如何进入单计划、管理入口、人工审阅和同一 Git 变更。 | 无。 |
| Core object lifecycle | Pass | 没有新运行时对象；文档计划从 `Not Started` 创建，按事实更新至受控状态，验收和回滚规则明确。 | 无。 |
| Flow diagram | Pass | Design §8 包含与文字规则一致的更新流 flowchart。 | 无。 |
| Developer handoff readiness | Pass | Implementation plan 给出目标文件、内容模板、trace 分配、LPS-1–LPS-3、验证、rollout、rollback 和停止条件。 | 无。 |

## Qualified Areas

- Requirements、design 和 implementation plan 的 SHA-256 与路由请求完全一致。
- Design 中的 `RequirementsCommit` 指向 `59a024111afe5c752ecdefcf4cbfd9fb7be73bd8`；
  该提交至本次 plan commit 的 requirements 文件无差异。
- LP-01 至 LP-05 覆盖 `REQ-001`–`REQ-027` 和 Slice 0–9；
  `REQ-028`/`AC-020` 由当前 planning feature 承接。
- `AC-001`–`AC-019` 各有一个主要 LP 归属，跨计划场景没有被错误解释为多份计划同时验收。
- 管理入口和单计划的责任边界明确：入口只汇总，单计划保存自己的范围和验收详情。
- 状态不从 Git、日期、PR 或 lifecycle stage 自动推断；无证据时保持 `Not Started`
  或明确 `Blocked`。
- 文件范围冻结为六份目标 Markdown、Changelog 和本 feature 的记录更新；运行时代码变化
  必须停止并重新评估。
- 验证只使用现有 Git/shell、Markdown 结构、路径/链接、覆盖表和人工审阅，不创建脚本、
  fixture、外部缓存或项目级 checker。
- Rollout、rollback、未知用户改动冲突、安全数据边界和变更范围均有明确处理方式。

## Disqualified Gaps And Risks

无。未发现 Blocker、Major 或 Minor finding。

## Data Structure Review

| Object / schema | Field | New or changed | Type | Required | Default | Validation | Compatibility / migration note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project management entry | Plan ID、Plan、Depends on、Status、Blocker、Next step | New | Markdown table fields | yes | `None`/`Not Started` where applicable | 人工核对枚举、依赖、链接和单一入口 | 纯文档新增，无运行时迁移。 |
| Individual LP plan | 十个固定章节、Plan ID、标题、Slice 范围 | New | Markdown sections/metadata | yes | 初始模板值 | 人工核对章节、范围和可观察验收场景 | 纯文档新增。 |
| Plan status | `Not Started`、`In Progress`、`Blocked`、`Ready for Acceptance`、`Accepted` | New controlled vocabulary | enum-like Markdown value | yes | `Not Started` | 依据实际工作和证据人工维护 | 不映射或复制 workflow durable state。 |
| Acceptance record | 结论、验收人、UTC 时间、证据链接 | New | Markdown fields | only after acceptance | `None` | 人工确认；不自行判定 lifecycle 授权 | 单计划记录，不传播为其他计划结果。 |
| Primary trace assignment | REQ、AC、Slice → LP | New | Markdown mapping table | yes | none | 每项唯一主归属人工核对 | 不创建机器可读 contract。 |

## Data Flow And Lifecycle Review

- Data flow: 实际工作或证据变化 → 更新对应 LP → 同步管理入口摘要 → 人工审阅 Markdown、
  链接和范围 → 同一 Git 变更提交。
- Core object lifecycle: 五份计划以 `Not Started` 创建；进展、阻塞、待验收和接受状态
  均由人依据证据更新；单份验收只影响该计划，后继计划继续遵守依赖。
- Failure handling: 范围重复/遗漏通过调整归属表解决；入口不一致时同提交修正；未知用户
  改动冲突时停止；链接失败在提交前修复。
- Missing transitions or ownership rules: 无。

## Flow Diagram Review

- Diagram present: yes
- Diagram adequacy: 一个四节点 flowchart 足以说明本次纯文档 feature 的数据和更新路径；
  不需要为无运行时对象的任务增加状态机或跨服务 sequence diagram。
- Recommended diagram changes: 无。

## Implementation Readiness

- Clear implementation path: LPS-1 创建五份计划，LPS-2 创建唯一入口，LPS-3 更新 feature
  记录与 Changelog，随后执行轻量验证并进入 exact-head Code Review。
- Affected modules/components: `docs/project-management.md`、
  `docs/implementation-plans/v0-1/lp-*.md`、本 feature 文档和 `CHANGELOG.md`。
- Open decisions developers would still need to make: 无产品或文档边界决定。旧 blocked Goal
  的合法释放是外部执行前置条件，不能由实现者自行设计替代方案。

## Verification Readiness

- Automated proof: `git diff --check`、`git status --short` 和 exact plan commit 到实现 head
  的文件范围 diff。
- Manual proof: 六份目标文档及链接、十个固定章节、初始状态、依赖链、唯一 REQ/AC/Slice
  主归属、每份计划的可观察验收场景，以及明确排除项搜索。
- Risk proportionality: 本次不改运行时代码，因此不要求单元、集成、E2E、GitHub API、
  workflow state simulation 或部署 smoke。
- Missing proof: 无。

## Modification Recommendations

无强制修改。进入 F4 前只需严格执行已经写明的 Goal 槽位前置条件：若 lifecycle
没有提供受支持的解除/归档路径，应停止并请求 workflow repair，不得扩大本 feature
或手工编辑 durable state。

## Re-review Requirements

无。本轮 Pass 授权精确 plan commit 与 composite digest 进入后续流程。任何计划制品
变化都必须生成新的 plan review cycle。

## Review Evidence And Limitations

- `workflowctl.py status`：当前任务绑定 `review`，bootstrap ready；本 feature 为 cycle 1、
  stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：请求作为新请求接受，路由、仓库、cycle 和消息 ID 有效。
- `git cat-file -t 431f2f...`：精确对象为 commit。
- `git ls-remote --heads origin codex/review-records/.../plan-1-431f2f939cc4`：
  创建前远端 review branch 不存在。
- `shasum -a 256`：requirements、design、implementation plan 分别匹配请求中的
  `adab7ecd...`、`74ddc449...`、`8d5e3f46...`。
- `git diff --exit-code 59a024...431f2f -- requirements.md`：确认后的 requirements
  在设计/计划阶段未变化。
- `git merge-base --is-ancestor 9259d884... 431f2f...`：本 feature 基于原始 v0.1
  规划基线，不依赖旧过度设计实现分支。
- `git diff --check 9259d884...431f2f...`：通过。
- `workflowctl.py --help`：当前 helper 没有 cancel/archive Goal 命令，因此 Review
  不声称旧 Goal 已被释放；只确认计划正确地把它作为外部前置条件。
- 本次只审查计划制品及必要基线，没有实现 feature、修改 feature branch 或检查未来代码。
