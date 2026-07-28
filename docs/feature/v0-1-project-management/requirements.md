# Requirements: v0.1 可独立验收实施计划拆分与管理

- Status: Confirmed
- FeatureId: v0-1-project-management-6f4b1a2d9c07
- Branch: codex/v0-1-project-management
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-07-28T12:52:10Z

## Problem

现有 `docs/feature/v0-1-project-plan/implementation-plan.md` 把整个 v0.1 写在一份总计划中，并以 Slice 0–9 描述实现顺序。它适合说明全局技术路径，但不便于把每一段工作作为独立交付物管理和验收：

- 单个 Slice 的范围、依赖、入口条件和验收责任散落在总文档中；
- 无法为一组形成业务结果的 Slice 单独建立稳定计划、验收证据和验收记录；
- 某部分完成时，很难在不宣称整个 v0.1 已完成的前提下准确标记进度；
- 总计划更新容易同时影响多个实施范围，缺少清晰的版本边界；
- 需求、实施计划、提交、检查与验收结论之间没有逐计划追踪。

项目需要先把总计划拆成若干份可执行的实施计划。每份计划必须有独立范围和完成门禁，可以单独实施、审查、验收、回退或延期；同时仍由一个项目管理入口维护总体依赖、状态和发布就绪度。

## Current behavior

- `docs/feature/v0-1-project-plan/requirements.md` 是已确认的 v0.1 产品需求基线。
- `domain-model.md`、`structured-report-protocol.md` 和 `technical-architecture.md` 分别记录领域、协议和架构输入。
- `implementation-plan.md` 以 Slice 0–9 描述文件范围、工作内容、目标日期、门禁、测试、部署和回滚。
- Slice 0–9 尚未被组织成若干份具有稳定 ID、独立文件、独立验收条件和独立验收记录的实施计划。
- 当前也没有一个统一索引可汇总各实施计划的依赖、状态、阻塞、验收结果和下一步。

## Desired scenarios

1. 项目负责人打开单一管理入口，即可看到全部实施计划、依赖关系、状态、当前阻塞、下一步和 v0.1 总体就绪度。
2. 执行者选择一份实施计划，只读取该计划及其链接的权威资料，就能理解范围、非范围、前置输入、交付物、执行步骤、风险、检查和验收标准。
3. 某份计划满足前置条件后可以独立开始，不要求所有其他计划同时开始。
4. 某份计划完成实现与验证后，可以使用该计划自己的验收清单、精确 commit 和证据单独提交验收。
5. 验收方可以接受或拒绝单份计划；结果不会自动把后续计划或整个 v0.1 标记为完成。
6. 某份计划失败、阻塞、回退或延期时，其他不依赖它的计划状态不受影响；依赖它的计划不得越过入口门禁。
7. 需求、总计划或已验收实现发生变化时，受影响计划能够明确重开或生成新版本，并保留原验收记录。
8. 八份计划拆分完成后，每份计划分别作为一个 feature，从独立需求确认开始，经过 Main 和 Review 的完整生命周期，不能把本次总拆分 handoff 当作八份实现的批量授权。

## Goals

- 把现有总项目计划拆成 8 份有稳定 ID 和独立文件的实施计划。
- 使每份计划成为可独立排期、执行、验证和验收的最小管理单元。
- 为每份计划明确范围、非范围、依赖、输入、交付物、执行步骤、测试、失败恢复、验收门禁和证据要求。
- 为每份计划保存独立状态和验收记录，包括验收人、验收时间、精确 commit 和证据。
- 建立 `docs/project-management.md` 作为唯一项目级管理入口，只汇总计划索引、依赖、状态、阻塞和发布就绪度。
- 建立从原 `REQ-001`–`REQ-028`、`AC-001`–`AC-020`、Slice 0–9 到各实施计划的完整追踪。
- 使 IP-01–IP-08 各自形成独立 feature，并分别完成需求确认、技术计划、实现验证、Review、合并与收尾追踪。
- 在继续扩大实现范围前，先完成并确认实施计划拆分及管理规则。

## Required implementation-plan set

