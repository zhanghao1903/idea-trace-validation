# Implementation Plan: v0.1 可独立验收实施计划拆分与管理

- Feature directory: `docs/feature/v0-1-project-management/`
- FeatureId: `v0-1-project-management-6f4b1a2d9c07`
- Branch: `codex/v0-1-project-management`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F3 / `PLAN_DRAFTING`
- Target outcome: 一份项目管理入口和八份独立实施计划
- Updated: 2026-07-28

## 1. Scope

### In scope

- 创建 `docs/project-management.md`。
- 创建 `docs/implementation-plans/v0-1/` 下 IP-01–IP-08 八份计划。
- 按确认基线写入独立范围、依赖、交付物、执行步骤、验证和验收记录。
- 建立 REQ、AC、Slice 和上游设计资料追踪。
- 将所有 IP 初始化为有证据支持的 `Draft`。
- 在原总实施计划顶部增加项目管理入口链接和非状态台账说明。
- 添加文档类 Changelog 记录。
- 验证文件集、结构、依赖图、追踪、链接、一致性和安全边界。

### Out of scope

- 实现或测试任何 v0.1 运行时代码。
- 为 IP-01–IP-08 创建批量 RequirementsHandoff、GoalRun、PR 或验收。
- 修改原产品需求、领域模型、协议、架构或总计划的技术结论。
- 部署、发布、合并或处理生产凭据。

## 2. Preconditions

实现只能在以下条件全部满足后开始：

- 当前 requirements、design 和 implementation plan 位于同一 commit；
- Review 对该精确 commit 和 composite digest 返回 PASS；
- lifecycle stage 为 `PLAN_APPROVED` 或 `DEVELOPMENT_QUEUED`；
- Main 已按返回的精确 objective 激活唯一 GoalRun；
- 工作树位于 `codex/v0-1-project-management` 且无无关改动。

## 3. Target files

```text
CHANGELOG.md
docs/project-management.md
docs/feature/v0-1-project-plan/implementation-plan.md
docs/implementation-plans/v0-1/
├── ip-01-foundation-contracts.md
├── ip-02-idea-intake.md
├── ip-03-execution-facts.md
├── ip-04-conclusion-confirmation.md
├── ip-05-structured-reporting.md
├── ip-06-dual-role-web.md
├── ip-07-ai-skill-demo.md
└── ip-08-deployment-release.md
```

不新增永久验证脚本、运行时包或生成物。

## 4. Implementation slices

### PM-S1 — 建立八份独立计划

文件：

```text
docs/implementation-plans/v0-1/*.md
```

工作：

1. 为 IP-01–IP-08 建立固定元数据和十四个必需章节。
2. 从确认需求与总计划提取每份计划的业务结果、范围、非范围、依赖和目标日期。
3. 写入具体交付物、执行步骤、失败恢复、验证矩阵和独立验收清单。
4. 写入 REQ、AC、Slice 和设计资料映射。
5. 将 `Status` 设为 `Draft`，将 lifecycle、分支和验收字段设为明确的未分配/空值。
6. 说明每份计划需要独立 RequirementsHandoff 和完整 lifecycle。

门禁：

- 文件名、PlanId 和标题一一对应；
- 每份计划可单独理解和验收；
- 不复制上游完整正文；
- 不声称任何运行时实现已经完成；
- 不把当前 management handoff 写成 IP authority。

Rollback：

- 合并前删除本 Slice 新增文件即可恢复；不影响现有产品文档或运行时。

### PM-S2 — 建立单一项目管理入口

文件：

```text
docs/project-management.md
```

工作：

1. 写入 v0.1 范围基线、目标日期和权威来源。
2. 汇总八份计划的 ID、版本、状态、依赖、目标日期、证据、阻塞和下一步。
3. 写入 Mermaid 依赖图和关键路径。
4. 写入受控状态定义、状态晋级规则和 authority 映射。
5. 写入完整 REQ/AC/Slice 追踪矩阵。
6. 写入发布就绪摘要，分离仓库内门禁与外部部署条件。
7. 写入同步更新、stale、纠偏和变更历史规则。

门禁：

- 入口只汇总，不复制八份计划的详细步骤；
- 所有摘要字段与独立计划一致；
- IP-01–IP-08 初始均为 `Draft`；
- 发布就绪度明确为未就绪；
- 入口不授予任何实现或发布权限。

