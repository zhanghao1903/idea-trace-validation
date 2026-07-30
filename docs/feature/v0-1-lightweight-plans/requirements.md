# Requirements: v0.1 轻量实施计划重整

- Status: Confirmed
- FeatureId: v0-1-lightweight-plans-3e7b1c9a5d42
- Branch: codex/v0-1-lightweight-plans
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-07-30T00:56:39Z

## Problem

原始目标只是把已有 v0.1 项目计划拆成若干份可单独验收的实施计划，并用一个文档维护总体状态。此前的 `v0-1-project-management` feature 把这个文档任务扩展成了新的授权与生命周期验证系统，引入了复杂 authority contract、GitHub 状态解析、插件来源校验、未来状态验证、生命周期模拟和大规模反例测试约束。

这些机制既不是已确认 v0.1 业务需求，也不是 Engineering Lifecycle Skill 要求项目自行实现的能力。它们增加了文档量、维护成本和审查循环，却没有直接帮助用户理解“有哪些计划、先做什么、做到什么算验收”。

项目需要清理未验收的过度设计产物，回到原始需求：少量、边界清晰、可独立验收的实施计划，加一份轻量项目管理入口。

## Current behavior

- `docs/feature/v0-1-project-plan/requirements.md` 仍是 v0.1 产品范围的已确认基线。
- 同目录的领域模型、结构化汇报协议、技术架构和原始实施计划仍是有效输入，应保留。
- 旧 project-management feature 曾生成 8 份计划、技术设计、实施计划、项目管理文档和 Changelog 内容，并把文档状态与自研 checker、外部 authority 和模拟器绑定。
- Main 工作树中已出现对这些旧产物的清理改动，但尚未形成新的已确认需求；Requirements 不把这些工作树改动视为已批准结果。
- 旧 feature 的 durable GoalRun 仍为 ACTIVE，当前工具没有 cancel/replan 反向转换；本 Draft 不修改 durable state。

## Desired scenarios

1. 维护者可以从干净基线开始，不再携带旧 feature 产生的复杂治理文档、checker 约束或测试矩阵。
2. 用户打开一份轻量管理文档，就能看到全部计划的目标、依赖、状态和下一步。
3. 执行者打开某一份实施计划，就能知道该计划做什么、不做什么、依赖什么、交付什么以及如何验收。
4. 一份计划完成后可以单独提交验收；其结果不会自动代表其他计划或整个 v0.1 已完成。
5. 计划状态或下一步变化时，只需同步更新该计划和管理入口，不需要运行自研授权引擎或生命周期模拟器。
6. Engineering Lifecycle 继续由已安装 Skill 和 durable workflow 负责；仓库文档不复制、推断或重新实现其权限和状态规则。

## Goals

- 清理旧 project-management feature 中未验收、且只服务于过度设计治理机制的产物。
- 保留原始 v0.1 已确认需求、领域、协议、架构和实施计划基线。
- 将 Slice 0–9 重新组合为 5 份以可观察交付结果为边界的实施计划。
- 每份计划具备独立范围、依赖、交付物、验收清单、状态和下一步。
- 建立一份轻量项目管理文档，只维护计划索引、依赖、状态、阻塞和下一步。
- 让验证工作与文档任务相称：使用普通 Markdown、路径、链接、范围和人工审阅检查，不新增软件系统。
- 清理完成后保持目标工作树无未提交、未跟踪或临时生成物。

## Proposed plan boundaries

以下 5 份计划是重新评估后的 Draft 拆分。原 Slice 仍可作为计划内部执行顺序，不再一对一升级为独立 feature。

| Plan ID | 计划 | 独立可验收结果 | 原需求主范围 | 原 Slice |
| --- | --- | --- | --- | --- |
| LP-01 | 核心基础与 Idea 流程 | 工程与权威状态基础可用，Idea 可以创建、澄清、明确进入执行并被读取 | REQ-001–005、REQ-011–012、REQ-019 | Slice 0–2 |
| LP-02 | 项目执行与决策闭环 | 进展、阻塞、待确认、支持、证据、结论及高影响确认形成可追踪闭环 | REQ-006–010、REQ-013 | Slice 3–4 |
| LP-03 | 结构化汇报与双角色体验 | 两类角色查看同一权威事实，不同项目可安全呈现不同结构的汇报 | REQ-014–018、REQ-021–025 | Slice 5–6 |
| LP-04 | AI Skill 与可重复演示 | Codex/Claude 可按 Skill 通过真实 API 完成核心演示故事 | REQ-020、REQ-027 | Slice 7 |
| LP-05 | 部署与发布就绪 | v0.1 可部署、可恢复、可重复演示，并形成真实发布就绪结论 | REQ-026 | Slice 8–9 |

