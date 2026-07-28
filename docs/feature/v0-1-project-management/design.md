# Technical Design: v0.1 可独立验收实施计划拆分与管理

- Status: Proposed F2 Design
- FeatureId: `v0-1-project-management-6f4b1a2d9c07`
- Branch: `codex/v0-1-project-management`
- Requirements: [requirements.md](./requirements.md)
- Requirements commit: `b4f9a802744431c5ef424787b363c08a24d64d5b`
- Requirements SHA-256: `9ca2a55d914d614c9c3d85772a041cbffdd2318407c99db38b6214ff14e51bdc`
- Current lifecycle stage: `PLAN_DRAFTING`
- Prior review: cycle 1 `FAIL`, message `e9c7509f71bffd28bc0206b18ef503ee860eb9aea1ab1ac8d780076c9c721605`
- Updated: 2026-07-28

## 1. Background

v0.1 已有确认需求、领域模型、结构化汇报协议、技术架构和 Slice 0–9
总实施计划，但尚不能把其中一部分作为独立 feature 执行和验收。项目需要在不改变
既有产品范围的前提下，建立：

1. 一份项目级权威入口，用于查看组合状态、依赖、阻塞和发布就绪度；
2. 八份稳定、独立、可追踪的实施计划；
3. 从每份计划到独立 Engineering Lifecycle authority 的一对一边界；
4. 状态、证据和验收记录的一致性与纠偏规则。

本设计只定义仓库内 Markdown 管理契约。它不实现 v0.1 运行时能力，也不把当前
RequirementsHandoff 解释为 IP-01–IP-08 的批量实现授权。

## 2. Goals

- 建立 `docs/project-management.md` 作为唯一项目级状态入口。
- 建立 `docs/implementation-plans/v0-1/` 下的 IP-01–IP-08 八份独立计划。
- 让每份计划具有稳定 ID、独立范围、依赖、入口门禁、验证和验收记录。
- 保证 `REQ-001`–`REQ-028`、`AC-001`–`AC-020` 和 Slice 0–9 无孤立项。
- 让每个 IP 后续分别获得 RequirementsHandoff、计划 Review、GoalRun、PR、精确
  head Code Review、合并和收尾记录。
- 用 Git 提交作为项目入口与独立计划状态同步更新的原子边界。

## 3. Non-goals

- 不实现 API、数据库、领域、Web、Skill、测试或部署代码。
- 不修改已确认 v0.1 产品范围、技术架构或 2026-08-06 目标日期。
- 不把 Markdown 文档建设成通用 Issue Tracker 或人员排期系统。
- 不在当前 feature 中注册、启动或合并 IP-01–IP-08。
- 不把 `Accepted` 当作合并、部署或发布授权。
- 不复制上游需求、协议和总计划的完整正文。

## 4. Ownership and authority

权威顺序从高到低：

1. 已确认 RequirementsHandoff 与 durable Engineering Lifecycle 状态；
2. Review 的精确 snapshot 结果、Git commit、PR head、required checks 和 merge proof；
3. 对应 IP 独立计划中的范围、门禁、证据和验收记录；
4. `docs/project-management.md` 中的组合摘要。

若低层记录与高层事实冲突，低层记录必须设置 `ProjectionState=Stale`，受影响状态
不得晋级。

| Artifact | Owner | Responsibility | Must not do |
| --- | --- | --- | --- |
| 已确认需求 | Requirements | 定义业务范围和验收意图 | 编写技术实现或自批计划 |
| 独立 IP 计划 | Main | 写设计、实施步骤、检查和证据要求 | 绕过 Requirements 或 Review |
| Review records | Review | 审查精确计划/代码 snapshot | 修改 Main 的实现或替 Main 合并 |
| 项目管理入口 | Main | 汇总权威状态、依赖、阻塞和下一步 | 成为第二份详细计划 |
| 验收记录 | 指定验收方；Main 记录 | 对精确 commit 和证据作结论 | 用口头进度替代证据 |

## 5. Document topology

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

详细来源继续保留在：

- `docs/feature/v0-1-project-plan/requirements.md`
- `docs/feature/v0-1-project-plan/domain-model.md`
- `docs/feature/v0-1-project-plan/structured-report-protocol.md`
- `docs/feature/v0-1-project-plan/technical-architecture.md`
- `docs/feature/v0-1-project-plan/implementation-plan.md`

