# IP-04 结论与人类确认

- PlanId: `IP-04`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-07-31`
- Dependencies: `IP-03`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

让执行者提交带证据、限制和不确定性的验证结论，并由人对精确摘要和版本确认
继续、调整、停止或移交。完成、停止、移交和重开等高影响动作不能由 AI 单独决定，
且过期、重复或陈旧确认不会改变权威状态。

## 2. Scope

- Slice 4：结论 revision、HumanConfirmation、fragment token 交换和 Web 确认界面。
- 主归属：`REQ-010`。
- 使用 IP-03 的证据/历史，并为 IP-06/IP-07 提供确认旅程。

## 3. Non-goals

- 不实现通用身份、登录、RBAC 或多租户。
- 不让结构化汇报或 AI 自述覆盖确认结果。
- 不部署生产环境；属于 IP-08。

## 4. Inputs and entry gate

1. IP-03 当前版本 `Accepted`，进展、Evidence、审计和并发基线可复核。
2. IP-04 有独立确认 RequirementsHandoff、PASS plan review 和 feature branch。
3. AcceptanceOwner 与高影响动作清单已明确。
4. token 生命周期、摘要绑定、版本和重开规则经独立设计确认。
5. 投影 `Current` 后才能激活唯一 GoalRun。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Conclusion | 不可变版本、证据摘要、限制/不确定性、四种建议去向 |
| Confirmation | request/decide commands、摘要绑定、30 分钟过期、单次 token hash |
| Web control | fragment token 交换、HttpOnly cookie、批准/拒绝 UI |
| Lifecycle | 完成、停止、移交、重开必须由有效确认驱动 |
| Persistence/tests | confirmation repository、事务集成和浏览器 E2E |

## 6. Execution plan

1. 实现 ValidationConclusion revision 与 recommendation enum。
2. 为高影响动作生成 canonical summary/digest，并只存 token hash。
3. 实现 30 分钟过期、单次使用、版本/摘要绑定和原子 decide。
4. 实现 fragment token 到安全 cookie 的交换与批准/拒绝界面。
5. 将结论确认与终态转换放入同一事务；重开记录原因并保留旧结论。
6. 覆盖过期、重放、版本变化、拒绝、完成和重开测试。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| token 过期/重复 | 拒绝且保持原状态，允许重新请求确认 |
| 摘要或版本变化 | 旧确认失效，生成新请求 |
| 拒绝确认 | 记录决定，不改变目标终态 |
| 事务部分失败 | 结论/确认/状态均回滚 |
| 错误完成 | 通过带原因的新确认重开，旧结论和历史保留 |
| token 泄露 | 立即失效/轮换，检查日志与任务证据 |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`，并遵守
[项目级 authority 契约](../../project-management.md)。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Normal | 结论提交、确认请求、token 交换、批准和原子终态 |
| Failure | 过期、重放、摘要/版本变化、无效 recommendation 被拒绝 |
| Security | 原 token 不入库/日志；cookie HttpOnly/Secure/SameSite |
| Concurrency | 一个 token 只能决定一次；版本冲突不覆盖 |
| Recovery | 拒绝保持原状态；重开有原因且保留旧结论/审计 |

## 9. Independent acceptance checklist

- [ ] `IP-04-MUST-001` 结论包含证据、限制/不确定性和建议去向。
- [ ] `IP-04-MUST-002` 完成/停止/移交/重开均需有效人类确认。
- [ ] `IP-04-MUST-003` token hash、过期、单次使用和摘要/版本绑定通过。
- [ ] `IP-04-MUST-004` 批准结论与终态原子提交，失败不产生部分状态。
- [ ] `IP-04-MUST-005` 拒绝和重开可解释，原结论与历史保留。
- [ ] `IP-04-MUST-006` 精确 PR head 的安全、E2E、Review、merge 和验收证据完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-010 |
| Slice | Slice 4 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-010 | 结论含证据、限制和建议 |
| AC-011 | 非法终态转换被拒绝 |
| AC-012 | 纠正/重开保留历史 |
| AC-014 | 确认 API 的成功/重复/失败结构化 |
| AC-020 | 遵循经审阅基线 |

Sources: [domain model](../../feature/v0-1-project-plan/domain-model.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 4 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| AI 越权 | AI 直接提交终态 | API 必须要求有效确认 |
| 陈旧批准 | summary/version 已变化 | 使旧 token 失效 |
| token 暴露 | URL query/log/DB 原文出现 | 只用 fragment、hash 和脱敏日志 |
| 部分完成 | conclusion 成功但状态失败 | 单事务回滚 |

独立需求必须明确 AcceptanceOwner；否则保持 Draft。

## 12. Next step

IP-03 Accepted 后创建 IP-04 独立需求。IP-04 Accepted 是 IP-06 和 IP-07 的硬依赖。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 4 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

`AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence` 仅在真实
`Accepted` 记录中完整；旧记录永不覆盖。Code Review 退回只引用 immutable
Review result 并追加 ChangeRecord，不创建 `Rejected` AcceptanceRecord。
