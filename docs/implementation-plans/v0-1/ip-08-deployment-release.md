# IP-08 部署、恢复与发布候选

- PlanId: `IP-08`
- Version: `1`
- Status: `Draft`
- ProjectionState: `Current`
- TargetDate: `2026-08-04–2026-08-06`
- Dependencies: `IP-01, IP-07`
- RequirementsBaseline: [confirmed v0.1 requirements](../../feature/v0-1-project-plan/requirements.md) @ `aedb210b95cbbeabc69ce776ed6966b36677196b`
- LifecycleFeatureId: `Unassigned`
- FeatureBranch: `Unassigned`
- AcceptanceOwner: `Pending assignment`
- LatestAcceptanceRecordId: `None`
- CurrentAcceptedRecordId: `None`
- ActiveStalenessRecordId: `None`
- ProjectManagement: [v0.1 project management](../../project-management.md)

## 1. Business outcome

把已验收的 v0.1 组合能力构建为可恢复的单服务器部署，通过个人域名 HTTPS 提供
完整演示；用可重复的迁移、备份、恢复、部署 smoke、全量测试和发布候选记录证明
系统可访问、可回滚、无秘密泄露，并清楚标注未满足的外部条件。

## 2. Scope

- Slice 8：Docker/Compose/Caddy、迁移、备份恢复、部署 smoke 和运维文档。
- Slice 9：全量候选验证、生产演示、文档校对和外部部署证明。
- 主归属：`REQ-026`。
- 组合验证所有前序 feature，但不重写它们的独立验收。

## 3. Non-goals

- 不建设高可用、水平扩展、企业监控、对象存储或云原生平台。
- 不在缺少用户明确授权时连接服务器、修改 DNS 或执行生产部署。
- 不把目标日期、PR 合并或本地 compose 成功当作公开发布证明。

## 4. Inputs and entry gate

1. IP-01 与 IP-07 当前版本 `Accepted`；IP-07 的组合故事已覆盖 IP-02–IP-06。
2. IP-08 有独立 RequirementsHandoff、PASS plan review、branch 和 AcceptanceOwner。
3. 本地 compose/备份工作可在无生产凭据条件下先实施。
4. 外部部署前必须获得服务器、域名/DNS、80/443、磁盘、凭据交付、演示数据范围
   和生产部署的明确授权。
5. 投影 `Current` 后才能激活唯一 GoalRun；缺外部输入时进入 Blocked 而非伪造通过。

## 5. Deliverables

| Area | Required result |
| --- | --- |
| Build | multi-stage image，构建 Web 并与 API 同候选发布 |
| Runtime | production compose、私有网络、healthcheck、named volumes、restart/read-only |
| Edge | Caddy 域名、HTTPS、CSP、安全头和 request-size limits |
| Data | migration、backup、临时库 restore smoke 和回滚顺序 |
| Operations | deployment/operations docs、环境变量、轮换和故障处理 |
| Candidate | 全量 CI/E2E、演示脚本、镜像 digest、迁移/备份/smoke 证据 |
| External | 用户授权后的实际域名和可访问性证明 |

## 6. Execution plan

1. 实现 multi-stage Docker build 和 production compose hardening。
2. 配置 Caddy HTTPS、安全头、CSP、请求大小和健康依赖。
3. 实现 migrate、backup、restore smoke 和 deploy smoke。
4. 在干净环境演练启动、迁移、备份、恢复和 App 回滚。
5. 运行全部 CI、contract/integration/browser E2E 与 demo script。
6. 校对 OpenAPI、Skill、部署/运维文档、Changelog 和已知限制。
7. 仅在用户提供输入并明确授权后部署；记录域名、镜像 digest、迁移、备份和 smoke。
8. 对最终精确 head 发起独立 Code Review；不得制造空“验证完成”提交。

## 7. Failure, retry, rollback and recovery

| Failure | Response |
| --- | --- |
| build/compose 无法复现 | 保持 In Progress，固定版本并修复 |
| migration 失败 | 不启动新 App，恢复备份或回滚 App |
| health/HTTPS 失败 | 保持 Blocked，不宣称可访问 |
| backup restore 失败 | 禁止发布，修复后对临时库重跑 |
| 外部输入缺失 | 记录 BlockerRecord、owner、exit condition 和 review point |
| 凭据泄露迹象 | 停止部署、轮换、清理日志并重新审查 |

