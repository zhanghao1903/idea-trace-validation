# Implementation Plan: v0.1 轻量实施计划重整

- Status: Implemented F4
- FeatureId: `v0-1-lightweight-plans-3e7b1c9a5d42`
- Branch: `codex/v0-1-lightweight-plans`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F4 implemented; lightweight verification completed

## 1. Scope

### In scope

- 创建一份轻量项目管理入口。
- 创建 LP-01 至 LP-05 五份独立实施计划。
- 建立唯一的 REQ、AC 和 Slice 主归属表。
- 记录初始状态、依赖、阻塞、下一步和空验收记录。
- 运行与 Markdown 文档风险相称的验证。
- 添加一条 Docs Changelog 记录。

### Out of scope

- v0.1 运行时代码、测试、API、数据库、Web、Skill 或部署实现。
- 修改原始产品需求、领域模型、汇报协议、技术架构或总实施计划。
- 自研 checker、authorization engine、GitHub 状态解析、插件 provenance、
  lifecycle simulator、future-state validator、fixture 或 mutation harness。
- 启动 LP-01 至 LP-05 的实现 Goal、PR、合并、验收或发布。

## 2. Preconditions

- exact RequirementsHandoff
  `48f3a7531bdd054899dafd7fbae37e5b11d723dbd8955895dc90a32fc9bd2f32`
  已由 Main 接受。
- 本计划必须获得 Technical Plan Review PASS 后才能开始 F4。
- 旧 `v0-1-project-management` GoalRun 已被真实标记为 `BLOCKED`，不得恢复其
  过度设计目标。
- 旧 GoalRun 仍占用全局 Goal 槽；在本计划 PASS 后、创建新 GoalRun 前，必须由
  受支持的 Engineering Lifecycle 修复流程解除或归档该已废弃运行。不得手工编辑
  durable state，也不得把旧 GoalRun 伪造为完成。

## 3. Target Files

| File | Action | Purpose |
| --- | --- | --- |
| `docs/project-management.md` | Create | 五份计划的唯一轻量索引 |
| `docs/implementation-plans/v0-1/lp-01-core-idea-flow.md` | Create | LP-01 计划 |
| `docs/implementation-plans/v0-1/lp-02-execution-decisions.md` | Create | LP-02 计划 |
| `docs/implementation-plans/v0-1/lp-03-reporting-role-experience.md` | Create | LP-03 计划 |
| `docs/implementation-plans/v0-1/lp-04-ai-skill-demo.md` | Create | LP-04 计划 |
| `docs/implementation-plans/v0-1/lp-05-deployment-release.md` | Create | LP-05 计划 |
| `CHANGELOG.md` | Update | 记录轻量规划文档变化 |
| 本 feature 的 design/plan | Update | 记录实施和验证结果 |

不修改 `docs/feature/v0-1-project-plan/` 下的原始基线。

## 4. Plan Content

每份 LP 文档包含设计规定的十个章节：

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

共同初始值：

- Status: `Not Started`
- Blocker: `None`
- Acceptance result: `None`
- Acceptance owner/time/evidence: `None`
- Next step: 为该 LP 启动独立 Requirements 阶段

每份计划从原总计划引用相关 Slice，不复制完整技术设计。验收清单以可观察结果为主，
允许引用原需求、测试、演示或部署证据。

## 5. Primary Trace Assignment

### Requirements and slices

| Plan | Primary requirements | Source slices |
| --- | --- | --- |
| LP-01 | REQ-001–005、REQ-011–012、REQ-019 | Slice 0–2 |
| LP-02 | REQ-006–010、REQ-013 | Slice 3–4 |
| LP-03 | REQ-014–018、REQ-021–025 | Slice 5–6 |
| LP-04 | REQ-020、REQ-027 | Slice 7 |
| LP-05 | REQ-026 | Slice 8–9 |

`REQ-028` 由当前 lightweight planning feature 承接。

### Acceptance criteria

| Plan | Primary acceptance criteria |
| --- | --- |
| LP-01 | AC-002、AC-003、AC-011、AC-014 |
| LP-02 | AC-005、AC-007、AC-008、AC-009、AC-010、AC-012 |
| LP-03 | AC-004、AC-006、AC-013、AC-016、AC-017、AC-018 |
| LP-04 | AC-001、AC-015 |
| LP-05 | AC-019 |

`AC-020` 由当前 feature 的 requirements/design/implementation-plan Review 证据承接。

## 6. Implementation Slices

| Slice | Files | Work | Verification | Rollback |
| --- | --- | --- | --- | --- |
| LPS-1 | 五份 `lp-*.md` | 按确认边界写目标、范围、依赖、交付物、阶段和验收清单 | 人工核对十个章节、初始状态和独立验收场景 | 删除五份新增文档 |
| LPS-2 | `docs/project-management.md` | 写索引、依赖、状态、阻塞、下一步和主归属 | 人工核对链接、依赖链和覆盖表 | 删除入口文档 |
| LPS-3 | Feature docs、`CHANGELOG.md` | 记录实现说明、验证结果和 Docs 变更 | `git diff --check`、路径/链接检查、范围审阅 | 撤销文档提交 |

