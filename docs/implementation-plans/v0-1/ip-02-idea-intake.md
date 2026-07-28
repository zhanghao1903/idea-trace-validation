# IP-02 Idea 登记与进入执行

- PlanId: `IP-02`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-07-29`
- Dependencies: `IP-01`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

让 Codex、Claude 等 AI 能安全登记不完整想法、保存已知/假设/待澄清内容，并在
人明确推进后创建唯一验证项目。想法提出者和执行者可以读取同一权威数据的不同
查询投影，Idea 可以长期停留在池中而不被系统自动执行。

## 2. Scope

- Slice 2：Fastify/API 基础、Idea 创建、澄清回答、显式推进和角色查询投影。
- 主归属：`REQ-001`–`REQ-005`。
- 实现公开只读、AI Bearer token、Web 控制会话三类访问边界。
- 生成并验证核心旅程的 OpenAPI。

## 3. Non-goals

- 不实现项目进展/关注事项、结论确认、结构化报告、完整 Web 或 Skill。
- 不建设注册、登录、账户或多租户。
- 不允许创建 Idea 的请求隐式开始执行或创建多个项目。

## 4. Inputs and entry gate

进入 `Ready` 必须同时满足：

1. IP-01 已有当前版本 `Accepted` 记录；
2. IP-02 获得独立确认 RequirementsHandoff 和 PASS plan review；
3. lifecycle feature、独立 branch、AcceptanceOwner 已明确；
4. contracts、domain、DB migration 和 CI 基线可复核；
5. 当前投影 `Current`，唯一 GoalRun 尚未被其它计划占用。

任一条件失败保持 `Draft`；依赖记录 stale 时停止晋级。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| API foundation | Fastify app/config、错误处理、request context、健康检查和日志脱敏 |
| Idea commands | create、answer clarification、promote，均有幂等/并发规则 |
| Projections | proposer/executor 列表与详情、允许操作、游标分页 |
| Access | 公开只读、AI token 写入、一次性交换的 Web 控制会话 |
| Contract | response schema、OpenAPI、稳定错误和恢复提示 |
| Tests | Idea/API 集成、访问边界、幂等和投影一致性 |

## 6. Execution plan

1. 在 IP-01 契约上启动 Fastify、配置校验、统一错误和脱敏日志。
2. 实现创建 Idea：原始意图、提出者、期望结果、已知信息、假设和待澄清问题。
3. 实现澄清补充与纠正，不伪造缺失答案。
4. 实现显式推进，原子创建一个 ValidationProject 并保留转换审计。
5. 实现 proposer/executor 查询投影和游标分页，来源均为权威存储。
6. 实现三种访问边界、OpenAPI 和集成测试。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| 输入不完整 | 保存已知/假设/待澄清，保持 Idea 状态 |
| 请求结果未知 | 使用同一 request ID 重试，不能创建重复记录 |
| 未明确推进 | 拒绝创建项目，返回允许动作 |
| 并发推进 | 一个请求成功，其余返回当前项目/冲突 |
| token 无效 | 结构化拒绝且不记录 token 值 |
| 错误推进 | 通过后续纠正/暂停路径，审计历史保留 |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`。转换遵循
[项目级 authority 契约](../../project-management.md)。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Normal | 完整/不完整 Idea 创建、澄清、明确推进和两种查询投影 |
| Failure | 未推进不创建项目；非法状态、无效 token、未知字段被拒绝 |
| Retry | 相同 request ID 重放只产生一个 Idea/Project |
| Security | token/cookie 不进入响应正文或日志；公开端点只读 |
| Consistency | proposer/executor 读取同一权威状态与历史 |

## 9. Independent acceptance checklist

- [ ] `IP-02-MUST-001` AI 请求创建唯一、可读取的 Idea。
- [ ] `IP-02-MUST-002` 不完整输入分别保存已知、假设和待澄清，不伪造答案。
- [ ] `IP-02-MUST-003` 未明确推进时 Idea 可长期停留且不创建项目。
- [ ] `IP-02-MUST-004` 明确推进原子关联唯一项目，重复/并发请求可安全解释。
- [ ] `IP-02-MUST-005` 两种角色投影读取同一权威数据，访问边界与 OpenAPI 通过。
- [ ] `IP-02-MUST-006` 精确 PR head 的 checks、Review、merge 和验收证据完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-001, REQ-002, REQ-003, REQ-004, REQ-005 |
| Slice | Slice 2 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-001 | 创建唯一 Idea |
| AC-002 | 不完整信息不伪造 |
| AC-003 | 未明确推进不执行 |
| AC-004 | proposer 识别状态与进度入口 |
| AC-011 | 非法推进被拒绝 |
| AC-014 | API 成功、重复和失败可安全处理 |
| AC-020 | 遵循已审阅设计与计划 |

Sources: [domain model](../../feature/v0-1-project-plan/domain-model.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 2 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| 自动执行 Idea | create API 隐式建项目 | 拒绝合并，恢复显式 promote 命令 |
| 投影分叉 | 两角色维护不同状态 | 统一 query/application 来源 |
| 幂等误判 | 重试创建重复数据 | 用 actor/scope/request ID 与事务约束 |
| 凭据泄露 | token 出现在日志 | 停止测试/交付，脱敏并轮换测试凭据 |

只使用演示数据和测试凭据；不需要真实生产 token。

## 12. Next step

先完成 IP-01 的验收；随后 Requirements 为 IP-02 创建独立确认快照。IP-02 被
`Accepted` 后，IP-03、IP-06、IP-07 才可能满足部分依赖。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 2 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

`Accepted` 时四个确认字段必须完整；真实验收拒绝追加 `Rejected` 并记录失败项和
恢复动作。Code Review 退回只引用 immutable Review result 并追加 ChangeRecord，
不创建 `Rejected` AcceptanceRecord；升版只追加 `Superseded`，不覆盖旧记录。
