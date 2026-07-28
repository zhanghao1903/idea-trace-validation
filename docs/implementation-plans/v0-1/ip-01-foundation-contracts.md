# IP-01 工程基础与权威契约

- PlanId: `IP-01`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-07-28`
- Dependencies: `None`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

建立后续所有 v0.1 feature 可依赖的可复现 TypeScript workspace、共享契约、
Idea/ValidationProject 生命周期、数据库约束和 CI 门禁。完成后，后续计划可以在
同一权威类型、错误、状态机和持久化基线上独立实施，不需要重新决定基础架构。

## 2. Scope

- Slice 0：workspace、contracts、Report Schema、统一错误信封、CI。
- Slice 1：领域对象、状态机、审计/确认基础、PostgreSQL schema、仓储和迁移。
- 主归属：`REQ-011`、`REQ-012`、`REQ-019`。
- 为 IP-02–IP-08 提供契约和数据库基础，但不实现其业务旅程。

## 3. Non-goals

- 不实现 Idea API、项目进展、结论、Web、Skill 或生产部署。
- 不提前实现结构化汇报业务；只建立共享 schema、validator 基础和契约测试。
- 不引入登录、多租户、MCP、消息队列、文件上传或微服务。

## 4. Inputs and entry gate

进入 `Ready` 前必须具备：

1. Requirements 为 `IP-01` 生成独立、版本化、经用户确认的 RequirementsHandoff；
2. Main 在独立 feature 分支形成技术计划并获得 Review PASS；
3. lifecycle feature、branch 和 AcceptanceOwner 已由 authority 明确；
4. 当前投影为 `Current`；本计划无硬依赖；
5. 只有上述条件满足后才能激活唯一 GoalRun。

缺一项时保持 `Draft`，当前 management handoff 不构成 IP-01 实现授权。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Workspace | npm workspaces、固定 Node engine/lockfile、strict TypeScript、lint/format/test/build 脚本 |
| Contracts | 共享 Report Schema、成功/错误信封、稳定错误码和导出边界 |
| Domain | 类型化 ID、ActorContext、Idea/Project 状态机、结论/确认摘要和领域错误 |
| Database | v0.1 表、约束、索引、仓储端口、Drizzle 适配器、初始迁移 |
| CI | format、lint、typecheck、contract/domain/integration tests、build |
| Operations baseline | 本地 PostgreSQL compose 与可验证的空库迁移 |

具体目标路径沿用 [Slice 0–1 source plan](../../feature/v0-1-project-plan/implementation-plan.md)。

## 6. Execution plan

1. 建立 workspace、固定工具版本和统一脚本，证明 `npm ci` 可从空缓存复现。
2. 把结构化汇报 schema 迁入 contracts，保留文档链接并用 Ajv 2020 strict 编译。
3. 固化 API 信封、错误码、actor、ID、时间和并发版本类型。
4. 实现 Idea/Project 状态机、不变量、确认摘要和追加式审计模型。
5. 建立数据库 schema、约束、索引、迁移和仓储适配器。
6. 添加契约、领域、迁移和事务测试；CI 按失败即停顺序执行。
7. 同步 OpenAPI/架构或迁移说明，只提交本计划范围。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| 依赖安装不可复现 | 固定 engine/lockfile，保持 Draft/In Progress，不绕过 CI |
| Schema 编译或契约反例失败 | 修正单一 contracts 来源，不在 API/Web 复制类型 |
| 状态机无法表达确认/重开 | 停止后续实现，修订领域与迁移并重新 plan review |
| 迁移失败 | 对空测试库重跑；生产前只允许 additive 迁移 |
| 并发写覆盖 | 返回版本冲突，不使用最后写入者静默覆盖 |
| 已提交错误 | 用补偿提交纠正，不重写审计或验收历史 |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`。任一转换都要求
`ProjectionState=Current` 和 [项目级 authority 契约](../../project-management.md)。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Normal | 空缓存 `npm ci`；合法状态转换；空库迁移；contracts build |
| Failure | 未知 schema 字段、危险内容、非法转换、唯一约束和版本冲突被拒绝 |
| Security | token/配置不入日志或提交；contracts 不依赖 API、DB、Web |
| Recovery | 迁移失败可安全重试；并发失败不覆盖；重开保留历史 |
| CI | format、lint、typecheck、contract/domain/integration tests、build 全绿 |

## 9. Independent acceptance checklist

- [ ] `IP-01-MUST-001` workspace 与 lockfile 从干净环境可复现。
- [ ] `IP-01-MUST-002` 七种 report block 正例和危险/未知字段反例通过。
- [ ] `IP-01-MUST-003` 全部允许/禁止状态转换、完成确认和重开历史被测试。
- [ ] `IP-01-MUST-004` 一个 Idea 不能绑定两个项目，事务与版本冲突不静默覆盖。
- [ ] `IP-01-MUST-005` 初始迁移可对空 PostgreSQL 执行并由集成测试证明。
- [ ] `IP-01-MUST-006` 精确 PR head 的 required checks、Review、merge 和验收证据完整。

任一 Must 未通过都不能进入 `Accepted`。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-011, REQ-012, REQ-019 |
| Slice | Slice 0, Slice 1 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-005 | 为追加式进展/审计提供基础 |
| AC-011 | 拒绝非法生命周期转换 |
| AC-014 | 提供稳定 API 结果、幂等和错误契约 |
| AC-020 | 保持经审阅的领域、协议、架构和计划基线 |

Sources: [domain model](../../feature/v0-1-project-plan/domain-model.md),
[report protocol](../../feature/v0-1-project-plan/structured-report-protocol.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md).

## 11. Risks, external inputs and blockers

| Risk | Trigger | Response |
| --- | --- | --- |
| 工具链耗时 | 干净环境不能安装/构建 | 减少非必要插件，不改变 strict/contract 门禁 |
| 数据模型返工 | 状态与确认不能同事务表达 | Blocked，先修领域与迁移 |
| 契约多源 | API/Web 各自复制类型 | 拒绝合并，恢复 contracts 单一来源 |

不需要生产凭据。若依赖下载或容器运行环境不可用，记录 BlockerRecord、解除条件和
复核点，不伪造检查结果。

## 12. Next step

Requirements 为 `IP-01` 创建独立确认快照并指定 AcceptanceOwner；之后 Main 才能
创建独立 feature branch 和技术计划。IP-01 被 `Accepted` 前，IP-02、IP-05、
IP-08 均不能进入 `Ready`。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 0–1 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

ChangeRecord 只追加；错误用补偿记录纠正。

## 14. Acceptance history

字段契约：

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

`Accepted` 时四个确认字段必须完整；`Rejected` 只能来自 AcceptanceOwner；
Code Review 退回不创建验收记录；`Superseded` 需要用户/Requirements authority，
且不得覆盖旧 `AcceptedCommit` 或证据。
