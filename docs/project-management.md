# v0.1 项目管理

本页是 v0.1 五份实施计划的唯一管理入口。它只汇总计划依赖、当前状态、阻塞和
下一步；范围、阶段和验收细节以各计划文档为准。计划状态由维护者按实际证据更新，
不会从 Git、PR 或 Engineering Lifecycle 状态自动推断。

## 计划索引

| Plan ID | Plan | Depends on | Status | Blocker | Next step |
| --- | --- | --- | --- | --- | --- |
| LP-01 | [核心基础与 Idea 流程](./implementation-plans/v0-1/lp-01-core-idea-flow.md) | None | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-02 | [项目执行与决策闭环](./implementation-plans/v0-1/lp-02-execution-decisions.md) | LP-01 | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-03 | [结构化汇报与双角色体验](./implementation-plans/v0-1/lp-03-reporting-role-experience.md) | LP-02 | Ready for Acceptance | None | 完成精确 head 代码审查、合并证明与正式验收 |
| LP-04 | [AI Skill 与可重复演示](./implementation-plans/v0-1/lp-04-ai-skill-demo.md) | LP-03 | Not Started | None | 为 LP-04 启动独立 Requirements 阶段 |
| LP-05 | [部署与发布就绪](./implementation-plans/v0-1/lp-05-deployment-release.md) | LP-04 | Not Started | None | 为 LP-05 启动独立 Requirements 阶段 |

## 依赖

验收依赖为 `LP-01 → LP-02 → LP-03 → LP-04 → LP-05`。后续计划可以提前准备
不依赖前序结果的工作，但不得绕过依赖计划的验收结论。

当前阻塞：`None`。

总体下一步：完成 LP-03 精确 head 代码审查、合并证明和正式验收。LP-04 保持
`Not Started`；当前记录不授予 LP-04 Requirements、设计或实现权限。

## 已接受依赖

LP-01 已通过 Engineering Lifecycle 的 `ACCEPTED_NO_PUBLISH` 迁移正式关闭：

- merge commit:
  `b562a3c0ede8384afef2007b8057a1250650a39f`
- acceptanceId:
  `35d19b6c45c96c037c011b8c0f371ebfd454ff4b762492e70e6dc98e0ee9ef4a`
- closureId:
  `82e0fb86b20b1f82e04d6ec4aa53a094e8cc32ea8ad3a7dfed3d2258ccb5188d`
- releaseTargets: `[]`
- 发布产物：没有 tag、GitHub Release、package、部署或其他发布产物。

LP-02 已通过 Engineering Lifecycle 的 `ACCEPTED_NO_PUBLISH` 迁移正式关闭：

- merge commit:
  `644af4f186b054a9c5d1c6db087a97e009f545a3`
- acceptanceId:
  `b63ec86101008217bfa6eab6bbeda41713735e7099b051a2a7e21f3026321cba`
- closureId:
  `418d1de3689d1bef9a1ce3ee2abf88cb3e44cd1976dc3ec40c2e15f7b63d5061`
- releaseTargets: `[]`
- 发布产物：没有 tag、GitHub Release、package、部署或其他发布产物。

LP-03 的客观实现证据见
[LP-03 verification](./feature/lp-03-reporting-role-experience/verification.md)。这里的
`Ready for Acceptance` 只表示实现和本地门禁已准备送审，不表示 Review 批准、已合并、
已发布或已正式验收。

## 主归属

下表只表达唯一的主要计划归属，不代表实现完成或授权。

| Plan ID | Primary requirements | Primary acceptance criteria | Source slices |
| --- | --- | --- | --- |
| LP-01 | REQ-001、REQ-002、REQ-003、REQ-004、REQ-005、REQ-011、REQ-012、REQ-019 | AC-002、AC-003、AC-011、AC-014 | Slice 0、Slice 1、Slice 2 |
| LP-02 | REQ-006、REQ-007、REQ-008、REQ-009、REQ-010、REQ-013 | AC-005、AC-007、AC-008、AC-009、AC-010、AC-012 | Slice 3、Slice 4 |
| LP-03 | REQ-014、REQ-015、REQ-016、REQ-017、REQ-018、REQ-021、REQ-022、REQ-023、REQ-024、REQ-025 | AC-004、AC-006、AC-013、AC-016、AC-017、AC-018 | Slice 5、Slice 6 |
| LP-04 | REQ-020、REQ-027 | AC-001、AC-015 | Slice 7 |
| LP-05 | REQ-026 | AC-019 | Slice 8、Slice 9 |
| 当前轻量规划 feature | REQ-028 | AC-020 | 不适用 |

## 更新规则

- 状态只使用 `Not Started`、`In Progress`、`Blocked`、
  `Ready for Acceptance`、`Accepted`。
- 状态、阻塞或下一步变化时，在同一变更中更新对应计划和本页。
- 单份计划的验收只改变该计划；不得据此自动改变其他计划。
- 无法确认进展时保持 `Not Started`；有明确阻塞时记录解除条件。
- Engineering Lifecycle 的权限与 durable state 由已安装 Skill 和 workflowctl
  管理，本页不授予实现、合并、部署或发布权限。