Rollback：

- 合并前删除入口文件；原总计划继续可读，但没有新的状态台账。

### PM-S3 — 收敛状态入口与 release record

文件：

```text
docs/feature/v0-1-project-plan/implementation-plan.md
CHANGELOG.md
```

工作：

1. 在原总计划顶部增加显著说明：该文件保留为历史技术来源，不维护当前状态。
2. 链接到 `docs/project-management.md` 和八份独立计划目录。
3. 在 `CHANGELOG.md` 的 `Unreleased / Docs` 下记录项目管理入口与独立计划拆分。
4. 不修改原总计划的技术切片、门禁或目标日期。

门禁：

- 仓库中只有 `docs/project-management.md` 被声明为项目级状态入口；
- Changelog 描述文档治理影响，不宣称运行时功能已交付；
- 原计划 diff 仅包含入口说明。

Rollback：

- 回退说明和 Changelog 条目；不修改原计划正文。

### PM-S4 — 验证、证据与交付准备

文件：

```text
docs/project-management.md
```

工作：

1. 运行第 7 节的全部自动检查。
2. 把验证命令、结果、精确 commit 和未运行项记录到项目管理入口的治理证明区。
3. 检查 Git diff 只包含批准范围。
4. 提交并推送 feature branch，准备独立 PR。
5. 通过 lifecycle 生成精确 head 的 CodeReviewRequest。

门禁：

- 所有自动检查通过；
- 无秘密、临时文件、生成物或无关改动；
- 项目入口与八份计划位于同一精确 head；
- required review/check 证据可复核；
- Main 不自批或自合并。

Rollback：

- 验证失败时不提交完成证据；修正文档后重跑。

## 5. Per-plan content baseline

| Plan | Target date | Source slices | Primary requirements | Required independent result |
| --- | --- | --- | --- | --- |
| IP-01 | 2026-07-28 | 0–1 | REQ-011、012、019 | workspace、契约、领域生命周期和数据库基础通过门禁 |
| IP-02 | 2026-07-29 | 2 | REQ-001–005 | Idea 登记、澄清、显式推进和双角色读取成立 |
| IP-03 | 2026-07-30 | 3 | REQ-006–009、013 | 执行事实、关注事项、证据、纠偏和历史成立 |
| IP-04 | 2026-07-31 | 4 | REQ-010 | 结论和高影响确认闭环成立 |
| IP-05 | 2026-08-01 | 5 | REQ-021–025 | 结构化汇报校验、版本、渲染与回退成立 |
| IP-06 | 2026-08-02 | 6 | REQ-014–018 | 双角色 Web 与权威事实呈现成立 |
| IP-07 | 2026-08-03 | 7 | REQ-020、027 | Skill 与可重复演示闭环成立 |
| IP-08 | 2026-08-04–06 | 8–9 | REQ-026 | 部署、恢复、外部演示与发布候选证据成立 |

`REQ-028` 由当前 management feature 承接。

## 6. AC trace baseline

| AC | Plans |
| --- | --- |
| AC-001 | IP-02、IP-07 |
| AC-002–003 | IP-02 |
| AC-004 | IP-02、IP-06 |
| AC-005 | IP-01、IP-03 |
| AC-006 | IP-03、IP-06 |
| AC-007 | IP-03 |
| AC-008–009 | IP-03、IP-06 |
| AC-010 | IP-04 |
| AC-011 | IP-01、IP-02、IP-03、IP-04 |
| AC-012 | IP-03、IP-04 |
| AC-013 | IP-06 |
| AC-014 | IP-01、IP-02、IP-03、IP-04、IP-05 |
| AC-015 | IP-07 |
| AC-016–018 | IP-05、IP-06 |
| AC-019 | IP-07、IP-08 |
| AC-020 | IP-01–IP-08 |

每个独立计划只复制自身 AC 行；项目入口维护完整组合矩阵。

## 7. Verification

### Automated checks

1. `git diff --check`
2. 验证目标文件全部存在且没有额外并行状态台账。
3. 验证每份计划包含固定元数据和十四个章节。
4. 验证 Plan ID 唯一，依赖只引用 IP-01–IP-08，并且依赖图无环。
5. 验证项目入口与计划文件的标题、版本、状态和依赖一致。
6. 验证 `REQ-001`–`REQ-027` 与 Slice 0–9 的主要归属各恰好一次，
   `REQ-028` 归当前 management feature。
