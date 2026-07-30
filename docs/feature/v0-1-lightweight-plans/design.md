# Technical Design: v0.1 轻量实施计划重整

- Status: Draft F2 Design
- FeatureId: `v0-1-lightweight-plans-3e7b1c9a5d42`
- Branch: `codex/v0-1-lightweight-plans`
- Requirements: [requirements.md](./requirements.md)
- RequirementsCommit: `59a024111afe5c752ecdefcf4cbfd9fb7be73bd8`

## 1. Background

本 feature 把已有 v0.1 总实施计划整理为五份可单独验收的轻量计划，并提供一份
项目管理入口。它只改变仓库中的规划文档，不改变 v0.1 产品需求、运行时架构、
API、数据模型、Skill、部署拓扑或 Engineering Lifecycle。

旧 `v0-1-project-management` feature 的未验收计划和复杂治理内容已经通过补偿提交
清理；原始 v0.1 需求、领域模型、汇报协议、技术架构和总实施计划继续作为规划输入。

## 2. Goals

- 形成 LP-01 至 LP-05 五份边界清楚的实施计划。
- 每份计划能够依靠自己的实现、测试、演示或部署证据单独验收。
- 用一份轻量管理文档查看依赖、状态、阻塞和下一步。
- 让 REQ-001 至 REQ-027、AC-001 至 AC-020 和 Slice 0–9 均有明确主归属。
- 使用普通 Markdown 和人工审阅完成本次文档验证。

## 3. Non-goals

- 不实现运行时代码、API、数据库、Web 页面、Skill 或部署配置。
- 不重写原始 v0.1 产品范围或技术架构。
- 不实现 authorization/authority engine、角色路由器或平行生命周期状态机。
- 不实现 GitHub pagination、插件 provenance、durable-state fixture、生命周期
  simulator、future-state validator 或 mutation/negative harness。
- 不为计划文档引入 schema、digest、bundle、验证服务或项目级 checker。
- 不把本次 handoff 解释为 LP-01 至 LP-05 的批量实现授权。

## 4. Current And Desired Behavior

当前仓库只有一份按 Slice 0–9 编排的总实施计划。它适合描述整体技术顺序，但不便于
对一个业务结果单独查看范围、依赖和验收条件。

本 feature 完成后：

- 总实施计划继续保留为技术基线；
- `docs/project-management.md` 成为轻量索引；
- `docs/implementation-plans/v0-1/` 保存五份 LP 计划；
- 每份 LP 计划只描述自己的工作和验收；
- 后续执行仍分别通过标准 Engineering Lifecycle 获得授权。

## 5. Artifact And Ownership Boundaries

| Artifact | Owner | Responsibility |
| --- | --- | --- |
| `docs/feature/v0-1-lightweight-plans/requirements.md` | Requirements | 已确认问题、范围和验收标准 |
| `docs/feature/v0-1-lightweight-plans/design.md` | Main | 本 feature 的轻量文档设计 |
| `docs/feature/v0-1-lightweight-plans/implementation-plan.md` | Main | 文件、步骤、验证和回滚 |
| `docs/project-management.md` | Main/项目维护者 | 五份计划的索引、状态、阻塞和下一步 |
| `docs/implementation-plans/v0-1/lp-*.md` | 对应计划维护者 | 单份计划的范围、执行和验收详情 |
| `docs/feature/v0-1-project-plan/*` | 原 v0.1 规划 owner | 产品与技术基线；本 feature 不改写 |

项目管理入口不复制计划的执行步骤和验收正文；单份计划不维护其他计划的状态。

## 6. Document Model

### 6.1 Project management entry

管理入口包含：

1. 文档目的和更新规则；
2. 五份计划的索引表；
3. 依赖顺序；
4. 当前阻塞；
5. v0.1 总体下一步；
6. REQ/AC/Slice 主归属表。

索引表只使用以下列：

| Field | Meaning |
| --- | --- |
| Plan ID | `LP-01` 至 `LP-05` |
| Plan | 标题及计划文档链接 |
| Depends on | 验收依赖；无依赖时为 `None` |
| Status | 受控状态 |
| Blocker | 当前阻塞；无阻塞时为 `None` |
| Next step | 一个明确的下一动作 |

### 6.2 Individual plan

每份计划固定包含以下轻量章节：

1. Goal
2. Scope
3. Out of scope
4. Dependencies
5. Main deliverables
6. Implementation stages
7. Acceptance checklist
8. Risks and blockers
9. Status
10. Next step

每份计划在文首记录 `Plan ID`、标题和原 Slice 范围。验收记录只保留结论、验收人、
UTC 时间和证据链接；初始状态下显示尚无验收记录。

