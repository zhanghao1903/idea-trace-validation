# Technical Plan Review: LP-05 部署与发布就绪（Cycle 1）

- Review date: 2026-08-03
- Reviewed artifact(s):
  - `docs/feature/lp-05-deployment-release/requirements.md`
  - `docs/feature/lp-05-deployment-release/design.md`
  - `docs/feature/lp-05-deployment-release/implementation-plan.md`
- Reviewed plan commit: `9c733037e14b1b27acd7ba2e4f80508e0d3a1cf7`
- Reviewed composite SHA-256: `4c8c638a63e61a155f111e99979acc7b9561ccb3ecbbc79a0ec0dddac5a0873d`
- Review request: `c4b3ee80c9266f6c53f112d0fc7fc3224f4435b61f305561bedb5ccc4e402594`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 生产候选、Compose/Caddy、安全、迁移、备份、回滚和授权边界总体清楚；但外部部署状态机没有执行 AC 10/16 要求的部署后备份、隔离恢复和恢复后公网复验，同时授权、备份、恢复和最终证据记录尚未形成可实现、可交叉核验的 closed schema。开发者当前仍需自行决定关键验收顺序与权威数据契约。

## Handoff Judgment

该 exact snapshot 尚不能直接交给开发者实现。计划已经把 repository release-readiness 与真实服务器
部署权限严格分开，明确了不修改 LP-01 至 LP-04 产品契约、只公开合成数据、精确镜像、私有数据库
网络、显式迁移、无自动 down、应用回滚、秘密隔离和完整测试门禁。这些边界足以约束大部分实现。

两个关键交接缺口仍会影响 AC-019 的真实性。第一，Requirements AC 10 和 AC 16 要求从真实部署的
受保护备份恢复到隔离环境、完成核心读取，并在恢复后再次确认真实域名 smoke；Design §5.2 和
Implementation §6.2 的权威状态机却只有迁移前 `BACKUP_VERIFIED`，随后直接经过 migration、app、
HTTPS、demo 到 `DEPLOYED`。它没有在合成数据已存在后生成目标绑定的备份、执行隔离恢复、记录恢复
证明和重新运行公网 smoke 的阶段。Design §7.3 虽声明最终 PASS 需要 isolated restore proof，但没有
规定该 proof 如何进入同一次授权、状态迁移和失败/恢复路径，因此 verifier 可能接受本地、旧目标或
迁移前空库的恢复证明。

第二，新增记录将承担部署授权、恢复安全和最终验收 authority，却只有部分字段清单或自然语言摘要。
`DeploymentAuthorizationEnvelope` 没有 closed schema；`DeploymentAttemptV1` 的 nested target、
migration、health/smoke、rollback 形状未定义；`BackupManifestV1` 和 `DeploymentEvidenceV1` 缺完整
field matrix；隔离恢复没有对应的 `RestoreEvidenceV1` 合约。缺少 required/default/owner/validation、
canonical digest、兼容规则和跨记录 equality constraints 时，无法独立证明 backup 来自授权目标、
restore 使用该 exact backup、恢复没有接触生产资源，以及 final evidence 属于同一 candidate/attempt。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 给出现状、20 项 AC、Goals、Non-goals、失败恢复、安全、公开数据和独立部署授权边界。 | 无。 |
| Data structure clarity | Fail | `ReleaseCandidateManifestV1` 和 `DeploymentAttemptV1` 有顶层字段表，backup/evidence 有字段摘要。 | TPR-002：授权、attempt nested objects、backup、restore proof 和 final evidence 未形成 closed field contracts。 |
| New/changed fields highlighted | Fail | 候选与 attempt 的多数顶层字段被列出。 | TPR-002：多份新持久记录缺每字段 type、required/default、owner、validation、compatibility/migration 与 cross-record binding。 |
| Data flow clarity | Fail | 架构图、启动 sequence 和 preflight → backup → migrate → app → HTTPS → demo 主路径清楚。 | TPR-001：真实部署后 backup → isolated restore → restored read → public re-smoke 的来源、顺序、存储、消费和失败路径缺失。 |
| Core object lifecycle | Fail | Candidate cleanup、attempt 主状态、backup retention、restore cleanup 和 app rollback 有局部规则。 | TPR-001/002：attempt 无 post-deploy backup/restore states；authorization、restore evidence 和 final evidence 的创建、复用/过期、更新、保留/删除规则未闭合。 |
| Flow diagram | Fail | 有 topology Mermaid 和启动 sequence。 | 权威部署状态图没有表达 AC 10/16 的 post-deploy backup/restore/re-smoke 路径；自然语言 PASS 条件不能替代缺失 transition。 |
| Developer handoff readiness | Fail | 五个 slices、文件边界、逐层 gates、PR/merge/release authority 和 rollback 范围明确。 | 开发者仍需发明 AC 10/16 的编排和 durable proof schemas；TPR-003 还留下 host toolchain compatibility 决策。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致；远端
  feature branch 在评审时仍精确指向 `9c733037e14b1b27acd7ba2e4f80508e0d3a1cf7`。