原总计划是拆分来源，不再承担当前项目状态台账职责。实现本 feature 时在原总计划
顶部增加指向项目管理入口的说明，避免形成并行状态源。

## 6. Dependency model

```mermaid
flowchart LR
    IP01["IP-01 工程基础与权威契约"]
    IP02["IP-02 Idea 登记与进入执行"]
    IP03["IP-03 项目执行事实与关注事项"]
    IP04["IP-04 结论与人类确认"]
    IP05["IP-05 结构化项目汇报"]
    IP06["IP-06 双角色 Web 体验"]
    IP07["IP-07 AI Skill 与演示闭环"]
    IP08["IP-08 部署、恢复与发布候选"]

    IP01 --> IP02
    IP02 --> IP03
    IP03 --> IP04
    IP01 --> IP05
    IP03 --> IP05
    IP02 --> IP06
    IP03 --> IP06
    IP04 --> IP06
    IP05 --> IP06
    IP02 --> IP07
    IP03 --> IP07
    IP04 --> IP07
    IP05 --> IP07
    IP06 --> IP07
    IP01 --> IP08
    IP07 --> IP08
```

关键路径为：

```text
IP-01 -> IP-02 -> IP-03 -> IP-04/IP-05 -> IP-06 -> IP-07 -> IP-08
```

`IP-04` 与 `IP-05` 在 IP-03 被接受后可以并行。所有依赖边均为硬依赖；
后继计划只有在所有硬依赖均为 `Accepted` 时才能进入 `Ready`。

## 7. Markdown data contract

本 feature 没有新的运行时对象、数据库表或公共 API。它定义以下 Markdown
管理对象。

### 7.1 `ProjectPlanSummary`

位于 `docs/project-management.md`，每个 IP 一行。

| Field | Type | Required | Default | Owner | Validation |
| --- | --- | --- | --- | --- | --- |
| `PlanId` | `IP-01`–`IP-08` | yes | none | Main | 唯一且稳定 |
| `Title` | text | yes | none | Main | 与独立计划标题一致 |
| `Version` | positive integer | yes | `1` | Main | 与独立计划一致 |
| `Status` | controlled enum | yes | `Draft` | Main | 与独立计划一致 |
| `ProjectionState` | `Current` or `Stale` | yes | `Current` | Main | 与独立计划一致；不属于业务状态 |
| `Dependencies` | Plan ID list | yes | per graph | Main | 仅已知 ID、无环 |
| `TargetDate` | ISO date/range | yes | source plan | Main | 来自确认总计划 |
| `LifecycleFeatureId` | text or `Unassigned` | yes | `Unassigned` | Requirements/Main | 不得推断 |
| `Evidence` | links or `None` | yes | `None` | Main | 可复核且无秘密 |
| `Blocker` | record link or `None` | yes | `None` | Main | `Blocked` 时必填 |
| `LatestAcceptanceRecordId` | record ID or `None` | yes | `None` | Main | 与独立计划一致 |
| `CurrentAcceptedRecordId` | record ID or `None` | yes | `None` | Main | `Accepted` 时必须指向当前版本记录 |
| `ActiveStalenessRecordId` | record ID or `None` | yes | `None` | Main | `Stale` 时必须指向活动记录 |
| `NextStep` | short text | yes | per plan | Main | 指向有权限的下一动作 |

### 7.2 `ImplementationPlan`

每个 IP 文件包含固定元数据和章节。

| Field | Type | Required | Default | Owner | Validation |
| --- | --- | --- | --- | --- | --- |
| `PlanId` | stable ID | yes | none | Main | 与文件名和索引一致 |
| `Version` | integer | yes | `1` | Main | 实质变化递增 |
| `Status` | controlled enum | yes | `Draft` | Main | 必须有 lifecycle/验收证据 |
| `ProjectionState` | `Current` or `Stale` | yes | `Current` | Main | 与项目入口一致 |
| `TargetDate` | date/range | yes | source plan | Main | 不表示完成状态 |
| `Dependencies` | Plan ID list | yes | per graph | Main | 全部接受前不得 Ready |
| `RequirementsBaseline` | path + commit | yes | confirmed v0.1 | Requirements/Main | 可定位 |
| `LifecycleFeatureId` | text | yes | `Unassigned` | Requirements/Main | 独立 handoff 后填写 |
| `FeatureBranch` | text | yes | `Unassigned` | Main | 独立 feature 分支 |
| `AcceptanceOwner` | text | yes | `Pending assignment` | Requirements | 由独立需求确认 |
| `LatestAcceptanceRecordId` | record ID or `None` | yes | `None` | Main | 指向最后一次验收尝试 |
| `CurrentAcceptedRecordId` | record ID or `None` | yes | `None` | Main | 仅指向当前版本有效的 `Accepted` 记录 |
| `ActiveStalenessRecordId` | record ID or `None` | yes | `None` | Main | `Stale` 时必须指向活动记录 |

