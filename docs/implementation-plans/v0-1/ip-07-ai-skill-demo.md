# IP-07 AI Skill 与演示闭环

- PlanId: `IP-07`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-08-03`
- Dependencies: `IP-02, IP-03, IP-04, IP-05, IP-06`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

提供 Codex、Claude 和兼容 AI 客户端可遵循的 Skill，使其从自然语言意图进入真实
API 旅程、遵守人类确认和幂等边界、不保存独立状态；同时提供可重复演示数据、
自动 smoke 与人工脚本，覆盖 v0.1 的完整产品故事。

## 2. Scope

- Slice 7：Skill、API workflows、report protocol reference、demo seed/smoke/E2E。
- 主归属：`REQ-020`、`REQ-027`。
- 组合演练 IP-02–IP-06，但不替代它们的独立验收。

## 3. Non-goals

- 不实现 MCP Server、聊天持久化或 AI 自己的权威状态。
- 不允许 Skill 绕过 API、生命周期、人类确认或访问边界。
- 不使用真实公司/个人业务数据或生产 token。

## 4. Inputs and entry gate

1. IP-02–IP-06 当前版本全部 `Accepted`。
2. OpenAPI、角色旅程、确认和 report protocol 稳定可复核。
3. IP-07 有独立 RequirementsHandoff、PASS plan review、branch 和 AcceptanceOwner。
4. 演示数据公开范围与 secret 边界已确认。
5. 投影 `Current` 后激活唯一 GoalRun。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Skill | 角色识别、字段收集、API 调用、确认边界、重试和纠正 |
| References | API workflows、report protocol、稳定错误/允许恢复路径 |
| Demo data | Idea 池、执行中、blocked、待确认、支持、动态报告、完成项目 |
| Automation | seed、demo smoke、browser E2E，使用真实 API |
| Human docs | `docs/demo-script.md` 与同步 OpenAPI |
| Security | token 不写入 Skill、fixture、日志或仓库 |

## 6. Execution plan

1. 从 OpenAPI 和已确认旅程编写 Skill 指令，不复制独立业务状态。
2. 为 proposer、executor、确认和报告写自然语言到 API 的完整示例。
3. 定义 request ID 复用、网络未知结果、409、验证错误和纠正策略。
4. 创建确定性演示 seed，覆盖全部角色、状态、事项、报告和结论。
5. 实现 demo smoke 与浏览器故事；所有写入走真实 API。
6. 编写人工演示脚本并验证 Skill 不绕过人类确认。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| 网络结果未知 | 复用相同 request ID 查询/重试 |
| validation error | 根据字段路径向用户补充信息，不伪造 |
| lifecycle conflict | 展示当前状态与允许恢复路径 |
| confirmation required | 停止并请求人类完成确认 |
| seed 部分失败 | 使用确定性 ID/事务清理后重跑 |
| Skill/API 漂移 | 修正 OpenAPI/Skill 契约，不添加隐藏参数 |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`，遵循
[项目级 authority 契约](../../project-management.md)。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Normal | 创建/澄清/推进、进展/事项、报告、确认、完成与两角色查看 |
| Failure | 不完整信息、网络未知、409、报告无效、确认缺失 |
| Retry | 相同 request ID 不重复创建/更新 |
| Security | Skill/seed/log 无 token、cookie、URL 凭据或真实私密数据 |
| E2E | 自动与人工演示覆盖 AC-001–019 主路径且可重复 |

## 9. Independent acceptance checklist

- [ ] `IP-07-MUST-001` Skill 从自然语言生成可验证的真实 API 调用。
- [ ] `IP-07-MUST-002` Skill 不保存独立状态、不绕过确认、能安全重试/纠正。
- [ ] `IP-07-MUST-003` demo seed 覆盖 Idea 池、执行、事项、动态报告和完成项目。
- [ ] `IP-07-MUST-004` demo smoke 与浏览器故事可从干净演示环境重复。
- [ ] `IP-07-MUST-005` OpenAPI、Skill references 和人工脚本一致且无秘密。
- [ ] `IP-07-MUST-006` 精确 head 的 E2E、Review、merge 和验收证据完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-020, REQ-027 |
| Slice | Slice 7 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-001 | AI 通过 Skill 创建 Idea |
| AC-015 | 角色自然语言请求完成核心旅程且无独立状态 |
| AC-019 | 可重复演示完整故事 |
| AC-020 | 遵循经审阅基线 |

Sources: [confirmed requirements](../../feature/v0-1-project-plan/requirements.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 7 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| Skill/API 漂移 | 示例需特殊隐藏参数 | 修契约并重新生成/校对 OpenAPI |
| 演示不确定 | seed 使用随机/外部数据 | 固定演示 ID、时钟和合成数据 |
| AI 越权 | Skill 直接确认终态 | 明确停点并要求 HumanConfirmation |
| secret 进入 fixture | token 写入示例 | 立即移除、轮换并扫描历史 |

需要用户确认哪些合成演示数据可公开；不需要生产服务器权限。

## 12. Next step

IP-02–IP-06 全部 Accepted 后创建 IP-07 独立需求。IP-07 Accepted 是 IP-08 的
硬依赖。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 7 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

计划验收不自动验收前序计划，也不代表已部署或发布。