- LP-04 authoritative merge `46e021d261fd8a663c83430a551f5674365ccf14` 是计划提交的祖先；本次
  diff 仅新增三份 LP-05 计划文档，`git diff --check` 通过。
- frozen OpenAPI、lockfile 和三份 migration SHA-256 与计划声明全部一致；实际 Fastify ordinary
  body limit 为 65,536 bytes，report route 为 262,144 bytes，与 LP-05 proxy proof 设计一致。
- `ReleaseCandidateManifestV1` 已覆盖 source commit/tree、platform、image/archive identity、base image
  locks、migration catalog、Web/OpenAPI digests、same-head verification 和 synthetic-only declaration。
- 四服务/双网络 topology、只开放 80/443、non-root/read-only/cap-drop、Compose secret files、Caddy
  transport-only ownership 和 app readiness ordering 边界清楚。
- 备份加密流、atomic publish、retention path guards、隔离 restore labels、生产资源 before/after identity、
  no automatic production restore 和 app-only rollback 都是正确的安全方向。
- 外部部署、DNS、凭据轮换、生产恢复和制品发布被拆成独立授权；plan/code approval 或 merge 不被
  错误解释为外部变更授权。
- unit/static/container/local Compose/database/rotation/regression/external smoke 分层完整，mock/local TLS
  不得冒充真实公网证据。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Major | 权威部署状态机缺少部署后备份、隔离恢复和恢复后公网复验 | Requirements AC 10、16 要求生产候选备份的隔离恢复和之后的真实域名 smoke。Design §5.2 状态仅为 `PREPARED → ... → BACKUP_VERIFIED → MIGRATION_SUCCEEDED → APP_READY → HTTPS_READY → SMOKE_PASSED → DEPLOYED`；Implementation §6.2 同样只在迁移前备份，demo 后直接写 `DEPLOYED`。Design §7.3 只声明 PASS 需要 restore proof，没有定义 proof 的执行位置或状态绑定。 | 首次部署的迁移前备份可能是空库；旧目标、本地环境或先前 attempt 的 restore proof 也可能被误关联。实现无法客观满足 AC 10/16，也不能保证失败时停止在明确状态或恢复后真实服务仍健康。 | 在同一授权 envelope、attempt lifecycle 和实施 slice 中定义确定顺序：迁移前 safety backup（若适用）→ deploy/demo → 目标绑定的 post-deploy protected backup → exact backup 的 isolated restore → migration/catalog 与 synthetic core reads → 生产资源 unchanged → 再次 external HTTPS smoke → `DEPLOYED`。增加对应 states/records、bounded retry/resume/failure/cleanup/rollback rules，以及 fresh-install、stale/wrong-target proof 和 restore-failure tests。 | yes |