固定章节为：

1. Business outcome
2. Scope
3. Non-goals
4. Inputs and entry gate
5. Deliverables
6. Execution plan
7. Failure, retry, rollback and recovery
8. Verification matrix
9. Independent acceptance checklist
10. Traceability
11. Risks, external inputs and blockers
12. Next step
13. Change history
14. Acceptance history

### 7.3 `AcceptanceRecord`

每次验收尝试或对旧验收的补偿声明追加一行，禁止修改、删除或复用 `RecordId`。

| Field | Type | Required | Owner | Validation |
| --- | --- | --- | --- | --- |
| `RecordId` | `AR-<PlanId>-v<Version>-<sequence>` | yes | Main | 全局唯一、只追加 |
| `PlanId` | stable Plan ID | yes | Main | 与文件一致 |
| `PlanVersion` | positive integer | yes | Main | 决定时的精确版本 |
| `SubmittedCommit` | 40-char lowercase SHA | yes | Main | 本次验收对象 |
| `Result` | `Accepted`, `Rejected`, `Superseded` | yes | 指定验收方/Main | 受下述 guard 限制 |
| `AcceptanceOwner` | text | yes | Requirements | 与独立需求确认一致 |
| `Actor` | text | yes | 指定验收方 | Main 不得冒充验收方 |
| `DecidedAt` | strict UTC timestamp | yes | 指定验收方 | 不晚于记录提交时间 |
| `Evidence` | link list | yes | Main | 指向 Review、checks、merge/验收证明 |
| `FailedItems` | ID list or `None` | yes | 指定验收方/Main | `Rejected` 时非空 |
| `RecoveryAction` | text or `None` | yes | Main | `Rejected` 时非空 |
| `RelatedRecordId` | record ID or `None` | yes | Main | `Superseded` 时指向旧 `Accepted` |
| `Reason` | text | yes | Main/验收方 | 不得只写“更新” |

规则：

- `Accepted` 只能在当前 `PlanVersion`、精确 commit、依赖、Must、Review、merge 和验收
  证据完整时追加；随后 `LatestAcceptanceRecordId` 与
  `CurrentAcceptedRecordId` 都指向该记录。
- `Rejected` 记录提交的精确 commit、失败项和恢复动作；只更新
  `LatestAcceptanceRecordId`，`CurrentAcceptedRecordId` 保持 `None`。
- 已接受版本发生实质变化时，先递增 `Version` 或明确重开，再追加
  `Superseded` 记录引用旧 `Accepted`；`CurrentAcceptedRecordId` 置 `None`，
  旧行保持原样。
- `Superseded` 的 `PlanVersion` 与 `SubmittedCommit` 复制被替代的原
  `Accepted` 记录；触发重开的新 commit 只写入 `Evidence`，避免把新实现误写成
  已验收对象。
- 补偿修订只能追加新行；任何历史行的 actor、时间、commit、结果和证据都不可覆盖。
- 项目入口只保存两个 record pointer 和验收摘要，完整历史只在对应 IP 计划。

### 7.4 `BlockerRecord`

| Field | Type | Required | Default | Owner | Validation |
| --- | --- | --- | --- | --- | --- |
| `Reason` | text | yes | none | Main | 具体、可验证 |
| `Impact` | Plan ID/门禁列表 | yes | none | Main | 指明受影响计划和门禁 |
| `ExitCondition` | text | yes | none | Main | 可观察 |
| `CurrentAction` | text | yes | none | Main | 必须有 `ActionOwner` |
| `ActionOwner` | text | yes | none | Main | 有权限执行恢复动作 |
| `ReviewAt` | UTC/event | yes | none | Main | 严格 UTC 或明确外部事件 |

