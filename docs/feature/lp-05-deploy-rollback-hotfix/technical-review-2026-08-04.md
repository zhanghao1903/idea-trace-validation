# Technical Plan Review: LP-05 production deployment rollback hotfix (Cycle 1)

- Review date: 2026-08-04
- Reviewed artifact(s):
  - `docs/feature/lp-05-deploy-rollback-hotfix/requirements.md`
  - `docs/feature/lp-05-deploy-rollback-hotfix/design.md`
  - `docs/feature/lp-05-deploy-rollback-hotfix/implementation-plan.md`
- Reviewed plan commit: `dd37736c439e76f5e0da63b55b91c6ca5ee53e25`
- Reviewed composite SHA-256: `a148a8e61754438b230e69ca3c1d44bd5ef31b1eab7208cb5d9d01eaa0c68b6c`
- Review request: `90b48a2bc6a848a13693a1e1fdb230974b1ce39f858ec4c365116ed2c8300d0f`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 数据库 principal 修复、严格 application rollback 分离、历史与发布授权边界以及真实 Docker 验证方向均清楚；但承担自动删除授权的 production/restore lifecycle 与 cleanup records 尚未形成完整 closed contracts，现有 restore cleanup 也不能证明 network 和 attempt/target/candidate ownership。生产清理继续使用 project-wide Compose down，检查与删除之间没有 identity-safe fencing，不能保证 AC 8 所要求的外来资源不被删除。

## Handoff Judgment

该 exact snapshot 尚不能直接交给开发者实现。身份读取缺陷的改法足够明确：两个 production identity
reader 都必须从已验证配置取得 `POSTGRES_USER`/`POSTGRES_DB`，以离散参数传给 `psql`，并通过没有
`postgres` role 的 PostgreSQL 17.10 真实回归证明无 fallback。application rollback 继续保持七字段 closed
shape、cleanup 使用独立 authority、旧 attempt 与旧 proposal 不可变、feature 不构成生产部署授权，这些
边界也都正确。

阻断点集中在破坏性 cleanup authority。Design 把新 `ProductionLifecycleV1` 作为删除前必须存在的安全
事实，却没有定义它的文件路径、完整字段、状态相关字段、摘要与 attempt binding；
`RollbackCleanupEvidenceV1.production`、`cleanupReference` 和 terminal transition digest 也只给出摘要，
没有足以实现 strict parser/verifier 的 closed union 与 canonical envelope。开发者必须自行决定安全记录的
关键 schema，违反 mandatory data-structure/lifecycle handoff 标准。

此外，设计把 existing restore lifecycle 当作 restore cleanup 的 detail authority，但基线实现只枚举和证明
restore containers/volumes，并且 live resource ownership 只检查 Compose project；它不枚举 network，也不
验证 attempt/target/candidate labels。计划 slices 只给 production resources 增加三类 authority labels，因而
无法满足 Requirements AC 4/6/8/11 对 production 与 restore container/network/volume 的 exact-owned、
zero-resource 和真实负向证明。production cleanup 又在一次快照检查后执行
`docker compose down --volumes --remove-orphans`；controller lock 只能阻止本 controller 的 forward actor，
不能使 Docker project inventory 与 broad deletion 成为原子操作。一个检查后出现的同 project foreign/orphan
resource 仍可能落入命令作用域。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 给出真实失败 attempt、两个独立缺陷、15 项 AC、Goals、Non-goals、历史和授权边界。 | 无。 |
| Data structure clarity | Fail | Database identity input 和 top-level `RollbackCleanupEvidenceV1` 有局部字段表。 | TPR-001：`ProductionLifecycleV1`、production result unions、observations、cleanup reference 和 aggregate digest envelope 不完整；TPR-002：existing restore authority 不含 network/三类 ownership proof。 |
| New/changed fields highlighted | Fail | 三个 production authority labels 的值源和 equality rule 已列出。 | TPR-001：新 lifecycle/cleanup nested fields 缺 type、required/absence/default、owner、validation、state invariant、compatibility/migration；Compose env key 与 quiescence policy 也未固定。 |
| Data flow clarity | Fail | forward failure → disable ingress → row recount → ownership inspect → cleanup → terminal state 的主 sequence 清楚。 | TPR-002/003：restore exact-owned cleanup flow 缺失；project inventory 与 destructive command 之间的新增/替换资源如何 fail closed 未定义。 |
| Core object lifecycle | Fail | `CREATING → READY → QUIESCING → CLEANED|CLEANUP_FAILED` 状态图存在。 | TPR-001：production lifecycle 的创建路径、closed persistence schema、合法重放/冲突、state-specific content 与 cleanup reference 生命周期未定义；TPR-002：restore lifecycle 未扩展到本次 AC 的 network/ownership 状态。 |
| Flow diagram | Fail | 有 sequence 和 lifecycle state diagrams。 | 图把 restore cleanup 聚合与 exact resource authority 省略，并把 inspect 与 broad `compose down` 表达为无竞态的连续步骤，未覆盖破坏性边界。 |
| Developer handoff readiness | Fail | S1-S6、模块边界、测试命令、PR/merge/release 边界清楚。 | 开发者仍需发明 cleanup authority schemas、restore ownership/network proof 和 identity-safe destructive algorithm。 |

