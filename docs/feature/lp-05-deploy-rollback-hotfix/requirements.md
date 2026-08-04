# Requirements: LP-05 生产部署回滚热修复

- Status: Confirmed
- FeatureId: lp-05-deploy-rollback-hotfix-4b7e2c9a6d10
- Branch: codex/lp-05-deploy-rollback-hotfix
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-08-04T03:17:17Z
- Authoritative baseline: `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Related feature: `lp-05-deployment-release-8c3f1a6d5e20`
- Failed attempt: `deploy_3a6d65e723939cba_20260804t0237`
- Manual cleanup evidence SHA-256: `99a28b051693aaab170fd5356c352076563b82042061e5dad9171018f449cd14`

## Problem

LP-05 的首次已授权生产部署尝试在读取 PostgreSQL 身份时失败，并在随后处理新装失败时把本可
证明的清理结果记成了 `ROLLBACK_FAILED`。这是发布工具的两个相互独立、但共同阻断下一次
安全部署的缺陷：

1. 生产数据库身份读取只指定了数据库名，没有显式使用发布配置中的 `POSTGRES_USER`。在
   PostgreSQL 17.10 仅创建 `idea_validation` 数据库角色、没有 `postgres` 数据库角色时，
   客户端默认尝试以 `postgres` 登录并失败；同一读取显式使用 `idea_validation` 后成功。
2. 新装失败的活动操作同时返回应用回滚结果和 `restoreCleanup`，但严格 attempt schema 的
   `rollback` 对象不允许该额外键。结果是入口停用和隔离恢复清理即使有效，记录仍无法通过
   schema，且本次尝试刚创建的生产 PostgreSQL 资源不能自动收敛到空状态。

本热修复只纠正数据库身份读取和新装失败回滚/清理证据边界，不重新设计 LP-05 部署系统，
也不授权再次部署。修复合并后必须重新构建候选并生成新的发布提案；已经失败的提案和尝试
只能作为不可变历史保留。

## Current behavior

- 权威合并基线为 `99734e8e6c456e0366d28ce7d9a731b3544f0a56`；LP-05 durable stage
  仍为 `RELEASE_AWAITING_AUTHORIZATION`，本热修复不得改写该状态。
- 已失败的授权尝试 `deploy_3a6d65e723939cba_20260804t0237` 终态为
  `ROLLBACK_FAILED`。
- 发布配置明确使用 `POSTGRES_USER=idea_validation`、`POSTGRES_DB=idea_validation`，
  但 source database identity 和 full production identity 两条真实读取路径均未把配置的
  数据库用户名传给 `psql`。容器内 OS 用户与 PostgreSQL 数据库角色不是同一权限概念。
- 当前 `rollback` 记录只接受固定字段；活动操作附加的 `restoreCleanup` 会被 extra-key
  校验拒绝。隔离恢复清理证据和应用回滚证据因此没有可共同满足的权威记录边界。
- 手工清理证据摘要为
  `99a28b051693aaab170fd5356c352076563b82042061e5dad9171018f449cd14`：
  已独立证明 `applicationTableCount=0`，随后删除精确的 `idea-validation-prod` 容器和
  volume；当前 production 与 restore 的 container、volume 资源数均为 0。
- 旧发布提案 SHA
  `3a6d65e723939cbac0ffebc80abcdc93d28362ada42f08fd34eca9af7bebd7b3` 已因终态失败而
  退役，不得再次使用。

## Desired scenarios

1. 使用自定义 `POSTGRES_USER`、且不存在名为 `postgres` 的数据库角色启动真实 PostgreSQL
   后，部署工具的源数据库身份读取和完整生产身份读取都显式以配置用户执行并成功返回相同
   实例、数据库和版本事实。
2. 在空目标上创建本次尝试拥有的 PostgreSQL 资源后立即注入失败，部署工具停用入口，确认
   目标仍无应用数据，只删除能精确证明由该尝试创建和拥有的容器、网络与 volume，并最终
   证明这些资源计数均为 0。
3. 新装回滚成功时，应用回滚以严格 schema 允许的 `NOT_APPLICABLE` 表达“没有上一版本可
   恢复”，资源清理证据在独立的权威位置记录；attempt 以 schema-valid `ROLLED_BACK`
   终止，而不是因额外字段被误记为 `ROLLBACK_FAILED`。
4. 配置用户错误、资源缺少归属标签、资源属于其他尝试/项目、应用表不为空、清理不完整或
   证据包含未声明字段时，流程 fail closed，不删除无法精确归属的资源，也不伪造成功终态。
5. 修复合并后，Main 从新的精确提交重建不可变候选并准备新的提案 SHA；后续是否部署仍走
   原有独立发布授权门禁。

## Goals

- 让所有生产数据库身份/只读检查使用受信任发布配置中的 `POSTGRES_USER`，不依赖客户端
  默认用户或兼容性数据库角色。
- 让应用回滚记录和 restore/resource cleanup 证据各有唯一、严格、可验证且与 attempt 绑定
  的权威位置，保持 extra-key 拒绝能力。
- 让无上一版本、无应用数据的新装失败安全回滚到 0 个本次尝试拥有的 production/restore
  容器、网络和 volume，并产生 schema-valid 终态。
- 保留既有失败尝试、手工清理证据和 LP-05 durable history，不通过修改历史消除失败。
- 以最小真实 Docker 回归和针对性负向测试证明修复，不扩大产品或发布编排范围。

## Acceptance criteria

1. Source database identity 与 full production identity 的每一条 PostgreSQL 身份/只读操作都
   显式绑定经验证的发布配置 `POSTGRES_USER` 和 `POSTGRES_DB`；不得依赖 `psql` 默认用户、
   容器 OS 用户映射或宿主环境中未受信任的 `PGUSER` 漂移。
2. 真实 Docker 回归使用 PostgreSQL 17.10、自定义 `POSTGRES_USER=idea_validation` 和
   `POSTGRES_DB=idea_validation`，并证明数据库角色 `postgres` 不存在；源数据库身份读取和
   完整生产身份读取仍以配置用户成功，且身份结果绑定正确实例、数据库与版本。
3. 负向测试证明：配置的数据库用户不存在或与实际用户不符时，身份读取明确失败，不回退到
   `postgres` 或其他用户，也不创建兼容性 `postgres` role/superuser。
4. `rollback` 对象继续只接受其声明字段并拒绝 `restoreCleanup` 或其他额外键；应用回滚证据
   与 restore/resource cleanup 证据不得混装。清理证据必须有一个独立、权威、严格校验且与
   attempt、target、compose project 和候选绑定的位置，不能出现两个冲突来源。
5. 在真实或等效隔离 Docker 环境中，于新装 PostgreSQL 资源创建完成后立即注入确定性失败；
   自动回滚必须停用入口，并在任何破坏性清理前再次证明无上一版本且
   `applicationTableCount=0`。
6. 新装清理只能作用于同时满足已记录身份、精确 compose project 和本次 attempt 归属证明
   的容器、网络及 volume；成功后重新枚举并证明本次 attempt 拥有的 production 与 restore
   container/network/volume 数量均为 0，且无应用数据残留。
7. 上述新装清理成功时，应用回滚结果保持 schema-valid `NOT_APPLICABLE`，attempt 终态为
   schema-valid `ROLLED_BACK`；若入口停用、数据为空证明、归属证明、清理或清理后零资源
   复核任一步失败，则终态为 `ROLLBACK_FAILED` 并保留可诊断证据。
8. 负向测试证明外来 compose project、其他 attempt 拥有、标签不完整/无标签或与记录身份
   不一致的资源不会被删除；归属有歧义时流程 fail closed，并给出需要人工处置的明确原因。
9. 负向测试继续拒绝 rollback 与清理证据中的额外字段、错误摘要、错误 attempt/target 绑定
   和虚假零资源声明；不能为让失败尝试通过而放宽全局 `exactKeys` 语义。
10. 已失败尝试 `deploy_3a6d65e723939cba_20260804t0237`、其 `ROLLBACK_FAILED` 终态、
    全部既有 attempt/transition/evidence 记录及手工清理证据摘要保持原样、可复核；不得
    重写、删除、替换或重新签发历史状态。
11. 针对性单元/契约测试、真实 Docker 数据库身份回归、注入失败清理回归和 LP-05 既有
    required checks 全部通过；不得以 mock-only 结果替代第 2、5、6 条要求的真实资源证明。
12. 运维与发布文档同步说明：配置数据库用户是身份读取的唯一数据库 principal；空目标新装
    失败仅在“无应用数据且精确 attempt-owned”时自动清理；归属或数据状态不明确时停止并
    转人工处置。
13. 本热修复不修改业务数据库 schema、领域模型、公共 API、OpenAPI、Web、Skill、报告或
    权限语义，也不降低既有迁移、备份、恢复、smoke、秘密和发布授权门禁。
14. 需求确认、handoff、计划/代码批准、合并或本地验证都不构成生产部署授权。本 feature
    不执行生产部署、不授权 release、不对服务器做 ad-hoc runner patch，也不创建兼容性
    superuser。
15. 修复合并后必须从新的精确提交重新构建候选并生成新的 proposal SHA；旧提案
    `3a6d65e723939cbac0ffebc80abcdc93d28362ada42f08fd34eca9af7bebd7b3`、旧 envelope 和
    旧 attempt 均不得复用。新提案仍须经过原有的精确候选校验和独立发布授权。

## Non-goals

- 不重写 LP-05 部署 controller、authorization engine、attempt state machine 或证据系统。
- 不建设通用 Docker 资源协调器、垃圾回收器、容器平台或跨项目回滚框架。
- 不增加 `postgres` 数据库 role/superuser，也不改变 PostgreSQL 镜像或数据库访问模型来
  绕过配置错误。
- 不自动删除含有应用数据、归属不明、无标签、外来或其他 attempt 拥有的资源。
- 不修改产品能力、业务数据、API、Web、Skill、认证/权限或 LP-01 至 LP-04 的已验收范围。
- 不执行生产部署、创建发布授权、修改目标服务器、复用旧提案或生成 tag/GitHub Release/
  package。
- 不改写 durable lifecycle 状态、历史 attempt、失败终态或手工清理证据。

## Failure and recovery expectations

- 数据库 principal 配置错误：身份读取在产生可信数据库身份或继续发布前失败；错误指出配置
  用户不成立，不回退到默认用户。
- 应用数据非空：立即停止自动删除，保留资源和证据，并要求单独的人工恢复/清理判断。
- 资源归属不完整或冲突：不运行针对这些资源的删除；记录枚举结果与阻塞原因，终态保持
  `ROLLBACK_FAILED`。
- 清理部分成功：再次枚举 exact attempt-owned 资源；只要容器、网络或 volume 任一未归零，
  不得报告 `ROLLED_BACK`，并保留已完成与未完成步骤的证据。
- 清理证据无效：严格 schema、摘要或 authority binding 失败时拒绝终态记录，不把额外键
  塞入 `rollback` 规避校验。
- 测试或 required check 失败：不合并、不重建新发布候选，也不推进新的发布提案。

## Public API and compatibility impact

- 不预期修改任何公共 HTTP/API/OpenAPI、数据库业务 schema、Web 路由、Skill 或用户旅程。
- 现有 attempt 记录必须继续可读、可验证且保持摘要稳定；本热修复不得要求重写旧记录。
- `rollback` 严格字段集合和 extra-key 拒绝行为保持兼容。若清理证据需要新的版本化位置，
  该位置必须与旧记录兼容、具有单一权威来源，并由后续技术计划定义而非本需求预设实现。
- 生产身份读取的可观察语义不变，只纠正其数据库 principal 来源。

## Safety, privacy, permissions, and authorization

- 自动删除前必须同时证明 fresh install、无上一版本、无应用数据、精确 target/compose project
  和本 attempt 资源归属；任一条件未知或不成立都禁止删除。
- 删除范围仅限本次失败尝试创建并可通过不可歧义证据识别的容器、网络和 volume。外来、
  无标签、共享或归属冲突资源必须保持不变。
- 数据库用户名、资源标识和清理状态可进入脱敏证据；密码、token、完整数据库 URL 或其他
  秘密不得进入日志、attempt、测试快照或需求文档。
- 当前生产和 restore 资源已经由独立手工证据证明为 0；本热修复不得重新连接、重建或操作
  生产资源来制作测试证据。
- 所有生产部署、发布授权、服务器变更和数据库恢复仍需 LP-05 原有独立授权；本快照确认只
  授权后续设计与实现流程。

## Release impact

- 本热修复本身是代码与文档修复，不是发布或部署动作。LP-05 继续保持
  `RELEASE_AWAITING_AUTHORIZATION`，现有失败和清理历史保持可见。
- 修复合并后，旧候选、旧提案 SHA、旧 envelope 和旧 attempt 全部保持退役；Main 必须基于
  新的精确合并提交重建不可变候选，并准备新的 proposal SHA。
- 新候选完成全部门禁并形成新提案后，仍须针对精确候选、目标和动作重新获得显式生产发布
  授权；不得从此前失败授权推断延续授权。
- 默认不创建 tag、GitHub Release、package、registry artifact 或外部发布。

## Assumptions

- `99734e8e6c456e0366d28ce7d9a731b3544f0a56` 是本热修复唯一权威代码基线，远端
  `codex/v0-1-project-plan` 精确指向该提交。
- 发布配置中的 `POSTGRES_USER` 与 `POSTGRES_DB` 已经过现有配置校验，是数据库身份读取的
  受信任来源；容器 OS 用户不代表数据库 role。
- 失败尝试前没有上一生产 release，手工清理证据已证明应用表为空且当前 production/restore
  容器和 volume 均为 0；本需求不重新执行该清理。
- 自动清理只适用于本次 attempt 新建、无应用数据且可精确归属的 fresh-install 资源；其他
  情形继续使用既有上一版本回滚或人工恢复边界。
- 本热修复可以在隔离 Docker 环境完成真实回归，不需要连接生产服务器。

## Traceability

| Hotfix requirement | Source evidence | Covered by acceptance criteria |
| --- | --- | --- |
| 显式使用配置数据库 principal | PostgreSQL 17.10 实测与 `production-runtime.ts` 两条缺失用户的读取路径 | 1–3、11–12 |
| rollback 与 restore cleanup 证据分离 | `host-active-operations.ts` 返回额外 `restoreCleanup`，`attempt-record.ts` 严格拒绝 | 4、7、9–10 |
| fresh-install exact-owned 自动清理 | 失败尝试及独立手工清理证据 | 5–8、11–12 |
| 历史与授权不可变 | LP-05 durable stage、旧 attempt/cleanup/proposal | 10、14–15 |
| 最小兼容热修复 | 权威合并基线与 LP-05 原契约 | 11–15 |

## Open questions

None. 技术计划可以在不改变上述行为、证据权威性和安全边界的前提下选择最小实现；任何需要
扩大公共契约、删除范围、生产操作或历史改写的方案都必须返回 Requirements 重新确认。