无活动阻塞时不保留空 record，项目入口使用 `None`。历史阻塞通过追加式
`ChangeRecord` 保留。

### 7.5 `ChangeRecord`

| Field | Type | Required | Default | Owner | Validation |
| --- | --- | --- | --- | --- | --- |
| `ChangedAt` | strict UTC | yes | none | Main | 时间合法 |
| `Actor` | text | yes | none | Main | 记录 authority 来源 |
| `Change` | text | yes | none | Main | 描述状态/范围/依赖/证据变化 |
| `Reason` | text | yes | none | Main | 不得只写“更新” |
| `Evidence` | link list | yes | none | Main | commit、Review、check 或 handoff |

`ChangeRecord` 只追加；错误通过新补偿记录纠正，不修改旧行。

### 7.6 `StalenessRecord`

`ProjectionState` 与业务 `Status` 分离。`Stale` 表示 Markdown 投影不可作为状态
晋级依据，但保留最后可知的业务状态。

| Field | Type | Required | Default | Owner | Validation |
| --- | --- | --- | --- | --- | --- |
| `RecordId` | stable ID | yes | none | Main | 唯一、只追加 |
| `DetectedAt` | strict UTC | yes | none | Main | 时间合法 |
| `DetectedBy` | actor/check | yes | none | Main/Review/checker | 可追踪 |
| `Reason` | text | yes | none | Main | 描述冲突 |
| `ConflictingAuthority` | link/message/commit | yes | none | Main | 指向更高权威事实 |
| `AffectedFields` | field list | yes | none | Main | 非空 |
| `RecoveryAction` | text | yes | none | Main | 可执行 |
| `ClearedAt` | strict UTC or `None` | yes | `None` | Main | 清除后填写 |
| `ClearedBy` | actor or `None` | yes | `None` | Main | 清除后填写 |
| `ClearEvidence` | links or `None` | yes | `None` | Main | 清除时必须非空 |

发现入口、独立计划或上游 authority 不一致时，Main（或 checker 触发 Main）必须在
独立计划和项目入口将 `ProjectionState` 置为 `Stale`，追加同一 `RecordId` 的
staleness 记录，将两处 `ActiveStalenessRecordId` 指向它，并停止业务状态晋级。
只有 Main 重新读取更高权威、用补偿提交同步两处投影且 checker 通过后，才能把
`ProjectionState` 恢复为 `Current`、两处 active pointer 置 `None` 并填写清除字段；
历史记录不得删除。

## 8. Status lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Ready: 独立需求与计划获批\n硬依赖 Accepted
    Draft --> Deferred: 明确延期决定
    Ready --> InProgress: GoalRun 激活
    Ready --> Deferred: 明确延期决定
    InProgress --> Blocked: 满足 blocked 规则
    InProgress --> Deferred: 明确延期决定
    Blocked --> InProgress: 解除条件满足并恢复
    Blocked --> Deferred: 明确延期决定
    InProgress --> InReview: 精确 head、检查与 PR 就绪
    InReview --> InProgress: Review 要求修改
    InReview --> Blocked: 验收失败且存在真实阻塞
    InReview --> Deferred: 明确延期决定
    InReview --> Accepted: 合并与指定验收证据完整
    Deferred --> Draft: 需要重做需求或计划
    Deferred --> Ready: 原 authority 仍有效\n依赖满足并明确恢复
    Accepted --> Draft: 实质变化需重开或新版本