依赖顺序为 `LP-01 → LP-02 → LP-03 → LP-04 → LP-05`。这表示验收依赖，不禁止在风险可控时提前准备后续计划中的非依赖工作。

`REQ-028` 由“形成并确认轻量计划体系”承接，不作为第六份运行时实施计划。

## Functional requirements

| ID | Requirement |
| --- | --- |
| LPR-001 | 清理范围必须只针对旧 project-management feature 新增或修改、且尚未被用户验收的产物；不得删除原始 v0.1 已确认需求、领域模型、协议、技术架构和实施计划。 |
| LPR-002 | 旧 feature 的技术设计、实施计划、8 份 IP 文档、复杂项目管理文档、仅为该 feature 添加的 Changelog 内容及旧计划中的治理链接，必须被删除或恢复为清理前基线。 |
| LPR-003 | 清理不得使用强制重置、强制推送或覆盖未知用户改动；遇到来源不明或与用户改动重叠的文件时必须停止并报告。 |
| LPR-004 | Main 必须产出 LP-01–LP-05 五份实施计划；每份计划使用一个独立 Markdown 文件。 |
| LPR-005 | 每份计划只需包含：目标、范围、非范围、依赖、主要交付物、实施阶段、验收清单、风险/阻塞、状态和下一步。 |
| LPR-006 | 每份计划必须有至少一个不依赖主观判断的验收场景，并可通过对应实现、测试、演示或部署证据单独验收。 |
| LPR-007 | 单份计划验收只影响该计划；后继计划必须遵守依赖，但无依赖计划不得因另一计划失败而自动回退。 |
| LPR-008 | 项目必须只有一份轻量管理文档；它只汇总 Plan ID、标题、依赖、状态、阻塞、下一步和计划文档链接。 |
| LPR-009 | 计划状态只使用 `Not Started`、`In Progress`、`Blocked`、`Ready for Acceptance`、`Accepted`；状态由人依据现有实现和证据维护。 |
| LPR-010 | 单份计划的验收记录只需记录验收结论、验收人、UTC 时间和证据链接；标准 Engineering Lifecycle 产生的 commit、PR 或 Review 可以作为证据，但管理文档不得自行判定其授权效力。 |
| LPR-011 | Engineering Lifecycle 的角色、阶段、权限和 durable state 继续由现有 Skill 与 workflowctl 管理；仓库不得实现平行状态机、authority engine 或 lifecycle simulator。 |
| LPR-012 | 本文档任务的验证仅需要 Git 状态、Markdown 结构、路径/链接、计划覆盖和人工范围审阅；不得新增项目级 checker、验证服务或代码测试框架。 |
| LPR-013 | 不得为本需求实现 GitHub pagination、插件 provenance、通用 future-state validator、完整 lifecycle simulator 或大规模 mutation/negative harness。 |
| LPR-014 | 不得把一次性验证脚本、fixture、模拟 durable state、GitHub 响应缓存或 authority bundle 提交到仓库。 |
| LPR-015 | 清理与重建完成后，目标工作树必须 clean；仓库中不得残留旧计划文件、临时 checker 或只为旧 feature 生成的未跟踪文件。 |
| LPR-016 | 原 `REQ-001`–`REQ-027` 和 Slice 0–9 必须各有一个主要计划归属，但不要求机器可读 contract、双向 authority digest 或自动 mutation 校验。 |
| LPR-017 | 计划或管理文档变化必须与对应工作在同一变更中更新；无法确认状态时使用 `Not Started` 或明确记录 `Blocked`，不得推断完成。 |

## Acceptance criteria

| ID | Requirement IDs | Observable criterion |
| --- | --- | --- |
| LPA-001 | LPR-001–003 | Given 清理完成，when 对比原始 v0.1 基线，then 已确认需求、领域、协议、架构和原实施计划仍存在，旧 project-management 过度设计产物已移除，且没有覆盖未知用户改动。 |
| LPA-002 | LPR-004–006 | Given 新计划已形成，when 逐份检查 LP-01–LP-05，then 每份都是独立 Markdown 文件，包含规定的轻量章节和至少一个可观察验收场景。 |
| LPA-003 | LPR-007、LPR-009–010 | Given 任一计划提交验收，when 验收通过或拒绝，then 只更新该计划及管理入口的状态，并留下简洁的结论、时间、验收人和证据链接。 |
| LPA-004 | LPR-008 | Given 打开唯一管理文档，when 查看项目状态，then 能在一页看到五份计划的依赖、状态、阻塞和下一步，并可跳转到计划详情。 |
| LPA-005 | LPR-011–014 | Given 审查本 feature 的文件和验证方法，when 搜索实现范围，then 不存在自研 authorization engine、GitHub pagination、plugin provenance、future-state validator、lifecycle simulator 或大规模 mutation/negative harness。 |
| LPA-006 | LPR-012 | Given 文档任务准备交付，when 执行验证，then Git/Markdown/链接/覆盖检查与人工审阅足以判断结果，且没有新增 checker 或软件测试框架。 |
| LPA-007 | LPR-015 | Given 清理与轻量文档生成完成，when 运行 `git status --porcelain`，then 输出为空，且没有临时或旧计划文件残留。 |
| LPA-008 | LPR-016 | Given 检查轻量追踪表，when 遍历 `REQ-001`–`REQ-027` 和 Slice 0–9，then 每项恰有一个主要计划归属，没有孤立范围。 |
| LPA-009 | LPR-017 | Given 计划范围、状态、阻塞或下一步发生变化，when 审查同一变更，then 对应计划与管理入口一致，且未被证据支持的状态没有被标记为完成。 |

