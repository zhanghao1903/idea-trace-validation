# Implementation Plan: v0.1 可独立验收实施计划拆分与管理

- Feature directory: `docs/feature/v0-1-project-management/`
- FeatureId: `v0-1-project-management-6f4b1a2d9c07`
- Branch: `codex/v0-1-project-management`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F3 / `PLAN_CHANGES_REQUESTED`
- Prior review: cycle 3 `FAIL`, message `9a7ad93b44ac5c1d9009ddbe4e3b2578ca84520a7bf1d5928cf66d2d5476ca99`
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
5. 将 `Status` 设为 `Draft`、`ProjectionState` 设为 `Current`，将 lifecycle 与
   分支设为 `Unassigned`。
6. 初始化 `LatestAcceptanceRecordId`、`CurrentAcceptedRecordId`、
   `ActiveStalenessRecordId` 为 `None`，`AcceptanceHistory` 与
   `StalenessHistory` 为空表；不创建虚假记录。
7. 写入完整状态转换表、staleness 规则、追加式验收记录和恢复规则；验收记录必须
   显式包含 `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、
   `AcceptanceEvidence`，并按 `Accepted`、`Rejected`、`Superseded`
   分别约束 decision authority 与 Main recorder。
8. 说明每份计划需要独立 RequirementsHandoff 和完整 lifecycle。

门禁：

- 文件名、PlanId 和标题一一对应；
- 每份计划可单独理解和验收；
- 不复制上游完整正文；
- 不声称任何运行时实现已经完成；
- 不把当前 management handoff 写成 IP authority。
- 验收历史只追加，当前验收指针与 plan version 一致。
- Code Review result 只通过 immutable review evidence 与 `ChangeRecord` 记录，
  不创建或冒充 `Rejected` AcceptanceRecord。

Rollback：

- 合并前删除本 Slice 新增文件即可恢复；不影响现有产品文档或运行时。

### PM-S2 — 建立单一项目管理入口

文件：

```text
docs/project-management.md
```

工作：

1. 写入 v0.1 范围基线、目标日期和权威来源。
2. 汇总八份计划的 ID、版本、状态、freshness、依赖、目标日期、验收 record
   pointer、证据、阻塞和下一步。
3. 写入 Mermaid 依赖图和关键路径。
4. 写入受控状态定义、状态晋级规则和 authority 映射。
5. 写入完整 REQ/AC/Slice 追踪矩阵。
6. 写入发布就绪摘要，分离仓库内门禁与外部部署条件。
7. 写入同步更新、独立 `ProjectionState`、staleness 历史、纠偏和变更规则。

门禁：

- 入口只汇总，不复制八份计划的详细步骤；
- 所有摘要字段与独立计划一致；
- IP-01–IP-08 初始均为 `Draft`；
- IP-01–IP-08 初始 `ProjectionState` 均为 `Current`，验收历史为空；
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
None（验证只读取最终提交；运行证据保存在 PR 描述/任务证据，不回写被验证文档）
```

工作：

1. 完成 PM-S1–PM-S3，检查 diff 只包含批准范围，并把全部目标文档提交为最终
   content commit。
2. 确认工作树 clean，以该 commit 的 40 字符 SHA 为 `CheckedCommit`，按第 7 节
   checker contract 生成 `/private/tmp/validate-v0-1-project-plans.mjs` 并运行
   全部自动检查。
3. 将 checker 输出、digest 与时间保留在 `/private/tmp` 和本次任务证据中；不得把
   run-specific `CheckedCommit` 或 digest 回写到被检查的 tracked 文档。
4. 推送精确 content commit，创建独立 PR；若 PR 创建或任何修订改变 head，必须
   对新 head 重新运行完整 checker。
5. 在 PR 描述的固定 `VerificationEnvelope` 区和当前任务证据中记录第 7 节
   envelope；调用 lifecycle 时只使用受支持的 `CodeReviewRequest` 字段：
   `pullRequest`、`reviewRecordBranch`、`mergePolicy` 和可选
   `previousResultMessageId`，不得添加自定义 envelope 字段。