三个 slice 可以在一个文档实现 Goal 中完成，但提交应保持范围清楚。任何运行时代码
变化都必须停止并重新评估范围。

## 7. Verification

### Automated repository checks

只使用已有 Git 和 shell 能力，不创建新脚本：

```bash
git diff --check
git status --short
git diff --name-status <approved-plan-commit>..HEAD
```

### Manual Markdown checks

- 六个目标 Markdown 文件存在；
- 管理入口的五个计划链接可达；
- 每份 LP 恰有十个规定章节；
- 五份计划初始状态均为 `Not Started`；
- 依赖为 `LP-01 → LP-02 → LP-03 → LP-04 → LP-05`；
- REQ-001 至 REQ-027、AC-001 至 AC-019、Slice 0–9 各有一个 LP 主归属；
- REQ-028/AC-020 明确归当前 planning feature；
- 每份 LP 至少有一个可观察验收场景；
- 没有复制详细技术设计到管理入口；
- 没有新增 checker、fixture、模拟状态或外部响应缓存。

### Checks intentionally not required

- 代码单元测试、集成测试和 E2E 测试：本 feature 不改代码；
- GitHub API 或 pagination：不用于文档验收；
- workflowctl 状态模拟：由标准 lifecycle 自身负责；
- 部署 smoke：属于 LP-05 后续实现范围。

## 8. Documentation And Changelog

- `docs/project-management.md` 是面向维护者的当前入口。
- 五份 LP 文档是后续独立 requirements intake 的输入，不是实现授权。
- `CHANGELOG.md` 在 `Unreleased / Docs` 下记录“以五份轻量、独立验收计划替代未验收
  的复杂项目治理方案”。
- 不新增 API、迁移、权限或发布文档。

## 9. Rollout And Rollback

### Rollout

1. 提交并推送批准后的六份目标文档与 changelog。
2. 在同一 feature PR 中提供文件清单和验证结果。
3. 精确 head Code Review 通过后，由外部 merge owner 决定合并。
4. 合并后，从 LP-01 开始分别进入 Requirements，不批量启动五份实现。

### Rollback

- 合并前：用新补偿提交删除或修正轻量文档，不重写历史。
- 合并后：若边界需要调整，以新的需求快照和文档提交修正。
- 不需要数据库、服务、配置、版本或部署回滚。

## 10. Risks And Controls

| Risk | Control |
| --- | --- |
| 再次过度设计 | 文件范围冻结；明确禁止软件验证系统 |
| 五份计划范围遗漏 | 人工核对唯一主归属表 |
| 管理入口变成第二份详细计划 | 入口只保留六列摘要和链接 |
| 计划被误读为实现授权 | 每份计划注明需独立 Engineering Lifecycle |
| 状态被目标日期驱动 | 初始统一 `Not Started`，后续只按事实更新 |
| 旧 blocked Goal 占槽 | F4 前走受支持的 workflow 修复，不手改 state |

## 11. Commit And Review Plan

1. F2 设计单独提交并推送。
2. F3 实施计划与 Changelog 单独提交并推送。
3. 用包含 requirements、design 和 implementation-plan 的精确 F3 commit 生成
   TechnicalPlanReviewRequest。
4. Review PASS 后才创建 F4 Goal；若 Review FAIL，只修订计划 finding，不开始实现。
5. F4 完成后运行轻量验证、提交、推送、更新 PR 并请求 exact-head Code Review。

## 12. Open Decisions

无产品或文档边界开放决定。唯一实施前置阻塞是旧 Goal 槽位的合法释放；其处理属于
Engineering Lifecycle 运行状态修复，不属于仓库文档实现范围。

## 13. Implementation And Verification Record

- Technical Plan Review PASS:
  `78da90854e4ae36a6fe99ff79fa171cc54b218be3a7b60acbfe25740adb13e00`
- 旧 blocked GoalRun 已通过正式、幂等的 `abandon-development` 迁移保留为
  `ABANDONED`；本 feature 随后获得新的独立 GoalRun。
- 已创建唯一管理入口和五份 LP 文档，未修改原
  `docs/feature/v0-1-project-plan/` 基线。
- `git diff --check`、目标路径、相对链接、十章节结构、初始状态、依赖链及
  REQ/AC/Slice 唯一主归属均已按第 7 节轻量检查复核。
- 未增加 checker、fixture、authority engine、GitHub pagination、插件 provenance、
  lifecycle simulator、future-state validator 或 mutation/negative harness。
