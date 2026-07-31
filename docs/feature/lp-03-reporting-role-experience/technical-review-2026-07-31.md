# Technical Plan Review: LP-03 结构化汇报与双角色体验（Cycle 1）

- Review date: 2026-07-31
- Reviewed artifact(s):
  - `docs/feature/lp-03-reporting-role-experience/requirements.md`
  - `docs/feature/lp-03-reporting-role-experience/design.md`
  - `docs/feature/lp-03-reporting-role-experience/implementation-plan.md`
- Reviewed plan commit: `2749f21d378418663d34f772e686ee95044fede3`
- Reviewed composite SHA-256: `75c70adef6bd088e2dbae3cceae89ea9f9f5f9104216f9a685f59cb317c4e363`
- Review request: `838fb2c8be72b7e968d3f0729e304734cf9216f7a4ce850d9f1043dc96d71f88`
- Reviewer stance: Architect handoff readiness
- Final decision: Fail
- Decision summary: 计划已充分定义报告 Schema、持久化、事务、通用渲染、安全边界、双角色页面与验证分层，但报告提交者/审计归因没有权威输入来源，运行时组件异常所需的上一 render model 也没有公共响应结构和查询规则。两处都要求开发者自行发明跨层契约，当前 exact snapshot 尚不能进入实现。

## Handoff Judgment

该 exact snapshot 暂不能交给开发者进入实现。计划在大多数方面已达到较高完整度：单一
JSON Schema、七类 closed block、有限 Markdown AST、跨项目引用拒绝、不可变 revision、
幂等与锁顺序、固定权威区、通用渲染器、CSP/静态托管、可访问性以及分层验证均有明确
路径。

阻塞点集中在两个跨层协议边界，而不是功能范围本身。第一，canonical report body 明确
不含 actor，现有 bearer 验证也只返回“凭据有效”，但持久化和 audit 又要求提交者及 actor
元数据；计划没有说明它们从哪里来、怎样校验和怎样映射到非空审计字段。第二，服务端
`CURRENT` 响应只定义一个 render model，而 React error boundary 又必须使用同一响应中的
上一 render model；计划没有定义第二模型、revision 身份、hydrated refs、空值和选择规则。
这会让不同实现对同一验收条件产生不兼容的 DTO 和行为。

另有一处非阻塞精度问题：proposer 分类表把普通 Idea 写成 `DRAFT`，而现有 Idea intake
authority 只有 `IDEA | NEEDS_CLARIFICATION`；应改成精确的现有字段谓词，避免误用结论
状态名。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 给出现状、目标、32 项需求、16 项验收标准、Non-goals、失败恢复和 LP-02 关闭依赖。 | 无。 |
| Data structure clarity | Fail | Report source、七类块、三张 report 表与公开 routes 已定义。 | TPR-001 缺提交主体输入/审计映射；TPR-002 缺运行时双 render-model 响应结构。 |
| New/changed fields highlighted | Fail | revision/pointer/idempotency 字段有类型、null/default 与 owner。 | `submitted_by_*` 的来源/校验/默认缺失；runtime fallback candidate 的 DTO 字段完全未列出。 |
| Data flow clarity | Fail | 提交 transaction sequence 覆盖 validation、locks、revision、pointer、audit、replay。 | Sequence 未显示认证主体怎样进入 revision/audit，也未显示 current read 怎样装载两个模型及各自 refs。 |
| Core object lifecycle | Pass | revision append-only、accepted/renderable pointers、完成态冻结、重开续写、协议兼容和回退生命周期清楚。 | 无独立 lifecycle 阻塞项。 |
| Flow diagram | Pass | Architecture、validation flow、submission sequence 与 rollout diagrams 均存在且可读。 | TPR-001/002 修订后应同步相应 sequence/DTO，而无需新增泛化图。 |
| Developer handoff readiness | Fail | 八个 slices、文件归属、slice gates、E2E 和 AC matrix 完整。 | 两项跨层契约仍需开发者作产品/安全决定，不能由实现阶段猜测。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- canonical JSON Schema 使用 Draft 2020-12、严格 `additionalProperties: false`、七类固定块
  和逐层复杂度边界；生成类型与 Ajv strict-mode 校验共享同一来源。
- 验证顺序覆盖 body/JSON、版本、结构、语义、安全、同项目引用；完整正文和危险值不进入
  错误、日志或 audit。
- `project_reports`、`report_revisions`、`report_submission_keys` 的所有权、不可变性、指针、
  幂等 replay 与 lock order 基本完整；失败路径要求原子回滚。
- `EMPTY | CURRENT | FALLBACK | UNSUPPORTED` 清楚表达服务端兼容性选择，并分离 accepted 与
  rendered revision 身份。