6. 让 `CodeReviewRequest.pullRequest.headSha` 等于 `CheckedCommit`；要求 Review
   从 PR 描述读取 envelope，核对 live PR head、request head、checked commit
   与 digest，并把核验结果写入 immutable code-review report/result。

门禁：

- 所有自动检查通过；
- 无秘密、临时文件、生成物或无关改动；
- 项目入口与八份计划位于同一精确 head；
- `VerificationEnvelope.CheckedCommit`、live PR head 与
  `CodeReviewRequest.pullRequest.headSha` 三者相等，证据 digest 可复核；
- `CodeReviewRequest` 通过当前 exact-key schema 校验且不含自定义字段；
- Review 的 immutable report 必须记录 envelope/head/digest 核验结论；
- checker 通过后 tracked 文件无变化；任何变化都使旧证据失效并要求重跑；
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
9. 验证所有 IP 初始状态为 `Draft`、`ProjectionState=Current`、验收历史为空，
   feature/branch 未分配。
10. 验证状态转换表包含所有确认转换，`Stale` 没有混入业务 `Status`。
11. 验证 AcceptanceRecord ID 唯一、只追加、current pointer 与当前版本一致；
    验证四个确认字段及三类 result 的 authority/recorder/空值规则。
12. 验证 StalenessRecord 的置位/清除字段与两处投影一致。
13. 验证 Code Review rejection 路径只引用 immutable review result 和
    `ChangeRecord`，不创建 `Rejected` AcceptanceRecord。
14. 搜索可能的秘密赋值、私密 URL、生成物和临时文件。

### Deterministic checker contract

实现者在 `/private/tmp/validate-v0-1-project-plans.mjs` 创建一次性 checker；脚本和
原始输出不提交。命令固定为：

```text
node /private/tmp/validate-v0-1-project-plans.mjs
  --repo <absolute-repository-root>
  --checked-commit <40-char-lowercase-sha>
  --output /private/tmp/v0-1-project-plan-check.json
```

输入契约：

- `--repo` 必须是当前 Git 根目录；
- `--checked-commit` 必须等于 `git rev-parse HEAD`；
- 不携带 lifecycle feature/evidence/acceptance/supersession history 的初始
  `Draft` 投影只读取第 3 节列出的目标文档、确认需求和五份上游来源；
- 发现任何非 `Draft` 投影，或任何已携带上述 authority/history 的 reopened
  `Draft` 时，checker 还必须自动定位与当前 Git common-dir 和 repository key
  同时匹配的 Codex canonical lifecycle config schema 1 / state schema 2，并通过
  `gh api` 读取该投影引用的 live GitHub authority；读取缺失或冲突即失败；
- canonical Codex root 必须复用 workflowctl 语义：环境中存在 `CODEX_HOME` 时
  使用其展开、规范化后的目录，否则使用当前用户 home 下的 `.codex`。不得固定到
  开发者 home；默认 root 和隔离 root 必须由未修改的生产 checker 得到相同结论；
- 生产命令只接受 `--repo`、`--checked-commit`、`--output`，不得接受 lifecycle
  root/state/config 覆盖；fixture authority 只能由 negative harness 从同一源码生成
  独立 test build，并在构建时固定单一 state 路径，不能由生产 CLI 调用者提供；
- test build 在 `realpath` 前逐段 `lstat` 固定的 state/config 原始路径，拒绝任一
  符号链接、非普通文件、多硬链接 inode、repository/tracked-input inode 别名和
  与 fixture Git common-dir 不一致的配置；
- 元数据从文档开头 `- Key: Value` 读取；
- 追踪数据从带有
  `<!-- PRIMARY-TRACE-START -->` / `<!-- PRIMARY-TRACE-END -->` 标记的表读取；
- 依赖来自 `Dependencies` 元数据，`None` 表示空集；
- 普通 Markdown 链接只验证相对仓库路径；只有受 authority 驱动的 non-Draft /
  reopened Draft resolver 请求固定 `zhanghao1903/idea-trace-validation` 的
  GitHub API。