```

文档状态与 Engineering Lifecycle 的对应关系：

| Plan status | Minimum lifecycle evidence |
| --- | --- |
| `Draft` | 尚无该 IP 的完整 authority，或计划仍在修订 |
| `Ready` | 独立 RequirementsHandoff + PASS plan review + 依赖 `Accepted` |
| `In Progress` | 对应 GoalRun 为 active |
| `Blocked` | 对应 GoalRun/外部条件满足 durable blocked 记录要求 |
| `In Review` | 实现完成并绑定精确 PR head，等待或进行 Code Review/验收 |
| `Accepted` | 精确实现已合并，Must 证据通过，指定验收记录完整 |
| `Deferred` | 有明确决定、原因、影响与恢复条件 |

`APPROVE`、代码提交存在或目标日期到达，均不能单独产生 `Accepted`。

穷举转换契约：

| Source | Target | Guard | Authority | Required evidence | Failure fallback |
| --- | --- | --- | --- | --- | --- |
| `Draft` | `Ready` | 独立需求确认、PASS plan review、全部依赖 `Accepted`、投影 `Current` | Requirements + Review + Main | handoff、plan result、依赖验收记录 | 保持 `Draft` |
| `Draft` | `Deferred` | 明确延期决定 | 用户/Requirements | 决定、原因、影响、恢复条件 | 保持 `Draft` |
| `Ready` | `In Progress` | 唯一 GoalRun 激活 | Main + platform | GoalRun ID、objective、thread ID | 保持 `Ready` |
| `Ready` | `Deferred` | 明确延期决定 | 用户/Requirements | 同上 | 保持 `Ready` |
| `In Progress` | `Blocked` | 满足 platform blocked 规则或真实外部 impasse | Main/platform | BlockerRecord、Goal 状态 | 保持 `In Progress` |
| `In Progress` | `In Review` | 精确 head、计划内检查和 PR snapshot 完整 | Main | commit、checks、PR URL/head | 保持 `In Progress` |
| `In Progress` | `Deferred` | 明确延期决定并安全停止当前工作 | 用户 + Main | 决定、Goal 收尾/阻塞证据 | `Blocked` 或保持 `In Progress` |
| `Blocked` | `In Progress` | 原 GoalRun 被授权恢复且解除条件满足 | Main/platform | resume 记录、解除证据 | 保持 `Blocked` |
| `Blocked` | `Deferred` | 明确延期决定 | 用户/Requirements | 决定和 BlockerRecord | 保持 `Blocked` |
| `In Review` | `In Progress` | Review/验收拒绝且可立即修复 | Review/验收方 + Main | finding、`Rejected` record、恢复动作 | 保持 `In Review` |
| `In Review` | `Blocked` | Review/验收拒绝且修复受真实 impasse 阻塞 | Review/验收方 + Main/platform | finding、`Rejected` record、BlockerRecord | `In Progress` |
| `In Review` | `Deferred` | 明确延期决定 | 用户/Requirements | 决定、PR/Review 当前状态 | 保持 `In Review` |
| `In Review` | `Accepted` | 精确实现已合并，Must、依赖、Review 和指定验收全部通过 | 外部 merge owner + 验收方 + Main 记录 | merge proof、`Accepted` record、checks | `In Progress` 或 `Blocked` |
| `Deferred` | `Draft` | 需求/计划/authority 需要重做 | Requirements + Main | 恢复决定、版本/范围原因 | 保持 `Deferred` |
| `Deferred` | `Ready` | 同一版本 authority 仍有效，依赖已接受，明确恢复 | 用户/Requirements + Main | 恢复决定、重新验证的 plan/依赖证据 | `Draft` |
| `Accepted` | `Draft` | 实质范围/实现变化；递增版本或明确重开 | Requirements + Main | 新需求/变化证据、`Superseded` record | 保持 `Accepted`，不修改历史 |

任一转换在 `ProjectionState=Stale` 时禁止执行，唯一允许动作是补偿同步并恢复
`ProjectionState=Current`。

投影同步流程：

```mermaid
sequenceDiagram
    participant A as Durable authority
    participant M as Main
    participant P as Independent IP plan
    participant S as Project summary
    participant C as Deterministic checker

    M->>A: Read exact lifecycle/review/Git evidence
    A-->>M: Authoritative snapshot
    M->>P: Update status, records, evidence
    M->>S: Update matching summary in same change
    M->>C: Validate both projections
    alt consistent
        C-->>M: PASS
        M->>P: Keep ProjectionState=Current
        M->>S: Keep ProjectionState=Current
    else mismatch
        C-->>M: FAIL with field diagnostics
        M->>P: Set Stale + append record
        M->>S: Set Stale + reference same record
    end
