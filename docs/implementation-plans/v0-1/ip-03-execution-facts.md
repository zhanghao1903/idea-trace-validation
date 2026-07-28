# IP-03 项目执行事实与关注事项

- PlanId: `IP-03`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-07-30`
- Dependencies: `IP-02`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

让执行者通过 AI 持续提交可追踪的项目进展、难点/阻塞、待确认问题、支持请求、
证据和回应；所有写入与审计同事务，错误变化可用追加式纠正、暂停、恢复或重开
处理，不静默删除历史。

## 2. Scope

- Slice 3：非终态项目转换、ProgressUpdate、AttentionItem、Evidence 和详情查询。
- 主归属：`REQ-006`–`REQ-009`、`REQ-013`。
- 支撑 IP-04 的结论确认、IP-06 的角色页面和 IP-07 的演示。

## 3. Non-goals

- 不完成终态结论/人类确认；属于 IP-04。
- 不渲染结构化项目报告；属于 IP-05/IP-06。
- 不 fetch 外部 URL，不做文件上传或对象存储。

## 4. Inputs and entry gate

1. IP-02 当前版本已 `Accepted`，Idea 与项目关联/API 基础可复核。
2. IP-03 有独立确认 RequirementsHandoff、PASS plan review 和 feature branch。
3. AcceptanceOwner、允许的项目转换和审计契约已被独立需求确认。
4. 当前投影 `Current`，依赖验收记录有效。
5. Main 只在上述条件满足后激活唯一 GoalRun。

缺失或 stale 时保持 `Draft`。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Project transitions | start、pause、resume 等非终态命令与允许恢复路径 |
| Progress | 摘要、完成工作、当前状态、下一步、证据、更新时间的追加记录 |
| Attention | blocker、confirmation question、support request 及回应/解决历史 |
| Evidence | HTTPS 外链与元数据、项目归属验证，不 fetch/上传 |
| Correction | 追加式纠正、暂停、重新打开/撤销边界和完整 AuditEvent |
| Queries/tests | project detail/history 和 API workflow 集成测试 |

## 6. Execution plan

1. 在 application 层实现项目非终态转换和 optimistic concurrency。
2. 实现 ProgressUpdate；进展本身不能隐式改变项目状态。
3. 实现三类 AttentionItem、回应、关闭/解除及不可变历史。
4. 实现 Evidence 元数据、HTTPS 校验和跨项目引用保护。
5. 让业务写入、版本更新和 AuditEvent 在同一事务。
6. 实现项目详情/history 查询并覆盖幂等、并发、纠正和恢复测试。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| 进展写入失败 | 不更新读取投影；同 request ID 可安全重试 |
| 进展声称改变状态 | 拒绝，要求调用显式 transition |
| 非 HTTPS/跨项目证据 | 结构化拒绝，不保存部分记录 |
| 并发版本冲突 | 返回 409、当前版本和恢复路径 |
| 错误事项/进展 | 追加纠正或关闭记录，原记录保留 |
| 真实外部 impasse | 状态进入 Blocked 并记录完整 BlockerRecord |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`，均受
[项目级 authority 契约](../../project-management.md)约束。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Normal | 开始/暂停/恢复、进展、三类事项、回应、证据和历史 |
| Failure | 非法转换、非 HTTPS、跨项目引用、无效回应被拒绝 |
| Retry/concurrency | 相同请求不重复；版本冲突不覆盖 |
| Security | 不 fetch URL；日志不包含正文、token、cookie 或数据库 URL |
| Recovery | 事项解决保留原文/回应；纠正和重开保留审计 |

## 9. Independent acceptance checklist

- [ ] `IP-03-MUST-001` 进展包含摘要、完成工作、状态、下一步、证据和时间。
- [ ] `IP-03-MUST-002` blocker、待确认问题、支持请求均含背景、影响和处理状态。
- [ ] `IP-03-MUST-003` 回应/解除后原记录和历史仍可追踪。
- [ ] `IP-03-MUST-004` 进展不隐式改状态，非法转换和并发覆盖被拒绝。
- [ ] `IP-03-MUST-005` Evidence 只允许有效 HTTPS/同项目引用且服务端不 fetch。
- [ ] `IP-03-MUST-006` 业务事实与审计同事务，精确 head 证据完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-006, REQ-007, REQ-008, REQ-009, REQ-013 |
| Slice | Slice 3 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-005 | 提交追加式进展与历史 |
| AC-006 | executor 读取未完成/完成及关注项 |
| AC-007 | blocker 背景、影响、状态、解除 |
| AC-008 | 待确认问题、选项、影响和回应 |
| AC-009 | 支持请求、回应和状态 |
| AC-011 | 非法项目转换被拒绝 |
| AC-012 | 纠正、暂停、重开不删除历史 |
| AC-014 | API 重试/失败结构化 |
| AC-020 | 遵循经审阅基线 |

Sources: [domain model](../../feature/v0-1-project-plan/domain-model.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 3 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| 事实/状态混用 | 进展写入改变状态 | 拆分 command，拒绝隐式转换 |
| 审计断裂 | 写入成功但 AuditEvent 缺失 | 单事务并回滚整次操作 |
| 事项不可恢复 | close 删除原记录 | 改为追加回应/状态变化 |
| 外链风险 | API fetch 用户 URL | 只存元数据并校验 HTTPS |

不需要生产凭据或真实业务数据。

## 12. Next step

IP-02 Accepted 后由 Requirements 创建 IP-03 独立需求。IP-03 Accepted 后，
IP-04 与 IP-05 可并行进入各自需求/计划阶段。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 3 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

验收记录只追加。Code Review 退回只记 Review result/ChangeRecord；真实验收拒绝才
产生 `Rejected`；升版追加 `Superseded` 且保留原 `AcceptedCommit`。