确定性算法：

1. 校验精确目标文件集和八个 PlanId/文件名映射；
2. 校验固定元数据、十四个章节、受控 `Status` 和 `ProjectionState`；
3. 用 Kahn 算法验证依赖 ID 与 DAG，并与项目入口逐字段比较；
4. 从 primary trace 表统计 REQ-001–027、Slice 0–9 各恰好一次，REQ-028
   只归 management feature；
5. 统计 AC-001–020 至少一次且每个 IP 至少一个；
6. 从一个可穷举 registry 同时派生七种状态、十六条转换、source-role 组合、
   authority 类型、prerequisite 和每条边精确 source/target durable-stage 集合；
   `Draft` 覆盖真实 workflowctl pre-plan stages，`Draft→Ready` 从
   `PLAN_REVIEW_PENDING` 进入 approved/queued stage；校验状态转换表所需边集合，
   且 `Stale` 不属于业务状态；逐边对齐批准设计，特别是
   `In Progress→Deferred=user+main`、`Deferred→Draft=requirements+main`，
   `In Review→Accepted=external-merge-owner+acceptance-owner+main`；
7. 校验 AcceptanceRecord ID/版本/pointer 规则，要求文档 schema 出现
   `AcceptedBy`、`AcceptedAt`、`AcceptedCommit`、`AcceptanceEvidence`；
   `Accepted` 的三个 `Accepted*` 字段非空且与 decision/commit 相等，
   `Rejected`/`Superseded` 的三个字段为 `None`，并校验各自 authority 与
   recorder；Code Review rejection 路径不得引用 `Rejected` AcceptanceRecord；
8. 对每个受 authority 驱动的 non-Draft 或 reopened Draft 投影解析 canonical
   lifecycle config schema 1 / state schema 2、message/payload digest、role
   routing、feature stage 与 GoalRun；只接受 workflowctl 支持的五类 routed
   message，未知类型 fail closed；`Deferred` 保留延期前的合法 durable stage，
   pre-plan `Draft→Deferred` 不伪造 PASS plan。除 schema 外还必须校验完整
   workflowctl state/config 不变量：精确 key 集和 UTC 时间、feature artifact/
   stage 门禁、plan/PR/code-result presence、GoalRun shape/history、唯一
   activeGoal、developmentQueue 与 dispatch status/timestamp/payload ledger；
9. defer/reopen/recovery 统一解析 GitHub OWNER 的未编辑结构化决定，不使用虚构的
   lifecycle message。`authorityRole=requirements` 必须绑定同一 feature 的 durable
   RequirementsHandoff，`authorityRole=user` 不得伪造 requirements message；
   `Deferred→Ready` 必须引用紧邻的 immutable defer decision。`Accepted→Draft`
   必须升高计划版本、接受新 feature 的 RequirementsHandoff，并把当前 bundle、
   最新 Superseded record、旧 feature 和 related Accepted record 连续绑定；
   首次重开的 submitted commit、actor、decision/recorded time、reason、
   previous acceptance evidence、new RequirementsHandoff、status decision 与
   transition message lineage 必须不可变。后续 Draft 不得用第二条 Superseded
   row 和同步的新 authority/ChangeRecord 替换它，除非未来增加明确支持的
   compensating transition；
10. 对 In Review/Accepted 解析 live PR/base/head/files、branch protection 的完整
   required-check 集合及对应 check/status result；PR files、check runs、combined
   statuses、reviews 和 merge-commit files 必须确定性分页至完成，非末页必须恰好
   100 项，拒绝重复 identity、不一致 total/count 和不可能的页边界，并把每页
   response digest 纳入 authority snapshot；Accepted 只接受 durable
   `APPROVE`/`READY` 加独立 `APPROVE`/`MERGED`，再核对 live merge commit/method
   与 AcceptanceOwner 的 `APPROVED` GitHub review；实现文件集取 PASS plan
   commit 到实现 head 的完整 Git range diff，并与全部 live PR files 完全相等；