## Qualified Areas

- 请求中三份文件的 SHA-256 与 exact commit 内容逐一一致；远端 feature branch 在评审时精确指向
  `dd37736c439e76f5e0da63b55b91c6ca5ee53e25`，review-record branch 从该 snapshot 隔离创建。
- 权威基线 `99734e8e6c456e0366d28ce7d9a731b3544f0a56` 是计划提交祖先；相对基线只新增三份计划文档，
  `git diff --check` 通过。
- 身份输入来源、`--username`/`--dbname` 离散参数、ambient `PGUSER` 不可信、错误用户不 fallback、
  不创建兼容 `postgres` role 的约束完整。
- 三类 production authority labels 的 owner/value equality 清楚；fresh-only、无 previous release、零应用
  rows 和 live inspection 均被列为删除前置条件。
- application rollback 与 cleanup authority 分离且继续拒绝 `restoreCleanup` extra key 的方向正确；
  `NOT_APPLICABLE + cleanup PASS → ROLLED_BACK` 的目标语义清楚。
- 两幅 Mermaid 图、失败矩阵、idempotency、历史不可变、secret exclusion、无生产操作和旧 proposal 退役
  规则覆盖充分。
- unit/contract/real-Docker/negative/full-repository gates 分层合理，真实 PostgreSQL 17.10 和真实资源清理
  不能由 mocks 替代。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Blocker | 新 production lifecycle、cleanup result 与 transition binding 没有完整 closed contracts | Design §3/§5/§7 将 production lifecycle 作为 pre-mutation/delete authority，但只给状态图，没有 path/field matrix。§6.1 只定义 cleanup 顶层字段和 production observation 摘要；`cleanupReference` shape、`observedBefore/After` nested types、PASS/FAIL/NOT_APPLICABLE unions、quiescence config、canonical pair envelope 均未定义。 | strict parser、replay、state transition 和 terminal verifier 的 required/null/default、canonical bytes、cross-record equality 会由实现者临场决定；无效或冲突 authority 可能被接受，也可能产生彼此不兼容的证据。Mandatory data structure 与 core lifecycle criteria 缺失。 | 为 `ProductionLifecycleV1`、`RollbackCleanupEvidenceV1.production` 的每个 variant、resource observations、`CleanupReferenceV1` 和 terminal digest envelope 给出 closed field matrices：path、type、required/absence/default、owner/source、bounds、canonicalization/digest、attempt/envelope/target/candidate/project equality、state invariants、atomic persistence、replay/conflict/retention、compatibility。固定 label env keys 和 quiescence timeout/sample policy。 | yes |