```

## 9. Update transaction

一次状态更新必须在同一个 Git 变更集中完成：

1. 重新读取 durable lifecycle 和独立计划；
2. 验证请求者对目标状态有权限；
3. 更新独立 IP 计划中的状态、freshness、证据、阻塞、下一步或追加式验收记录；
4. 更新 `docs/project-management.md` 对应摘要；
5. 追加两处需要的变更记录；
6. 运行一致性检查；
7. 提交并推送同一 commit。

如果第 3–6 步任一失败，不提交部分更新。若发现已提交的不一致，两处投影都按
7.6 节标记 `Stale`，受影响计划停止晋级，随后用补偿提交纠正、验证并清除 stale；
业务 `Status` 本身不改名为 `stale`。

## 10. Traceability contract

主归属必须满足：

- `REQ-001`–`REQ-027` 各有且仅有一个主要 IP；
- `REQ-028` 归本项目管理 feature；
- Slice 0–9 各有且仅有一个主要 IP；
- AC-001–AC-020 至少关联一个 IP；
- 每个 IP 至少拥有一个独立可观察验收场景。

计划文件记录自身主要与辅助映射；项目入口保存完整矩阵。辅助映射不能替代或重复
主要归属。

## 11. Validation and proof

实现阶段使用只读、确定性检查：

- 文件集与稳定路径存在；
- 八个 `PlanId`、文件名和索引一一对应；
- 所有必需元数据和章节存在；
- 状态与 `ProjectionState` 分别只使用各自受控枚举；
- 依赖 ID 有效且图无环；
- 项目入口与独立计划的版本、状态、依赖一致；
- REQ、AC、Slice 追踪满足覆盖与唯一性；
- 相对 Markdown 链接解析到仓库内文件；
- `Accepted` 必须指向当前版本的追加式 `AcceptanceRecord`，历史记录只追加；
- staleness 置位、清除和历史记录满足 7.6 节；
- 文档不包含密钥值、个人配置或真实私密数据；
- `git diff --check` 通过。

验证可以使用 `/private/tmp` 中的临时脚本，不把一次性证明工具或输出提交到仓库。

## 12. Failure and recovery

| Failure | Required response |
| --- | --- |
| 缺少文件/章节/映射 | 保持 `Draft`，补齐后重新审查 |
| 依赖环或未知 ID | 阻止受影响计划开始，修订依赖 |
| 入口与计划状态/freshness 不同 | 两处标记 `Stale`，停止晋级，同提交纠正并留存清除证据 |
| 证据缺失或 head 不匹配 | 拒绝 `In Review`/`Accepted` |
| Review/验收要求修改 | 追加 `Rejected` record；可修复则回 `In Progress`，真实 impasse 则进入 `Blocked` |
| 验收后实质变化 | 递增版本或重开，追加 `Superseded` record，旧 `Accepted` 行保持不变 |
| 延期后恢复 | authority 需重做则回 `Draft`；仍有效且依赖满足才可回 `Ready` |
| 外部部署条件缺失 | IP-08 保持 `Blocked`/`Draft`，不影响无依赖本地工作 |

## 13. Safety, privacy, and authorization

- 文档只能存放公开可提交的管理元数据与证据引用。
- 不记录 token、cookie、数据库 URL、服务器凭据、个人配置或真实私密业务样本。
- 状态更新不扩大 Main、Requirements、Review 或用户的既有权限。
- 当前 handoff 只授权创建计划体系；IP-01–IP-08 必须分别取得独立 authority。
- Main 不自批计划、不自审代码、不自记录外部合并证明。

## 14. Compatibility, rollout, and rollback

这是新增的仓库文档契约，不改变运行时兼容性。

Rollout：

1. 计划 Review 通过后创建九份目标文档；
2. 所有 IP 初始状态为 `Draft`；
3. 为原总计划增加“历史来源/非状态台账”说明；
4. 验证后提交、推送并准备独立 PR；
5. 合并后，后续 IP 从 IP-01 开始分别进入 Requirements。

Rollback：

- 合并前可回退本 feature 的文档提交，不影响运行时；
- 合并后若入口契约有问题，使用补偿提交修正，不静默删除历史；
- 已产生的独立 IP authority、Review 或验收记录不可被管理入口回退覆盖。

## 15. Observability

项目管理文档本身就是人可读投影；权威证明来自：

- RequirementsHandoff message ID 与 requirements commit；
- plan/code review message ID 与 immutable report；
- GoalRun identity；
- Git commit、PR URL/head、required checks、merge SHA；
- 指定验收方、UTC 时间和验收证据；
- 外部部署证明与发布授权。

不在仓库保存原始 token、完整私密日志或临时签名 URL。

## 16. Open decisions

无阻塞性开放决定。各 IP 的实现级选择仍需在其独立 RequirementsHandoff 和技术计划
中确认；本设计不预先批准这些选择。