11. 校验 StalenessRecord 成对投影；Evidence 变化时要求 plan/portfolio 同步追加
    ChangeRecord，不能覆盖历史或只改两个 metadata 单元格；
12. 解析相对链接并验证目标存在；
13. 按 CommonMark fence marker 与 opening delimiter length 解析 rendered
    blocks；较短的 closing fence 不得关闭较长 opening fence；
14. 在分类前规范化 JSON Unicode 转义，并从 JSON 对象及保守缩进/点分隔文本解析
    层级路径；扫描任意 public/vendor prefix 深度的 password、secret、token、
    cookie、database URL、API key、AWS access-key ID/secret-access-key 等赋值。
    同时递归解析 flow-style object/array，并把 `apiKeys`、`tokens`、`secrets`、
    `credentials` 等复数 container 与单数形式统一分类。敏感路径的标量、数组、
    对象和跨行结构都 fail closed，只输出规范化字段路径，禁止把值写入
    diagnostics；
15. 按 check ID 排序输出结果。输出同时固定 canonical lifecycle/GitHub response
    的组合 digest；同一 commit 与同一 authority snapshot 产生相同 JSON。

输出契约：

```json
{
  "schemaVersion": 1,
  "contractVersion": "v0-1-project-plans/1",
  "checkedCommit": "<sha>",
  "authoritySnapshotDigest": "None",
  "result": "PASS",
  "checks": [
    {"id": "FILES", "result": "PASS", "diagnostics": []}
  ]
}
```

- check ID 固定为：
  `FILES`、`METADATA`、`SECTIONS`、`DEPENDENCIES`、`SUMMARY_PARITY`、
  `PRIMARY_TRACE`、`AC_COVERAGE`、`TRANSITIONS`、`ACCEPTANCE_HISTORY`、
  `REVIEW_AUTHORITY`、`STALENESS`、`LINKS`、`SECRETS`；
- `checks` 按上述顺序输出，`diagnostics` 按文件路径、行号、消息排序；
- 全部通过时退出码 `0`；验证失败时退出码 `1`；参数/解析器内部错误时退出码 `2`；
- 即使失败也写出 JSON，`result` 为 `FAIL` 或 `ERROR`；
- JSON 不包含时间、绝对路径或 authority 原文；`authoritySnapshotDigest` 在
  初始且无 authority/history 的 `Draft`-only snapshot 为 `None`，否则是
  canonical lifecycle/GitHub observations 的组合 SHA-256。因此相同 commit 与
  相同 authority snapshot 的证据可复现；
- repository-authored bundle 只能作为 projection cache。不存在真实 durable
  message、live PR/check/merge/review，或 GitHub/canonical state 不可读时，非
  non-Draft 或带 authority/history 的 reopened Draft snapshot 不得输出 `PASS`。

最终运行证据不写回仓库，而是以以下 `VerificationEnvelope` 固定格式写入 PR
描述的 `## VerificationEnvelope` 区和当前任务证据：

```text
- CheckerContract: v0-1-project-plans/1
- CheckedCommit: <sha>
- Command: node /private/tmp/validate-v0-1-project-plans.mjs ...
- Result: PASS
- EvidenceSha256: <sha256 of canonical JSON output>
- AuthoritySnapshotDigest: <output authoritySnapshotDigest>
- ExecutedAt: <strict UTC; not part of checker JSON>
- DeferredChecks: <list or None>
```

`CodeReviewRequest` 不复制 envelope，只通过现有
`pullRequest.headSha` 字段绑定同一精确提交。Review 必须从 PR 描述读取 envelope，
验证 `CheckedCommit` 等于 request head 与 live PR head、重新计算或核对
`EvidenceSha256`，并把结果写入 immutable code-review report/result。