7. 验证 AC-001–AC-020 至少出现一次，且每个 IP 至少关联一个 AC。
8. 验证所有相对 Markdown 链接解析到仓库文件。
9. 验证所有 IP 初始状态为 `Draft`，验收字段为空，feature/branch 未分配。
10. 搜索可能的秘密赋值、私密 URL、生成物和临时文件。

允许在 `/private/tmp` 使用一次性验证脚本，但不提交脚本或输出。

### Manual review

- 抽查 IP-01、IP-05、IP-08，确保工程基础、安全汇报和外部部署三种不同范围均可
  独立理解。
- 对照原总计划逐 Slice 核对交付物和门禁未遗漏。
- 对照确认需求逐 REQ/AC 核对主归属和辅助映射。
- 确认入口摘要没有复制详细执行正文。

### Checks intentionally deferred

- 运行时单元、集成、浏览器或部署测试：本 feature 不修改运行时。
- IP-01–IP-08 的实现证明：由各自独立 GoalRun 和 PR 产生。
- 真实服务器、DNS、HTTPS 和备份恢复：只属于 IP-08。

## 8. Documentation and release record

- `docs/project-management.md`：稳定的项目组合入口。
- `docs/implementation-plans/v0-1/*.md`：独立执行与验收范围。
- 原总计划：增加非状态台账说明。
- `CHANGELOG.md`：`Unreleased / Docs` 条目。

本 feature 不产生运行时版本、迁移说明或 API 文档变更。

## 9. Rollout and rollback

### Rollout

1. Review 批准本计划 snapshot。
2. 激活单一 documentation GoalRun。
3. 完成 PM-S1–PM-S4。
4. 推送并创建独立 PR。
5. Review 审查精确 head；由外部 merge owner 按 policy 合并。
6. Main 记录 management feature 收尾证明。
7. Requirements 从 IP-01 开始逐份创建独立需求，不批量授权。

### Rollback

- 合并前：回退本 feature 的文档实现提交。
- 合并后：用补偿提交修正文档契约；不重写或删除已产生的 authority、Review 和验收记录。
- 若单个 IP 拆分需要变化：该 IP 走独立需求修订，不静默修改其它 IP。

### Compatibility

纯新增文档契约；无运行时、数据、API 或 Skill 兼容性影响。

## 10. Commit and push plan

计划写作阶段：

- writer commit 只包含：
  - `docs/feature/v0-1-project-management/design.md`
  - `docs/feature/v0-1-project-management/implementation-plan.md`
  - `CHANGELOG.md`
- commit message: `docs: plan independent v0.1 implementation features`
- 推送到 `origin/codex/v0-1-project-management`
- 以 requirements、design、implementation plan 同一 commit 生成 plan review snapshot。

实现阶段：

- F4 文档实现与入口变更为一个 scoped commit；
- F5 验证证据为一个 scoped commit（仅在确有文档变化时）；
- F6 Changelog/PR 修订只在需要时提交；
- 每个完成阶段均推送，不 amend 已获 authority 的 snapshot。

## 11. Risks

| Risk | Trigger | Response |
| --- | --- | --- |
| 八份计划只是复制总计划 | 大段重复文件/测试清单 | 保留链接，只写独立范围和特有门禁 |
| `Draft` 被误读为已授权 | 缺少 lifecycle 字段 | 明确 `Unassigned` 与独立 handoff 规则 |
| 状态入口漂移 | 入口与计划不一致 | 同提交更新、校验、标记 stale |
| 依赖过度串行 | 不必要硬依赖 | 只保留确认图；IP-04/IP-05 可并行 |
| AC/REQ 映射遗漏 | 覆盖检查失败 | 保持 Draft，修正后再审查 |
| 外部部署被提前标记完成 | IP-08 无外部证据 | 分离仓库和外部门禁 |
| 截止日驱动虚假状态 | 根据日期推断进度 | 状态仅依赖 authority 与证据 |

## 12. Open decisions

无阻塞性开放决定。每个 IP 的实现级技术决策由其独立 RequirementsHandoff 和计划
Review 决定。