## Non-goals

- 不重新设计 Engineering Lifecycle，不在仓库中复制 workflowctl 或 Skill 的规则。
- 不自研 authorization/authority engine、角色路由器或 plan acceptance service。
- 不解析 GitHub 分页来证明计划状态，不缓存或归一化 GitHub authority。
- 不校验插件 provenance、安装来源、版本解析或启用插件唯一性。
- 不构建完整 lifecycle simulator、通用 future-state validator 或 durable-state fixture 系统。
- 不建立大规模 mutation、negative、differential 或 188-case 测试 harness。
- 不为 Markdown 计划设计机器可读 schema、复杂 digest、投影 bundle 或事务协议。
- 不在 Requirements 阶段删除旧文件、清理工作树、写实施计划、设计、代码、测试或部署内容。
- 不修改当前 ACTIVE GoalRun 或其他 durable workflow state。
- 不改变原始 v0.1 产品范围、API 行为、技术架构或部署目标。

## Failure and recovery expectations

- 如果旧文件与用户未提交改动重叠，停止清理并列出冲突文件，不猜测或覆盖。
- 如果无法证明某产物只属于旧 project-management feature，保留它并请求确认。
- 如果五份计划出现范围重叠或遗漏，先调整归属表，不通过增加 checker 或新治理层解决。
- 如果状态或证据不明确，保持 `Not Started` 或 `Blocked`，不要伪造完成状态。
- 如果管理入口与计划详情不一致，以计划详情和实际证据为准，并在同一变更中修正入口。
- 如果 durable workflow 仍不允许新 feature 被 Main 接收，保持本需求为 Draft/已确认待交接状态，不修改旧 GoalRun。
- 如果清理后标准仓库检查失败，只修复与本次清理直接相关的问题；不顺带扩展框架或测试范围。

## Public API and compatibility impact

本需求只涉及计划文档和工作区清理，不改变运行时 API、数据模型、Skill 接口、Web 行为或外部兼容性。原始 v0.1 技术与产品契约继续有效。

## Safety, privacy, permissions, and authorization

- 清理必须基于明确文件清单和 Git 历史，不使用破坏性重置或强制推送。
- 不删除来源不明、可能属于用户或其他 feature 的改动。
- 文档不得包含 token、cookie、数据库 URL、个人配置、真实业务私密数据或 durable state 副本。
- 标准 Engineering Lifecycle 的权限由已安装 Skill 和 durable workflow 决定；轻量管理文档只表达项目进度，不授予权限。
- 本 Draft 不授权提交、推送、handoff、设计、实现、Review、合并、发布或 durable state 修改。

## Release impact

- 直接产物是清理后的文档基线、五份轻量实施计划和一份管理入口，不构成运行时发布。
- 本需求不会自动改变 v0.1 发布版本或 Changelog。
- 只有各计划按原始产品需求完成并经过相应验收后，v0.1 才能进入发布判断。

## Assumptions

- 原始 v0.1 已确认需求和配套设计/计划应继续保留。
- 旧 project-management 生成的治理文档和 checker 约束尚未获得用户验收，可以在确认后按明确清单清理。
- 五份计划比八份计划更接近可观察交付结果，同时仍足以支持独立验收。
- 原 Slice 0–9 可保留为每份计划内部的实施参考，不需要重新编号或复制全文。
- `docs/project-management.md` 可继续作为唯一轻量管理入口，但其旧复杂内容应被替换。
- 每份计划可以使用普通 Markdown；无需为计划文档增加运行时代码或测试依赖。

## Open questions

无阻塞性开放问题。用户已确认 LP-01–LP-05 五份计划、轻量管理入口、清理边界和明确排除项。