### 6.3 Controlled status

计划状态只使用：

- `Not Started`
- `In Progress`
- `Blocked`
- `Ready for Acceptance`
- `Accepted`

状态由人根据实际工作和证据维护，不从日期、Git、PR 或 lifecycle stage 自动推断。
本 feature 只创建初始 `Not Started` 投影。

## 7. Plan Boundaries

| Plan ID | Result | Primary requirements | Source slices | Depends on |
| --- | --- | --- | --- | --- |
| LP-01 | 核心基础与 Idea 流程 | REQ-001–005、REQ-011–012、REQ-019 | Slice 0–2 | None |
| LP-02 | 项目执行与决策闭环 | REQ-006–010、REQ-013 | Slice 3–4 | LP-01 |
| LP-03 | 结构化汇报与双角色体验 | REQ-014–018、REQ-021–025 | Slice 5–6 | LP-02 |
| LP-04 | AI Skill 与可重复演示 | REQ-020、REQ-027 | Slice 7 | LP-03 |
| LP-05 | 部署与发布就绪 | REQ-026 | Slice 8–9 | LP-04 |

`REQ-028` 由本规划 feature 承接，不形成第六份运行时计划。AC-001 至 AC-020
按照其主要可观察结果映射到一个 LP；跨计划验收标准可在次要引用中说明，但管理入口
只记录唯一主归属。

## 8. Update Flow

```mermaid
flowchart LR
    E["实际工作或证据变化"] --> P["更新对应 LP 计划"]
    P --> M["同步管理入口的状态、阻塞和下一步"]
    M --> R["人工审阅 Markdown、链接和范围"]
    R --> C["同一 Git 变更提交"]
```

更新规则：

- 计划正文是该计划范围和验收详情的来源；
- 管理入口是组合摘要，不单独创造完成结论；
- 无法证明进展时保持 `Not Started`；
- 有明确阻塞时使用 `Blocked` 并写清解除条件；
- 只有验收证据完整且验收人作出结论后才使用 `Accepted`。

## 9. Failure And Recovery

| Failure | Response |
| --- | --- |
| 范围遗漏或重复 | 调整主归属表和对应计划，不新增治理层 |
| 管理入口与计划不一致 | 以计划与实际证据为准，在同一提交修正摘要 |
| 状态无法证明 | 使用 `Not Started` 或 `Blocked` |
| 链接不可达 | 修复相对路径后再提交 |
| 文档与未知用户改动冲突 | 停止并报告，不覆盖 |
| 后续计划提前准备 | 允许准备非依赖工作，但不得绕过验收依赖 |

不存在需要重试、超时、并发控制或幂等协议的新运行时对象。

## 10. Safety, Privacy, And Authorization

- 计划只记录适合提交到仓库的范围和证据链接。
- 不写入 token、cookie、数据库 URL、个人配置或 durable state 副本。
- 状态文字不授予实现、合并、部署或发布权限。
- Engineering Lifecycle 仍由安装的 Skill 和 workflowctl 管理。
- 每份 LP 后续必须分别获得需求确认、计划 Review、实现 Goal、代码 Review 和验收。

## 11. Compatibility And Migration

本 feature 没有公开 API、协议、配置、数据或运行时兼容性影响。迁移只包含文档替换：

- 旧未验收 project-management 产物保持删除；
- 原 v0.1 基线保持不变；
- 新轻量入口和五份 LP 计划作为后续工作的导航。

回滚时可撤销新增轻量文档提交，不需要数据库迁移、feature flag 或服务回滚。

## 12. Verification Strategy

验证保持与文档风险相称：

- `git diff --check` 检查 Markdown 基础格式；
- `git status --short` 检查工作区；
- 检查六个目标 Markdown 文件存在且链接可达；
- 人工核对五份计划的十个必需章节；
- 人工核对依赖链和状态均为初始值；
- 人工核对 REQ-001 至 REQ-027、AC-001 至 AC-020、Slice 0–9 的主归属；
- 搜索确认没有新增被明确排除的 checker、simulator、fixture 或 harness。

不新增验证脚本、代码测试框架或模拟外部服务。

## 13. Observability And Release Impact

本次工作的可观察结果是 Git diff、Review 记录、六份 Markdown 文档及链接。没有新的
日志、指标、追踪或运行时诊断。它不形成 v0.1 运行时发布；Changelog 只记录文档规划
变化。

## 14. Open Decisions

无阻塞性开放决定。目录、五份计划边界、依赖顺序、轻量状态和明确排除项均来自已确认
需求。技术计划 Review 可要求纠正遗漏或矛盾，但不得把被排除的软件验证系统重新加入
范围。