checker 运行后不得修改 tracked 文件；若修改、追加 proof commit 或 PR 修订产生
新 head，旧 envelope 立即失效，必须对新 head 重新运行、替换 PR 描述中的 envelope，
再生成或更新 lifecycle request。这样 checker 直接绑定最终 head，不产生“文档包含
自身 commit/digest”的循环依赖，也不扩展 lifecycle schema。

negative harness 必须保留全部既有回归，并额外证明：

- production-shaped 临时 checkout 不能注入 lifecycle state，state/config 的
  direct、symlink、hardlink 和 tracked-inode alias 路径均按预期 fail closed；
- 隔离 `CODEX_HOME` 调用安装中的真实 `workflowctl.py` 完成 Init、三角色
  bootstrap、RequirementsHandoff、plan review、Goal block/resume/complete、
  code-review changes/ready/merged 与 versioned reopen；每条正向边使用这些真实
  operation 产生的状态/dispatch/Goal history，并在运行 checker 前再次通过
  workflowctl `status` 完整校验；schema mismatch 与 unsupported dispatch
  message FAIL；
- 未修改的生产 checker 在默认 `HOME/.codex` 与隔离 `CODEX_HOME` 中都能解析
  workflowctl-valid Ready fixture，并产生相同 authority snapshot；
- 结构化数组、对象、跨行、flow-style object、复数 `apiKeys` container、嵌套
  `api.key` / `database.url` 和 JSON Unicode escaped key 被拒绝且诊断不包含值；
- 七种状态和十六条边均有端到端 PASS，批准设计中的 user/Requirements route
  都被覆盖；wrong-role、role swap、wrong-edge、wrong source/target stage、
  Stale 与 missing immutable recovery 均有端到端 FAIL；
- reopened Draft unchanged authority PASS；删除、不可达、错绑 Evidence 以及
  Evidence 变化却缺少同步 ChangeRecord 均 FAIL；追加第二条 Superseded row、
  替换决定/Evidence 并同步两处 ChangeRecord 的攻击仍必须 FAIL；
- 100 项 required checks、101 项 PR/merge files、101 条 reviews（指定验收证据
  位于第二页）均 PASS；不一致总数 FAIL；完整多页 authority digest 双跑
  byte-stable。

另外精确运行：

```text
git diff --check
git status --short
```

任何 checker 非零退出或 worktree 非 clean 都阻止生成 envelope 和进入 Code Review。

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

- F4 文档实现、入口与 Changelog 变更为最终 scoped content commit；
- F5 不创建 tracked proof commit；checker 绑定 F4，envelope 外置到 PR 描述和任务
  证据，lifecycle request 只绑定同一 head；
- F6 如需文档或 PR-head 修订则创建新 scoped commit，并对新 head 重跑 checker；
- 每个完成阶段均推送，不 amend 已获 authority 的 snapshot。

## 11. Risks

| Risk | Trigger | Response |
| --- | --- | --- |
| 八份计划只是复制总计划 | 大段重复文件/测试清单 | 保留链接，只写独立范围和特有门禁 |
| `Draft` 被误读为已授权 | 缺少 lifecycle 字段 | 明确 `Unassigned` 与独立 handoff 规则 |
| 状态入口漂移 | 入口与计划不一致 | 两处 `ProjectionState=Stale`、追加记录、同提交纠正并验证清除 |
| 验收历史被覆盖 | 升版时修改旧记录 | 只追加 AcceptanceRecord，以 current pointer 表示当前有效记录 |
| 依赖过度串行 | 不必要硬依赖 | 只保留确认图；IP-04/IP-05 可并行 |
| AC/REQ 映射遗漏 | 覆盖检查失败 | 保持 Draft，修正后再审查 |
| 外部部署被提前标记完成 | IP-08 无外部证据 | 分离仓库和外部门禁 |
| 截止日驱动虚假状态 | 根据日期推断进度 | 状态仅依赖 authority 与证据 |

## 12. Open decisions

无阻塞性开放决定。每个 IP 的实现级技术决策由其独立 RequirementsHandoff 和计划
Review 决定。