| TPR-002 | Blocker | restore cleanup 没有满足 exact ownership 与 network-zero 验收 | Requirements AC 4/6/8/11 要求 production 与 restore container/network/volume 的 attempt-bound authority、zero proof 和真实 negatives。Design §6.1 仅以 `restoreLifecycleSha256` 引用 existing detail authority，S2/S4 只改变 production labels/cleanup。基线 `host-active-operations.ts` 的 restore cleanup 只枚举 `containerIds`/`volumeNames`，只检查 `com.docker.compose.project`，不枚举 network，也不校验 attempt/target/candidate labels。 | 同 project 的其他-attempt/foreign restore resource 可能被当作 owned 删除；即使 network 残留，现有 authority 也可能宣称 cleanup PASS。计划无法客观满足 confirmed AC，属于破坏性安全缺口。 | 将 restore cleanup 纳入本 hotfix 的 exact authority chain：为 restore containers/networks/volumes 定义并验证 attempt/target/candidate/project labels，扩展 lifecycle/cleanup evidence 的 pre/post network observations 和 zero proof；所有不完整/foreign/mixed bindings 必须在删除前失败。加入真实 Docker 的 restore network、same-project foreign/orphan、missing-label 与 post-cleanup reappearance negatives。 | yes |
| TPR-003 | Major | production project-wide Compose down 与 pre-inspection 之间没有 identity-safe fence | Design §6.2 在一次 complete-set 检查后运行 `docker compose down --volumes --remove-orphans`。§8 的 exclusive attempt lock/join 只约束 controller forward actors；Implementation risk table 只用 post-cleanup quiescence 缓解 late actor。 | 检查后、命令解析/执行前新出现或被替换的 exact-project foreign/orphan resource可能进入 broad command scope；post-check 只能发现结果，不能撤销误删，与 AC 8“外来资源不会被删除”冲突。 | 将删除目标绑定到已持久化且再次验证的 exact resource identities，或定义能证明 command 不能触达任何未检查 identity 的 fencing mechanism；新增在 pre-inspection 后注入 same-project foreign/orphan/replacement resource 的故障测试，并证明其保持不变且 cleanup FAIL。不得以事后 zero check 作为误删预防。 | yes |

## Data Structure Review

| Object / schema | Result | Evidence / gap |
| --- | --- | --- |
| Production identity input | Pass | `target`、`databaseUser`、`databaseName`、optional runner 的来源、用途和 no-fallback 规则清楚。 |
| Compose production authority labels | Partial pass | 三个 label/value equality 清楚；缺实际 env key/closed adapter contract、network/service/volume static-render proof 细节。 |
| `ProductionLifecycleV1` | Fail | 只有状态名称与“CREATING before mutation”；无 record path、字段、digest、binding、state invariants 或 replay contract。 |
| `RollbackCleanupEvidenceV1` | Fail | 顶层字段较清楚；`production` variants、observations、cleanup reference、aggregate canonical digest 和 policy fields 未 closed。 |
| Existing `RestoreLifecycleV1` | Fail for new AC | baseline authority 只有 containers/volumes 和 project equality，不满足 network 与 attempt/target/candidate live ownership proof。 |
| `DeploymentAttemptV1.rollback` | Pass / unchanged | 继续保持既有七字段 closed shape，extra key 拒绝明确。 |
| Terminal transition binding | Fail | 计划只写“canonical digest of both items”，没有定义 pair/envelope shape、field order/canonical bytes、resolver 和 verifier equality chain。 |

## Data Flow And Lifecycle Review

- Database identity flow：validated deployment config → active operation input → `docker exec ... psql --username --dbname`
  → parsed system/database/version identity；来源和失败语义清楚。
- Forward/rollback flow：empty project inventory → persist lifecycle `CREATING` → Compose mutation → identity/failure →
  ingress disable → row recount → resource inspection → cleanup → cleanup reference → attempt terminal transition，主路径清楚。
- Missing authority flow：production lifecycle 文件如何创建、何时变成 READY、每个状态写入哪些 exact resource
  identities、cleanup reference 如何解析到唯一 record、terminal verifier 如何重算 aggregate digest，均未闭合。
- Restore flow：现有 restore cleanup 如何升级为三类资源、三类 authority labels、pre/post observations 并进入唯一
  aggregate cleanup authority，计划没有定义。