- 固定权威区域与动态报告区域分离；报告只存稳定引用 ID，读取时批量补全当前权威字段。
- proposer/executor 是 URL-visible presentation mode，而非身份；Web 不建立第二套业务状态，
  scoped confirmation 继续沿用 LP-02 capability cookie。
- implementation slices 覆盖 contracts、domain/compiler、DB、HTTP、projections、Web、E2E、
  管理文档同步与完整 `npm run verify`。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-001 | Blocker | 报告提交者与审计 actor 没有权威数据来源 | Canonical report root 只允许 `schemaVersion/projectId/clientRequestId/basedOnRevision/locale/title/sections` 及 display metadata，并明确 generator 不是 actor authority；Design §5 又要求 `submitted_by_type/submitted_by_id`，§5.2 要求 audit actor metadata。现有 `authenticateWrite` 只比对单一 bearer token，不返回 principal；POST 也只接收 canonical body。现有 `audit_events` 还要求 actor type/role/display name、reason、request/idempotency identity。 | 开发者只能硬编码提交者、扩大 canonical body、添加未设计 header/envelope，或留下不可实现的非空/audit 字段。不同选择会改变安全、OpenAPI、审计可追溯性和 LP3-REQ-009/012 的验收含义。 | 选择并冻结一个权威主体来源（例如 credential-bound server principal/config + typed auth context，或独立且 closed 的 transport envelope），逐字段定义 type/required/default/validation/compatibility，并映射到 revision 与 `audit_events` 的 actor、reason、request/idempotency 字段。同步 auth/data-flow diagram、OpenAPI/contract、redaction、negative/audit/transaction tests；presentation-only report Schema 不应被暗中用作身份来源。 | yes |
| TPR-002 | Major | 客户端运行时异常所需的上一 render model 没有响应契约 | Design invariant §3.10 和 §7、Implementation §8.2 均要求 error boundary 渲染“response-provided previous/prior render model”。但 Design §6.1 只定义一个 safe render model；`displayMode=CURRENT` 表示当前 accepted 已可渲染，`FALLBACK` 仅覆盖服务端协议/编译兼容回退。未定义 runtime fallback candidate 的字段、revision ID、hydrated refs、nullability 或选择查询。 | 服务端返回 CURRENT 时，组件异常后浏览器没有契约化的上一模型可用；实现者会各自发明嵌套 DTO、refs 和查询语义，LP3-REQ-018 / AC-007 无法形成稳定 contract 或测试 oracle。 | 为 current response 定义 closed field-level union：当前 display model 与独立 runtime fallback candidate（各自 revision/accepted relationship、safe model、hydrated refs、null/diagnostic）。规定 candidate 选择规则，例如同一报告中小于当前 rendered revision 的最大 supported/renderable revision，以及无 candidate 时的安全空态；同步 DB query、API contract、component/browser tests。 | yes |
| TPR-003 | Minor | 普通 Idea 分类引用了不存在的 `DRAFT` intake 状态 | Design §6.2 把 `IDEA` category 规则写为 “`DRAFT` or otherwise not promoted”；仓库 `IntakeStatusSchema` 只有 `IDEA | NEEDS_CLARIFICATION`，`DRAFT` 属于其他领域对象。Implementation §6.2 只说从 Idea、linked project、clarification state 计算，没有消除该歧义。 | 实现者可能把 conclusion 状态误接到 Idea 分类，或对未关联/已澄清 Idea 使用不同谓词；AC-008 的“一项一类”会出现不一致。 | 用现有 authority 字段写出互斥 truth table，例如 clarification 优先；否则 `intakeStatus=IDEA && projectId IS NULL` 为 `IDEA`，已关联时按唯一 linked project status 分类，并锁定边界 fixtures。 | no |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| Canonical report / blocks | Pass | 单一 JSON Schema、closed root/object、字段与数量边界、七类 discriminated blocks、有限 Markdown 安全规则完整。 |
| `project_reports` / revisions / submission keys | Fail | PK/FK、pointer、immutable source/model、digest/idempotency 字段明确；`submitted_by_*` 没有权威来源，见 TPR-001。 |
| Report current/history API DTO | Fail | 服务端 compatibility mode 和 revision identities 已定义；runtime fallback candidate 的第二模型及 refs 未定义，见 TPR-002。 |
| Experience projection DTO/query | Pass with Minor | routes、category/group、authority fields、pagination/batch previews 清楚；普通 Idea predicate 的 `DRAFT` 需修正，见 TPR-003。 |
| Web/security/config | Pass | URL role mode、read-only boundary、scoped cookie、CSP、same-origin/static fallback、no DOM execution 与秘密隔离有明确约束。 |
| Migration/readiness | Pass | additive migration、ordered catalog/checksum、new-schema-old-binary rollback 与 no-down-migration 策略完整。 |

## Data Flow And Lifecycle Review