Main 必须按以下初始基线建立 8 份独立实施计划。可以在计划内部细化任务，但不得在未形成新确认需求的情况下删除计划、改变其业务结果或把其验收范围静默转移到其他计划。

| Plan ID | 独立实施计划 | 预期可验收结果 | 原需求主映射 | 现有总计划映射 | 硬依赖 |
| --- | --- | --- | --- | --- | --- |
| IP-01 | 工程基础与权威契约 | 工程骨架、共享契约、领域生命周期和存储基础通过约定门禁 | REQ-011、REQ-012、REQ-019 | Slice 0–1 | 无 |
| IP-02 | Idea 登记与进入执行 | AI 可登记、澄清和显式推进 Idea，两类查询读取同一权威状态 | REQ-001–REQ-005 | Slice 2 | IP-01 |
| IP-03 | 项目执行事实与关注事项 | 进展、阻塞、待确认、支持、证据、纠偏和历史可追踪 | REQ-006–REQ-009、REQ-013 | Slice 3 | IP-02 |
| IP-04 | 结论与人类确认 | 结论及完成、停止、移交、重开遵守高影响确认边界 | REQ-010 | Slice 4 | IP-03 |
| IP-05 | 结构化项目汇报 | AI 可提交受约束汇报，Web 可安全渲染并在失败时恢复 | REQ-021–REQ-025 | Slice 5 | IP-01、IP-03 |
| IP-06 | 双角色 Web 体验 | 想法提出者和执行者无需登录即可查看各自重点与同一权威事实 | REQ-014–REQ-018 | Slice 6 | IP-02、IP-03、IP-04、IP-05 |
| IP-07 | AI Skill 与可重复演示闭环 | Codex/Claude 可按 Skill 完成核心旅程，演示可重复执行 | REQ-020、REQ-027 | Slice 7 | IP-02–IP-06 |
| IP-08 | 部署、恢复与发布候选 | v0.1 可部署、可恢复、可演示并形成发布候选证据 | REQ-026 | Slice 8–9 | IP-01、IP-07 |

`REQ-028` 由本次“先形成并确认可独立验收计划体系”的治理工作承接，不把它伪装成运行时实施计划。

## Required document set

项目必须形成以下文档：

