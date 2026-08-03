# v0.1 项目管理

本页是 v0.1 五份实施计划的唯一管理入口。它只汇总计划依赖、当前状态、阻塞和
下一步；范围、阶段和验收细节以各计划文档为准。计划状态由维护者按实际证据更新，
不会从 Git、PR 或 Engineering Lifecycle 状态自动推断。

## 计划索引

| Plan ID | Plan | Depends on | Status | Blocker | Next step |
| --- | --- | --- | --- | --- | --- |
| LP-01 | [核心基础与 Idea 流程](./implementation-plans/v0-1/lp-01-core-idea-flow.md) | None | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-02 | [项目执行与决策闭环](./implementation-plans/v0-1/lp-02-execution-decisions.md) | LP-01 | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-03 | [结构化汇报与双角色体验](./implementation-plans/v0-1/lp-03-reporting-role-experience.md) | LP-02 | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-04 | [AI Skill 与可重复演示](./implementation-plans/v0-1/lp-04-ai-skill-demo.md) | LP-03 | Accepted | None | 保留 `ACCEPTED_NO_PUBLISH` 关闭记录；无发布动作 |
| LP-05 | [部署与发布就绪](./implementation-plans/v0-1/lp-05-deployment-release.md) | LP-04 | In Progress | Code Review Cycle 2 的主动操作、精确恢复目标和 HTTP 安全边界 finding 正在闭合；生产目标和授权仍未提供 | 完成全量门禁并重新送审 exact head；获独立目标授权后才执行真实部署、备份恢复和公网 re-smoke |

## 依赖

验收依赖为 `LP-01 → LP-02 → LP-03 → LP-04 → LP-05`。后续计划可以提前准备
不依赖前序结果的工作，但不得绕过依赖计划的验收结论。

当前阻塞：LP-05 的仓库发布候选、生产拓扑、备份/恢复、状态机、证据和运维资产可以在
隔离环境完成送审，但生产目标尚未提供。服务器、域名/DNS、仓库外秘密交付、备份位置、
公开合成数据许可和绑定精确候选的部署授权全部到齐前，不执行或声称完成真实部署。

总体下一步：完成 LP-05 Cycle 2 修复、全量验证和 exact-head Engineering Review。代码合并后仍需独立
生产授权，才能执行真实 HTTPS 部署、生产备份到隔离恢复、核心演示和公网 re-smoke；这些
证据齐全前 LP-05 不得标为 `Accepted`。

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

LP-03 已通过 Engineering Lifecycle 的 `ACCEPTED_NO_PUBLISH` 迁移正式关闭：

- merge commit:
  `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- acceptanceId:
  `7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8b`
- closureId:
  `25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`
- releaseTargets: `[]`
- 发布产物：没有 tag、GitHub Release、package、部署或其他发布产物。

LP-04 已通过 Engineering Lifecycle 的 `ACCEPTED_NO_PUBLISH` 迁移正式关闭：

- merge commit:
  `46e021d261fd8a663c83430a551f5674365ccf14`
- acceptanceId:
  `cf7593f335dacb092294d51f97bcd9d9e957293c8dc1f570307066c342fe48af`
- closureId:
  `14a81f052aff6dc34ba6bb6550a725a0f5f926ade104515cf1ab85bcca1ce1eb`
- releaseTargets: `[]`
- 发布产物：没有 tag、GitHub Release、package、生产部署或其他外部发布产物。

LP-05 的仓库验证和外部阻塞见
[LP-05 verification](./feature/lp-05-deployment-release/verification.md)。

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