| TPR-002 | Major | 承担授权与验收 authority 的持久记录没有 closed schema 和跨记录约束 | Design §5.1 仅以 bullets 描述 authorization envelope；§5.2 的 attempt nested fields 只给概括；§6.1 以句子列 backup manifest；没有 `RestoreEvidenceV1`；§7.3 以句子列 final evidence。Implementation 要求严格 parser/canonical digest/verifier，却未固定这些输入。 | 开发者必须决定必填/可选、null/default、nested shape、digest bytes、target/database identity、过期/重放和跨记录 equality。不同实现可能让未授权 envelope、错误目标 backup、错误 restore 或手写 PASS 通过 verifier，属于安全与验收风险。 | 为 `DeploymentAuthorizationEnvelopeV1`、完整 nested `DeploymentAttemptV1`、`BackupManifestV1`、新增 `RestoreEvidenceV1`、`DeploymentEvidenceV1`（以及必要 config）提供 closed field matrices：每字段 type、required/optional、absence/default、owner/source、bounds/validation、canonicalization/digest、compatibility/migration、persistence/retention。明确 candidate/attempt/target/source-DB/backup/restore/public-smoke 的 equality chain，并使 verifier fail closed。 | yes |
| TPR-003 | Minor | Host-side deployment toolchain compatibility 未固定 | Design/plan 要求 pinned images，但 backup/restore 依赖 host `age`，Compose dependency/secret behavior 依赖 container engine/Compose；Remaining External Inputs 只收集实际版本，Slice 5 只笼统写 supported runtime。 | 新运维者和 CI 仍需猜测最低/允许版本、安装来源与预检判定，可能导致格式或 Compose 行为差异。 | 在 plan/runbook contract 中列出并验证支持的 container engine、Compose 和 `age` 版本/安装来源；不满足时 preflight 使用稳定 reason code 失败。 | no |

## Data Structure Review

| Object / schema | Result | Evidence / gap |
| --- | --- | --- |
| `ReleaseCandidateManifestV1` | Partial pass | 顶层 identity/validation/persistence 较完整；`baseImages`、`verification` 等 nested shapes 可在 TPR-002 修订时一并 closed。 |
| Production config/secrets | Pass with minor gap | consumer、secret/non-secret、path and secrecy rules 清楚；host tool version contract 见 TPR-003。 |
| `DeploymentAuthorizationEnvelopeV1` | Fail | 尚未作为 versioned closed schema 定义；授权摘要的 canonical bytes、有效期/复用与 exact operation equality 未固定。 |
| `DeploymentAttemptV1` | Fail | 顶层 state 清楚，但 nested target/previousRelease/migration/health/smoke/rollback 未定义 exact shapes/defaults；缺 post-deploy restore states。 |
| `BackupManifestV1` | Fail | 有字段主题和安全意图，但没有完整 type/required/default/owner/validation matrix，也没有足以区分相同 release/db name 的授权 target/source-instance binding。 |
| `RestoreEvidenceV1` | Fail | 隔离 restore 行为有设计，但没有持久 proof object、字段、digest、生命周期或与 exact backup/target 的 equality contract。 |
| `DeploymentEvidenceV1` | Fail | 有内容摘要和 PASS rule，但没有 closed schema/compatibility/lifecycle；无法完整表达 TPR-001 所需的 post-restore public re-smoke chain。 |
| Existing API/domain/database contracts | Pass / unchanged | 计划冻结 OpenAPI、migrations 和 forbidden paths，LP-05 不增加业务字段或 migration。 |

## Data Flow And Lifecycle Review

- Candidate flow：clean exact Git snapshot → pinned build → inspected image → OCI archive → canonical manifest →
  same-head verification，来源、转换、存储和消费者清楚。
- Runtime flow：Caddy edge → app → private PostgreSQL；one-shot migrate、readiness 和 bounded controller polling
  清楚，Compose dependency 不是成功 authority。
- Backup flow：running DB `pg_dump` → `age` encryption → atomic ciphertext/manifest → retention；restore 使用新
  project/volume 和 loopback app，生产资源 before/after unchanged，局部路径清楚。
- Missing acceptance flow：真实 candidate 的 demo data 何时进入 protected backup、谁发起 isolated restore、
  restore proof 何时绑定 attempt、恢复后谁再次读取真实 HTTPS，以及任一步失败后的持久状态均未定义。
- Candidate cleanup、verified-pair retention 和 exact labelled restore cleanup 有安全规则；authorization 与
  final evidence 的 reuse/expiration/retention 尚未定义。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: topology 和 startup/migration path 合格；缺少完整外部验收状态图。
