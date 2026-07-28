# IP-05 结构化项目汇报

- PlanId: `IP-05`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-08-01`
- Dependencies: `IP-01, IP-03`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- ReviewRejectionRecord: `ImmutableReviewResult+ChangeRecord;NoRejectedAcceptanceRecord`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

让 AI 为不同项目提交经过约束的声明式汇报数据，服务端按固定协议校验并保存不可变
revision，前端以七种安全块按项目自适应渲染。无效输入、虚假权威状态或渲染异常
不会覆盖项目事实，也不会破坏上一份有效报告。

## 2. Scope

- Slice 5：九步校验管线、report revision、七种 block renderer 和错误回退。
- 主归属：`REQ-021`–`REQ-025`。
- 使用 IP-01 contracts 与 IP-03 权威项目事实。

## 3. Non-goals

- 不允许 AI 提交 HTML、JavaScript、CSS 或任意组件代码。
- 不让 report payload 定义/覆盖项目状态、确认、actor 或审计历史。
- 不实现完整双角色页面；属于 IP-06。

## 4. Inputs and entry gate

1. IP-01 与 IP-03 当前版本均 `Accepted`。
2. report schema、权威引用和 Evidence 数据可复核。
3. IP-05 有独立 RequirementsHandoff、PASS plan review、branch 和 AcceptanceOwner。
4. 七种 block、大小限制、受限 Markdown、版本/幂等规则在独立计划中确认。
5. 当前投影 `Current` 后才能激活唯一 GoalRun。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Validation | 协议规定的九步 pipeline、JSON Schema 与语义/权威校验 |
| Persistence | immutable revision、payload digest、latest accepted/renderable pointers |
| API | submit/read report、幂等、`basedOnRevision` 并发和定位错误 |
| Renderer | 七种固定 block、受限 Markdown、权威引用补全 |
| Recovery | ErrorBoundary、安全诊断、上一可渲染 revision 回退 |
| Tests | schema/semantic contract、revision integration、renderer unit |

## 6. Execution plan

1. 从 contracts 单一 schema 实现语法、语义、大小、引用和权威隔离校验。
2. 规范化 payload 并计算 digest，保存不可变 revision。
3. 实现 request ID 幂等和 `basedOnRevision` optimistic concurrency。
4. 实现七种固定组件与受限 Markdown，不执行提交内容。
5. 固定项目权威头，动态区只消费报告内容。
6. 实现渲染异常回退、诊断和上一有效版本指针。
7. 覆盖两个结构完全不同的报告、无效/冲突/运行时异常场景。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| schema/semantic 无效 | 返回可定位错误，不创建 revision |
| 权威字段冲突 | 忽略/拒绝声明，项目权威头保持不变 |
| 重复请求 | 返回原 revision，不重复写入 |
| basedOnRevision 冲突 | 返回当前 revision 和恢复提示 |
| renderer 异常 | 捕获并展示上一可渲染 revision |
| 新协议不可读旧数据 | 继续按 `schemaVersion` 读取，不重写旧 revision |

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
| Normal | 七块、不同 section 顺序、两个不同项目、revision/pointer |
| Failure | 未知字段、危险链接、越界大小、语义错误、权威冲突 |
| Retry/concurrency | request ID 幂等、basedOnRevision 409 |
| Security | Markdown 协议限制；无 HTML/script/style；外链属性安全 |
| Recovery | 无效报告不写入；人为 block 异常回退上一有效版本 |

## 9. Independent acceptance checklist

- [ ] `IP-05-MUST-001` 九步校验与可定位错误符合协议。
- [ ] `IP-05-MUST-002` 两个项目可用不同章节/顺序并正确渲染。
- [ ] `IP-05-MUST-003` revision 不可变，幂等/并发 pointer 规则通过。
- [ ] `IP-05-MUST-004` report 不能覆盖权威状态、确认、actor 或历史。
- [ ] `IP-05-MUST-005` 无效输入和 renderer 异常保留上一份有效报告。
- [ ] `IP-05-MUST-006` 精确 head 的 contract/integration/web tests、Review、merge 和验收完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-021, REQ-022, REQ-023, REQ-024, REQ-025 |
| Slice | Slice 5 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-014 | 汇报 API 的结构化成功/失败 |
| AC-016 | 不同项目的声明式自适应渲染 |
| AC-017 | 校验错误/渲染异常安全回退 |
| AC-018 | 权威状态与历史不被 payload 覆盖 |
| AC-020 | 遵循经审阅基线 |

Sources: [report protocol](../../feature/v0-1-project-plan/structured-report-protocol.md),
[report schema](../../feature/v0-1-project-plan/schemas/structured-report.v1.schema.json),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 5 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| renderer 过度设计 | 增加协议外 block | 不增加类型，只完成七块 |
| 权威混入 payload | 前端从 report 取状态 | 固定权威头与引用补全 |
| 旧报告失效 | schema 升级覆盖 revision | 版本化读取，保留旧数据 |
| XSS/危险链接 | Markdown/URL 绕过 | allowlist、协议校验、无 raw HTML |

不需要生产数据或凭据；测试只使用合成报告。

## 12. Next step

Summary: 等待 IP-01 与 IP-03 Accepted 后创建独立需求

IP-01 与 IP-03 均 Accepted 后创建独立需求。IP-05 Accepted 后，IP-06 与
IP-07 才满足其报告依赖。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 5 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

验收只针对本 PlanId 与精确 commit；`Accepted` 的四个确认字段缺一不可。
Code Review 退回只引用 immutable Review result 并追加 ChangeRecord，不创建
`Rejected` AcceptanceRecord。
