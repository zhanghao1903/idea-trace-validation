# IP-06 双角色 Web 体验

- PlanId: `IP-06`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-08-02`
- Dependencies: `IP-02, IP-03, IP-04, IP-05`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

提供无需登录、可直接切换的想法提出者与执行者 Web 视图。两种视图突出各自职责，
但读取同一权威数据；项目详情固定展示权威头，并按 IP-05 报告协议呈现动态内容、
事项、历史和结论。

## 2. Scope

- Slice 6：React router/API client、role switcher、proposer/executor/detail 视图。
- 主归属：`REQ-014`–`REQ-018`。
- 集成 IP-02–IP-05 的 Idea、执行事实、确认和结构化报告能力。

## 3. Non-goals

- 不建设用户、注册、登录、账户、RBAC 或多租户。
- 不建设完整手工新增/编辑表单；AI/API 仍是主要写入入口。
- 不复制服务端状态机或为两种角色维护独立客户端权威状态。

## 4. Inputs and entry gate

1. IP-02、IP-03、IP-04、IP-05 当前版本全部 `Accepted`。
2. 角色查询、控制会话、确认和 report renderer API 稳定可复核。
3. IP-06 获得独立 RequirementsHandoff、PASS plan review、branch 和 AcceptanceOwner。
4. 可访问性、移动端基线和公开只读边界在独立需求中确认。
5. 投影 `Current` 后激活唯一 GoalRun。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| App shell | router、API client、loading/error/stale states、分享 URL |
| Role switch | 无需登录在 proposer/executor 间切换并保持 URL |
| Proposer | 全部 Idea、状态分组、最新进展、待确认和支持 |
| Executor | 未完成/已完成分组、下一步、阻塞、待确认和支持 |
| Detail | 权威项目头、动态报告、进展/事项/证据/结论历史 |
| Control | 公开只读；安全 cookie 启用确认、纠偏和允许状态操作 |
| Tests | component tests、role-views 浏览器 E2E、基本可访问性 |

## 6. Execution plan

1. 建立路由、API client、错误/旧数据状态和可分享 URL。
2. 实现无需登录的 role switcher；切换只改变呈现，不改变 authority。
3. 实现 proposer 分组与需本人处理的事项。
4. 实现 executor 未完成/完成分组与优先关注信息。
5. 实现项目权威头、动态报告和历史详情。
6. 接入控制 cookie 的有限动作，不提供完整 CRUD 表单。
7. 覆盖刷新、直接 URL、空/失败/旧数据、键盘和移动端 E2E。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| API 加载失败 | 显示可重试错误，不伪造空/完成状态 |
| 数据陈旧 | 明确 stale 标识并重新获取 |
| report 渲染异常 | 使用 IP-05 的上一有效版本回退 |
| 控制会话无效 | 保持公开只读，不降级为不安全写入 |
| 角色切换丢状态 | URL 成为导航事实，重新读取服务端投影 |
| 不可访问交互 | 修复语义/键盘/焦点后再进入 Review |

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
| Normal | proposer/executor 切换、分组、详情、动态报告和有限控制 |
| Failure | 空、加载、失败、旧数据、无控制会话状态明确 |
| Authority | 两视图同源；report 不覆盖权威头；公开访问只读 |
| Accessibility | 键盘、焦点、语义标签和基本移动端布局 |
| E2E | 刷新/直接 URL 保持角色；待确认/支持/结论跨视图一致 |

## 9. Independent acceptance checklist

- [ ] `IP-06-MUST-001` 无需登录可直接切换角色并通过 URL 保持视图。
- [ ] `IP-06-MUST-002` proposer 识别全部 Idea、状态、进度和需处理事项。
- [ ] `IP-06-MUST-003` executor 区分未完成/完成并突出下一步与关注项。
- [ ] `IP-06-MUST-004` 项目详情固定权威头并渲染不同报告结构与历史。
- [ ] `IP-06-MUST-005` 公开访问只读，控制 cookie 才允许有限高影响动作。
- [ ] `IP-06-MUST-006` 空/失败/stale/键盘/移动端和精确 head E2E 证据完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-014, REQ-015, REQ-016, REQ-017, REQ-018 |
| Slice | Slice 6 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-004 | proposer 状态与执行进度 |
| AC-006 | executor 未完成/完成与关注项 |
| AC-008 | 待确认问题跨视图一致 |
| AC-009 | 支持请求跨视图一致 |
| AC-013 | 无需登录切换同一 authority 的角色呈现 |
| AC-014 | API 失败可安全解释 |
| AC-016–018 | 动态报告、回退与权威隔离 |
| AC-020 | 遵循经审阅基线 |

Sources: [confirmed requirements](../../feature/v0-1-project-plan/requirements.md),
[report protocol](../../feature/v0-1-project-plan/structured-report-protocol.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 6 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| 视觉拖延 | 主路径未贯通却做动画 | 使用简单 CSS，先完成权威信息 |
| 客户端分叉 | 角色各自缓存业务状态 | 统一 query client/服务端投影 |
| 未授权写入 | 公开页面能变更状态 | 强制控制会话和服务端 guard |
| 动态内容破坏布局 | report block 未限界 | 复用 IP-05 组件与大小限制 |

不需要真实用户身份；测试只使用演示 actor/context。

## 12. Next step

四个硬依赖全部 Accepted 后创建 IP-06 独立需求。IP-06 Accepted 是 IP-07 的
硬依赖。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 6 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

只有指定 AcceptanceOwner 可作出验收决定，Main 只记录 exact authority 和证据。
Code Review 退回只引用 immutable Review result 并追加 ChangeRecord，不创建
`Rejected` AcceptanceRecord。