- Required change: 将 pre-deploy backup 与 post-deploy protected backup 明确区分，并把 isolated restore、
  restored reads、production unchanged oracle、post-restore external smoke 和 failure/resume branches 加入
  DeploymentAttempt state diagram/sequence。

## Implementation Readiness

- Clear implementation path: no，直到 TPR-001 与 TPR-002 固定；其余 candidate、topology、secret、local
  acceptance、rollback、docs 和 CI slices 可直接执行。
- Affected remediation surfaces: Design §§3.2、5–7、Implementation Slices 3–4、post-merge §10、final
  verification matrix 和 evidence-schema deliverable。
- Open decisions developers would otherwise need to make: post-deploy restore orchestration/state placement；
  authorization/backup/restore/evidence JSON shapes；canonical digest source；target/source database identity；
  proof reuse/expiry；host tool minimum versions。

## Verification Readiness

- 已计划的有效证明：dirty/latest/path/symlink negatives、pinned/non-root image inspection、secret canaries、
  Compose ordering、proxy contract/body bounds、DB-unready behavior、encrypted backup、label-safe restore、
  credential rotation、fault injection、app rollback、full regression 和 real HTTPS smoke。
- 缺失证明：同一 authorized production attempt 在 synthetic story 后生成 backup，从该 exact backup 隔离
  restore，验证三份 migration 与 core reads，证明 production resources unchanged，再次运行真实域名
  smoke 后才到 `DEPLOYED`。
- 还应加入 wrong target/source DB、pre-migration empty backup、stale attempt、local-vs-external restore proof、
  missing post-restore smoke 和 cross-record digest mismatch 的 verifier counter-cases。

## Modification Recommendations

1. 先修 DeploymentAttempt 的 acceptance tail，把 pre-migration safety backup 与 AC 10/16 的 post-deploy
   recoverability proof 分开；不要只在 final verifier 中“要求存在某个 restore digest”。
2. 将所有 authority records 放入 `evidence-schema.md` 的 closed, versioned contracts，并让 implementation
   plan 逐项引用 exact schema 与 equality chain，避免脚本各自发明相似但不兼容的 JSON。
3. 把 `age` 与 container engine/Compose 的支持版本和 fail-closed preflight 纳入同一依赖表；无需扩大到
   通用供应链平台。

## Re-review Requirements

Main 修订后应创建新的 plan commit、逐文件 SHA-256 与 composite digest，并发起 Cycle 2
TechnicalPlanReviewRequest。复审至少需要看到：

1. AC 10/16 的完整 external state/sequence：post-deploy backup、exact isolated restore、core reads、
   production unchanged、post-restore public smoke，连同 failure/resume/cleanup 和 fresh-install rules；
2. authorization、attempt、backup、restore evidence 与 final deployment evidence 的 closed schemas、生命周期、
   canonical digests 和 target/candidate/DB/backup/attempt equality chain；
3. 以上链路的 negative tests，证明 pre-migration empty/local/stale/wrong-target proof 不能使 external PASS；
4. host `age` 与 container engine/Compose 的支持版本和 preflight compatibility rule。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-05 Cycle 1、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `c4b3ee80c9266f6c53f112d0fc7fc3224f4435b61f305561bedb5ccc4e402594` 作为有效 Cycle 1 请求接受。
- remote feature branch 与 isolated review worktree HEAD 均为
  `9c733037e14b1b27acd7ba2e4f80508e0d3a1cf7`；创建前本地/远端 review-record branch 不存在。
- SHA-256：requirements `06966791...`、design `9b93c8a5...`、implementation plan `090a5e79...`，
  均匹配请求；composite digest 由 Lifecycle 请求绑定。
- 核对了完整 requirements/design/implementation plan、LP-05 source plan、actual request limits、LP-04
  baseline ancestry、frozen OpenAPI/lockfile/migration digests 和现有 LP-04 synthetic demo资产。
- 本次只做 exact-snapshot technical plan review；没有修改源计划、feature branch、生产服务器、DNS、
  secrets、release target 或外部状态。