```text
docs/project-management.md
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

- `docs/project-management.md` 是唯一项目级状态入口。
- 8 份计划文件各自是对应实施与验收范围的权威计划。
- 详细需求、设计、协议和总计划继续作为链接来源，不在新计划中复制完整正文。
- 不允许再建立另一份并行的项目状态总表。

## Implementation-plan content requirements

每份实施计划必须使用一致结构并至少包含：

1. `PlanId`、标题、版本、状态、目标日期、依赖计划和需求基线。
2. 可独立陈述的业务结果与验收价值。
3. 范围、非范围，以及不会由本计划隐式完成的相邻能力。
4. 前置输入和入口门禁；硬依赖未验收时不得进入执行。
5. 明确的交付物和执行步骤，细化程度足以让 Main 实施，但不得改变已确认需求。
6. 与本计划相关的失败、重试、回滚和数据恢复预期。
7. 测试与检查矩阵，覆盖正常、失败、安全和恢复路径。
8. 独立验收清单，每一项都可观察并可指向证据。
9. 需求、验收条件、现有 Slice、设计资料、代码/提交和检查证据的追踪。
10. 风险、外部输入、阻塞、下一步和变更记录。
11. 验收记录字段：`AcceptanceOwner`、`AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`。

实施计划可以引用公共完成定义，但每份计划必须列出自身特有的验收门禁，不能只写“遵循总计划”。

## Status and independent acceptance model

每份计划的状态只能使用：

| Status | 进入条件 |
| --- | --- |
| `Draft` | 计划内容尚未确认或仍在修订。 |
| `Ready` | 计划内容已获准执行，所有硬依赖和入口门禁已满足。 |
| `In Progress` | 正在执行该计划范围内的工作。 |
| `Blocked` | 无法继续；已记录原因、影响、解除条件、当前动作和复核点。 |
| `In Review` | 实现已固定到精确 commit，计划内检查通过，并已提交独立验收。 |
| `Accepted` | 指定验收方已对精确 commit 和证据明确验收，验收记录完整。 |
| `Deferred` | 经明确决定延期，已记录原因、范围影响和恢复条件。 |

独立验收必须满足：

- 验收对象是单一 `PlanId` 及一个精确的小写 commit SHA；
- 该计划的硬依赖均已 `Accepted`；
- 计划内所有 Must 验收项均通过，失败或未验证项不可隐藏；
- 所需检查和 Review 结果有可复核证据；
- `AcceptedBy`、严格 UTC `AcceptedAt`、`AcceptedCommit` 和证据链接完整；
- 验收 IP-0N 不自动验收任何其他计划，也不等同于批准合并、部署或发布；
- 验收后的范围或实现发生实质变化时，该计划必须重开或产生新版本，原验收记录保留。

每份计划必须一对一进入完整 Engineering Lifecycle：

1. Requirements 为该 Plan ID 形成独立、版本化、经用户明确确认的需求快照和 exact RequirementsHandoff。
2. Main 在独立 feature 分支上形成技术计划，并按 lifecycle 要求提交 Review。
3. 技术计划获批后，Main 实现、验证、记录证据并准备独立 PR。
4. Review 对该计划的精确 head 和证据执行代码审查，并按既定 merge policy 决定是否合并。
5. Main 在合并后完成该计划的状态、验收记录和追踪闭环，再允许依赖计划进入后续状态。

不同 Plan ID 不得共用一个 RequirementsHandoff、feature branch、技术计划审批或验收结论。本次项目管理需求的 handoff 只授权 Main 产出拆分后的计划体系，不替代 IP-01–IP-08 各自后续的需求确认。

## Functional requirements

| ID | Requirement |
| --- | --- |
| PM-REQ-001 | Main 必须把现有总计划拆成 IP-01–IP-08 八份独立实施计划，并按本需求规定的路径保存。 |
| PM-REQ-002 | 每份实施计划必须具有独立范围、硬依赖、入口门禁、交付物、执行步骤、验证方式、验收门禁和验收记录。 |
| PM-REQ-003 | 每份计划必须能够单独进入 `In Review` 并针对一个精确 commit 提交验收，不要求同时验收整个 v0.1。 |
| PM-REQ-004 | 每份计划只能在其所有硬依赖均为 `Accepted` 且入口门禁满足后进入 `Ready` 或后续状态。 |
| PM-REQ-005 | `Accepted` 必须以计划内 Must 验收项全部通过及完整验收记录为依据；代码已写、提交存在或 Review 通过不能单独代替验收。 |
| PM-REQ-006 | 拒绝验收时，该计划必须记录失败项、证据、恢复动作和下一次提交条件，并回到 `In Progress` 或 `Blocked`；其他无依赖计划不被自动回退。 |
| PM-REQ-007 | 计划验收后的实质范围或实现变化必须重开该计划或产生新版本，不得覆盖原 `AcceptedCommit` 和验收记录。 |
| PM-REQ-008 | `docs/project-management.md` 必须作为唯一项目级入口，汇总八份计划的依赖、状态、当前证据、阻塞、下一步、验收结果和 v0.1 发布就绪度。 |
| PM-REQ-009 | 项目管理入口不得复制八份计划的完整步骤或验收正文；每份计划也不得维护其他计划的权威状态。 |
| PM-REQ-010 | `REQ-001`–`REQ-027` 与 Slice 0–9 必须各自映射到且仅映射到一个主要实施计划，允许记录辅助计划；`REQ-028` 单独映射到计划治理基线。 |
| PM-REQ-011 | `AC-001`–`AC-020` 必须映射到一个或多个实施计划，且每份计划至少具有一个独立可观察验收场景。 |
| PM-REQ-012 | 各计划的依赖必须使用 Plan ID 表达并形成无环图；项目管理入口必须明确关键路径。 |
| PM-REQ-013 | 当计划范围、依赖、状态、门禁、证据、阻塞或下一步变化时，对应计划和项目管理入口必须在同一变更集中同步更新。 |
| PM-REQ-014 | 所有初始状态必须根据仓库和 lifecycle 证据设置；不能证明已开始或完成时，默认保持 `Draft`，不得根据目标日期推断。 |
| PM-REQ-015 | 入口和计划文档必须链接到已确认需求、相关设计、总计划、提交和检查证据，不得用摘要改写上游权威事实。 |
| PM-REQ-016 | 发布就绪度必须以八份计划全部 `Accepted` 以及外部部署条件得到验证为基础；任一计划验收不能代表 v0.1 已发布。 |
| PM-REQ-017 | 入口和计划文档不得包含秘密、token、cookie、数据库连接信息、个人配置或真实私密业务数据。 |
| PM-REQ-018 | IP-01–IP-08 必须分别注册为独立 feature，并各自完成独立 RequirementsHandoff、技术计划 Review、实现验证、独立 PR、精确 head Code Review、合并及收尾追踪；不同 Plan ID 不得批量共享 lifecycle authority。 |

## Acceptance criteria

| ID | Requirement IDs | Observable criterion |
| --- | --- | --- |
| PM-AC-001 | PM-REQ-001–002 | Given 拆分工作完成，when 检查规定目录，then 存在 IP-01–IP-08 八份计划，且每份都包含必需章节和独立验收记录字段。 |
| PM-AC-002 | PM-REQ-003、PM-REQ-005 | Given 某份计划实现完成，when 它进入 `In Review` 并提交验收，then 验收对象只包含该 Plan ID、精确 commit、计划内 Must 清单和证据；通过后可单独标记 `Accepted`。 |
| PM-AC-003 | PM-REQ-004、PM-REQ-012 | Given 某份计划存在未验收硬依赖，when 尝试开始或提交验收，then 入口门禁不允许状态进入 `Ready`、`In Progress`、`In Review` 或 `Accepted`。 |
| PM-AC-004 | PM-REQ-006 | Given 单份计划验收失败，when 记录结果，then 失败项、证据和恢复动作可见，该计划回退到正确状态，且无依赖计划保持原状态。 |
| PM-AC-005 | PM-REQ-007 | Given 已验收计划发生实质变化，when 更新计划或实现，then 原验收记录仍可追溯，当前版本不再沿用旧 `AcceptedCommit`。 |
| PM-AC-006 | PM-REQ-008–009 | Given 打开 `docs/project-management.md`，when 查看任一计划，then 能看到总体依赖、状态、阻塞、下一步和验收摘要并跳转到独立计划；详细步骤和验收正文只有一个权威来源。 |
| PM-AC-007 | PM-REQ-010–011 | Given 检查追踪矩阵，when 遍历 `REQ-001`–`REQ-028`、`AC-001`–`AC-020` 和 Slice 0–9，then 没有孤立项或多个主要实施计划归属。 |
| PM-AC-008 | PM-REQ-013–014 | Given 一次工作改变计划状态、依赖、门禁、证据或下一步，when 审查同一变更集，then 独立计划与项目管理入口一致；无法证明的状态保持 `Draft`。 |
| PM-AC-009 | PM-REQ-015 | Given 审阅单份计划，when 检查其范围和验收依据，then 能追踪到上游需求、相关设计、原 Slice、精确提交和检查证据，而不需要相信未引用的状态描述。 |
| PM-AC-010 | PM-REQ-016 | Given 只有部分计划已验收，when 查看发布就绪度，then 系统明确显示剩余计划和外部条件，不能把 v0.1 标记为可发布。 |
| PM-AC-011 | PM-REQ-017 | Given 检查全部入口与计划文档，when 搜索配置和证据内容，then 不包含秘密、个人配置或真实私密数据。 |
| PM-AC-012 | PM-REQ-018 | Given 八份计划已经拆分，when 任一计划准备进入实现或验收，then 能找到只属于该 Plan ID 的确认需求、handoff、feature 分支、技术计划 Review、PR、精确 head Code Review、合并和收尾记录；不存在用本次总 handoff 批量授权多个计划实现的情况。 |

## Non-goals

- 不在 Requirements 阶段编写八份实施计划的技术内容；这些计划由 Main 在需求确认后产出。
- 不在本阶段实现 API、领域模型、Schema、Skill、Web、测试、部署或运行时代码。
- 不改变已确认 v0.1 的产品范围、Must/Non-goal 或 2026-08-06 目标日期。
- 不把八份计划扩展为通用项目管理系统、Issue Tracker、绩效系统或人员排期系统。
- 不要求每个原 Slice 单独成为计划；相邻 Slice 可以在形成一个独立业务/工程结果时归入同一计划。
- 不允许为了“独立验收”而复制共享契约、绕过真实依赖或降低总计划既有门禁。
- 不把单份计划验收解释为合并授权、生产部署授权、发布授权或整个 v0.1 验收。
- 不把当前项目管理 feature 的确认与 handoff 解释为 IP-01–IP-08 的合并需求确认或批量实现授权。

## Failure and recovery expectations

- 如果计划缺少必需章节、验收字段或追踪项，该计划保持 `Draft`，补齐并重新审阅后才能进入 `Ready`。
- 如果依赖图形成环或依赖边界无法判断，受影响计划不得开始；先修订拆分和依赖。
- 如果验收证据缺失、检查失败或 commit 与提交验收的快照不一致，拒绝本次验收并返回可定位的失败项。
- 如果验收后的检查转红、关键证据失效或实现发生实质变化，计划必须重开或形成新版本，不能静默保留 `Accepted`。
- 如果单份计划阻塞，记录原因、影响、解除条件、当前动作和下一次复核点；只有依赖该计划的后继计划被门禁阻止。
- 如果已确认需求变化，受影响计划先标记为待修订；Requirements 形成新确认快照后，Main 才能修改范围和验收标准。
- 如果入口与独立计划状态不一致，以精确提交、检查、Review 和验收记录为事实依据，并在同一变更集中纠正两者。
- 如果外部部署条件缺失，IP-01–IP-07 中可本地验收的工作可继续，但 IP-08 不得被接受为完成。

## Public API and compatibility impact

本需求只定义项目计划的拆分、管理和验收方式，不直接改变运行时 API、数据模型、Skill 协议、Web 行为或兼容性。各独立实施计划中的 API 或兼容性工作仍必须遵守已确认 v0.1 需求和相应设计/Review 门禁。

## Safety, privacy, permissions, and authorization

- 实施计划和项目管理入口只记录适合提交到仓库的范围、状态和证据引用。
- 生产服务器、域名凭据、token、cookie、数据库 URL、个人配置和私密业务样本不得写入文档。
- `Accepted` 只表达指定计划的验收结论，不授予合并、部署或发布权限。
- 用户确认本需求快照授权 Main 产出计划体系，并要求八份计划随后分别走完整生命周期；它不等同于任何计划自身的 RequirementsHandoff、生产操作或最终验收。

## Release impact

- 本 feature 的直接产物是八份可独立验收的实施计划和一份项目管理入口，不单独形成运行时版本。
- 计划体系完成后，各计划必须按依赖顺序分别从 Requirements 确认开始，经过 Main 与 Review 的完整 feature lifecycle。
- v0.1 只有在 IP-01–IP-08 全部 `Accepted`、原需求门禁满足并获得独立发布授权后，才能被视为发布就绪。

## Assumptions

- `docs/feature/v0-1-project-plan/requirements.md` 继续作为 v0.1 产品范围权威基线。
- 当前领域、协议、架构和总实施计划是拆分输入，不因被引用而自动成为实现或验收证据。
- 现有 Slice 0–9 可以合理组合为八份计划，其中 Slice 0–1 和 Slice 8–9 分别形成一个可独立验收单元。
- “每个计划可以单独验收”指每份计划针对自己的精确实现 commit 和证据获得独立结论，而不是八份计划必须同时验收。
- 2026-08-06 仍是 v0.1 可部署、可演示目标日期。
- 项目管理入口是总体状态汇总；独立计划文件是各自范围、执行和验收的唯一详细来源。

## Open questions

无阻塞性开放问题。用户已确认：Main 先产出八份实施计划和单一项目管理入口；IP-01–IP-08 随后分别作为独立 feature 走完整 Engineering Lifecycle。