- Data origin: AI bearer report POST、public report/experience reads、LP-02 scoped confirmation；
  server owns IDs、acceptance time、revision、digest and authoritative hydration。
- Submission path: route-size/schema/semantic/security validation → idempotency ownership →
  project/report locks → status/revision/reference checks → immutable revision/pointers → audit →
  stored replay/commit。
- Missing ownership path: authenticated bearer 目前没有产生 principal，report body 又不能提供
  actor；revision submitter 与 audit actor/reason 因而无来源（TPR-001）。
- Read/render path: current/compatibility model、reference hydration 与 fixed authority isolation 清楚；
  server compatibility fallback 和 React runtime fallback 尚未形成两个可区分模型（TPR-002）。
- Lifecycle: first revision 基于 0，后续 CAS accepted pointer；完成态冻结，LP-02 reopen 后续写；
  accepted source/model append-only，unsupported protocol 安全回退，React failure 不改数据库。
- Deletion/rollback: revision 不 update/delete，迁移 additive 无 down path；旧 binary 忽略新表，
  feature flag 可关闭写/UI 而保留数据。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: architecture diagram 覆盖 API/Web/contracts/domain/DB；validation flow 和
  submission sequence 清楚展示 fail-closed 与 transaction ownership；rollout diagram 覆盖
  additive deployment。
- Required diagram changes: 在现有 submission sequence 中加入 credential principal →
  revision/audit mapping；在 current-read/API contract 中明确 primary 与 runtime fallback
  candidate 的装载和 hydration，而非新增无关图。

## Implementation Readiness

- Clear implementation path: no，直到 TPR-001 与 TPR-002 形成 closed contracts；其余八个
  slices、files、gates 与 completion conditions 可直接使用。
- Affected modules/components: `packages/contracts`、`packages/domain`、`packages/application`、
  `packages/db`、`apps/api`、`apps/web`、OpenAPI/acceptance/E2E scripts 与管理文档。
- Open decisions developers would still need to make: bearer 对应什么主体及 audit reason；
  CURRENT 响应怎样携带 runtime fallback candidate、其引用补全和选择规则。

## Verification Readiness

- Test strategy: Schema/contract、compiler、migration、integration、API、component、browser、
  security、fault-injection 与 LP-01/LP-02 regression 分层完整。
- Existing objective proof: 七类块、两种结构、危险输入、跨项目引用、idempotency/revision
  conflict、rollback、roles/deep links、accessibility、CSP 与 fallback 都有 gates/AC mapping。
- Missing proof: credential-bound actor → revision/audit 的正负测试；CURRENT response 的 runtime
  fallback candidate contract、selection/hydration 以及有/无上一版本的 component/browser fault
  tests。修订后应给这些测试明确 fixture 和 expected DTO。

## Modification Recommendations

1. 优先关闭 TPR-001 和 TPR-002；两项均应同步设计、实施 slice、contract fixture 和 AC
   oracle，避免只在代码层决定。
2. 用现有 `IntakeStatusSchema` 与 project status 写出 proposer category 的互斥 truth table，
   删除跨领域的 `DRAFT` 名称。
3. 保留当前单一 report JSON Schema、fixed-authority separation、append-only revision 和
   fail-closed boundaries；这些无需因整改而重构。

## Re-review Requirements

Main 修订后应创建新的 plan commit、逐文件 SHA-256 与 composite digest，并发起 Cycle 2
TechnicalPlanReviewRequest。复审至少需要看到：

1. authoritative report submitter/principal 来源，完整字段映射和审计 `reason` 规则，以及
   auth/OpenAPI/transaction tests；
2. primary display model 与 runtime fallback candidate 的 closed response DTO、revision/refs/
   nullability/selection semantics，以及 API/component/browser proof；
3. proposer category 的现有字段 truth table 与边界 fixtures。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-03 cycle 1、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `838fb2c8be72b7e968d3f0729e304734cf9216f7a4ce850d9f1043dc96d71f88`
  作为有效 Cycle 1 请求接受。
- remote feature branch 与 exact review worktree HEAD 均为
  `2749f21d378418663d34f772e686ee95044fede3`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `144e4a5b...`、design `4ec2cf3c...`、implementation plan
  `e9f2cc95...`，均匹配请求；composite digest 匹配。
- plan commit 基于已关闭 LP-02 merge commit `644af4f186b054a9c5d1c6db087a97e009f545a3`；
  `git diff --check` 通过。
- 读取并核对了 canonical report Schema、现有 bearer authentication、Idea intake status、
  Attention responder fields、audit schema/写路径、现有 API composition 和 LP-01/LP-02
  compatibility boundaries。
- 本次是 exact-snapshot 设计评审；没有修改源计划、实现 feature、运行 feature tests、
  更改 feature branch 或发起 merge。