- Destructive ordering：内部 forward actors 会 join，但 Docker project inventory 对外部/晚到资源没有锁或
  identity-safe deletion boundary；post-cleanup quiescence 只能证明结果，不能证明没有误删。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: identity correction和 production happy/failure path 可读；cleanup authority、restore branch 与
  destructive race boundary 不完整。
- Required change: 在 sequence 中加入 production/restore lifecycle records、exact resource-set digest/reference、
  restore containers/networks/volumes pre/post proof，以及 inventory 变化时 abort 而不是 broad-delete 的分支。

## Implementation Readiness

- Clear implementation path: no，直到 TPR-001/002 固定，TPR-003 给出可验证的 destructive boundary。
- Affected remediation surfaces: Design §§3、5-8、11；Implementation S2-S5、detailed contracts、negative checks、
  risk table；必要时 `compose.restore.yaml`、existing restore lifecycle/cleanup 和 evidence schema 文档。
- Open decisions developers would otherwise need to make: production lifecycle path/schema；cleanup union shape；
  cleanup reference resolver；aggregate digest bytes；restore authority labels/network observations；quiescence defaults；
  safe deletion target/fence and race behavior。

## Verification Readiness

- 已计划的有效证明：wrong DB user/no fallback、no `postgres` role、strict extra keys、nonzero rows、foreign/missing
  production labels、partial cleanup、resource reappearance、full repository verify。
- 缺失证明：restore network zero；restore attempt/target/candidate live binding；same-project other-attempt/unlabelled
  restore sentinel；检查后新增/替换 foreign/orphan resource 不被 broad deletion 触达；cleanup reference/aggregate
  terminal digest 的 independently recomputable verifier cases。
- 真实 Docker 测试应同时证明 production 和 restore 的 container/network/volume 三类资源最终为零，并证明所有
  foreign sentinels保持不变；mock-only 不能替代。

## Modification Recommendations

1. 先把所有删除授权记录写成 versioned closed contracts；不要让实现代码反向定义 schema。
2. 把 existing restore cleanup 纳入 AC 4/6/8/11 的完整三类资源与 authority-label chain，而不是只引用旧 digest。
3. 收窄或 fence production/restore 删除动作，使 pre-inspected identity 与实际被删除 identity 一致，并用
   same-project late foreign/orphan injection 证明 fail closed。

## Re-review Requirements

Main 修订后应创建新的 plan commit、逐文件 SHA-256 与 composite digest，并发起 Cycle 2
TechnicalPlanReviewRequest。复审至少需要看到：

1. `ProductionLifecycleV1`、完整 `RollbackCleanupEvidenceV1` variants、observations、cleanup reference 和 terminal
   digest envelope 的 closed schemas、paths、bindings、state invariants 和 replay rules；
2. production 与 restore containers/networks/volumes 的 attempt/target/candidate/project label contract、pre/post
   zero proof 和真实 Docker negative matrix；
3. 实际删除只触达已经验证的 exact identities，或等价的可证明 fencing；检查后出现的 same-project
   foreign/orphan/replacement resource 保持不变并使 cleanup FAIL；
4. 更新后的 diagrams、implementation slices 与 docs/evidence schema deliverables 对以上契约逐项可追踪。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；hotfix Cycle 1、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `90b48a2bc6a848a13693a1e1fdb230974b1ce39f858ec4c365116ed2c8300d0f` 作为有效 Cycle 1 请求接受。
- remote feature branch 与 isolated review worktree HEAD 均为
  `dd37736c439e76f5e0da63b55b91c6ca5ee53e25`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `8d4a18cc...`、design `c4cdd08b...`、implementation plan `d529625c...`，均匹配请求；
  composite digest 由 Lifecycle 请求绑定。
- 核对了完整 requirements/design/implementation plan、权威 baseline ancestry、production/restore Compose、
  production identity readers、application rollback、active oracle/controller 以及 existing restore lifecycle/cleanup。
- 本次只做 exact-snapshot technical plan review；没有修改源计划、feature branch、生产服务器、Docker、DNS、
  secrets、release target 或外部状态。