允许转换：`Draft→Ready/Deferred`、`Ready→In Progress/Deferred`、
`In Progress→Blocked/In Review/Deferred`、`Blocked→In Progress/Deferred`、
`In Review→In Progress/Blocked/Deferred/Accepted`、
`Deferred→Draft/Ready`、`Accepted→Draft`，遵循
[项目级 authority 契约](../../project-management.md)。

### Staleness history

| RecordId | DetectedAt | DetectedBy | Reason | ConflictingAuthority | AffectedFields | RecoveryAction | ClearedAt | ClearedBy | ClearEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- Empty until an authority/projection mismatch is detected. -->

## 8. Verification matrix

| Path | Must verification |
| --- | --- |
| Build | clean image build、compose config、health ordering |
| Deployment | 空服务器启动、HTTPS、CSP/security headers、核心 smoke |
| Data | migration、backup、临时库 restore 并读取演示数据 |
| Full candidate | 全量 CI、browser E2E、contract、migration、demo story |
| Security | 日志/镜像/仓库无 token、cookie、DB URL、正文或个人配置 |
| Recovery | App rollback、迁移失败不启动、报告/数据库数据可读 |

## 9. Independent acceptance checklist

- [ ] `IP-08-MUST-001` production compose 与镜像可复现且健康依赖正确。
- [ ] `IP-08-MUST-002` 域名 HTTPS、安全头和请求边界在授权环境中通过。
- [ ] `IP-08-MUST-003` 备份能恢复到临时数据库并读取演示数据。
- [ ] `IP-08-MUST-004` 全量 required checks 与完整演示故事通过。
- [ ] `IP-08-MUST-005` 实际域名、镜像 digest、迁移、备份和 smoke 证据完整。
- [ ] `IP-08-MUST-006` 外部条件未证明时明确 Blocked/限制，不标记发布就绪。
- [ ] `IP-08-MUST-007` 精确 head Review、merge、指定验收与组合就绪更新完整。

## 10. Traceability

<!-- PRIMARY-TRACE-START -->
| Type | IDs |
| --- | --- |
| Requirement | REQ-026 |
| Slice | Slice 8, Slice 9 |
<!-- PRIMARY-TRACE-END -->

| Acceptance criteria | Role |
| --- | --- |
| AC-019 | 部署后完整演示故事 |
| AC-020 | 遵循经审阅基线 |

Sources: [confirmed requirements](../../feature/v0-1-project-plan/requirements.md),
[technical architecture](../../feature/v0-1-project-plan/technical-architecture.md),
[Slice 8–9 plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 11. Risks, external inputs and blockers

| External input | Owner | Exit condition |
| --- | --- | --- |
| 服务器与部署方式 | System maintainer/User | 可安全连接并明确部署范围 |
| 域名/DNS/80/443 | User | DNS 可修改且端口可访问 |
| 数据库与备份磁盘 | System maintainer | 容量、权限和保留策略明确 |
| AI/confirmation/Web control secrets | User/System maintainer | 通过仓库外安全渠道交付 |
| 演示数据公开范围 | User | 明确允许的合成数据 |
| 生产部署授权 | User | 对精确候选明确授权 |

任何 secret 都不得进入计划、PR、日志或命令输出。缺少外部输入不阻塞前序本地计划，
但阻塞本计划外部验收与 v0.1 发布就绪。

## 12. Next step

IP-01 与 IP-07 Accepted 后创建 IP-08 独立需求；先完成本地部署/恢复门禁，再向
用户申请精确候选的外部部署授权。

## 13. Change history

| ChangedAt | Actor | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-28T14:04:22Z | Engineering Main | 创建 v1 Draft/Current 计划 | 将 Slice 8–9 变成独立 lifecycle 边界 | [approved management plan](../../feature/v0-1-project-management/implementation-plan.md) |

## 14. Acceptance history

| RecordId | PlanId | PlanVersion | SubmittedCommit | Result | AcceptanceOwner | DecisionActor | DecisionAt | RecordedBy | RecordedAt | AcceptedBy | AcceptedAt | AcceptedCommit | AcceptanceEvidence | FailedItems | RecoveryAction | RelatedRecordId | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- No acceptance records. Main may append only from exact authorized results. -->

IP-08 的 `Accepted` 需要仓库内和外部部署证据；合并、本地 compose 或目标日期均不能
单独产生验收或发布结论。Code Review 退回只引用 immutable Review result 并追加
ChangeRecord，不创建 `Rejected` AcceptanceRecord。
