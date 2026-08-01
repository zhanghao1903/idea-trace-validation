# Technical Plan Review: LP-04 AI Skill 与可重复演示（Cycle 2）

- Review date: 2026-08-01
- Reviewed artifact(s):
  - `docs/feature/lp-04-ai-skill-demo/requirements.md`
  - `docs/feature/lp-04-ai-skill-demo/design.md`
  - `docs/feature/lp-04-ai-skill-demo/implementation-plan.md`
- Reviewed plan commit: `e9c56653901583f2824f8662b1a87dc2c1a69c5c`
- Reviewed composite SHA-256: `24d41fd9b5a5f10e07daa9c2a941f0fe411833663ba9ccb7d1ecc3035cb76f6b`
- Previous result: `3d7e3853ebb894ff34ceffbba696c7b636fa7df953b2913e09cbd07b02d5a66d`
- Review request: `beda767d2ec0b6b5a284af3ce957143414236c2673696e931ac3e0403c643872`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 1 的跨进程未知结果恢复缺口已由 closed durable request journal、写前原子持久化、逐请求恢复状态机、启动扫描及真实 HTTP crash/restart oracle 完整闭环。mandatory criteria 全部满足；仅有一处 run-state diagram 把恢复终点固定画为 `PREFLIGHT_PASSED`，与 `resumePhase`/正文的“恢复最后 checkpoint”不一致，属于局部 Minor，不影响实现交接。

## Handoff Judgment

该 exact snapshot 可以交给开发者进入实现。Cycle 2 没有改变已确认需求或扩大 LP-04 范围，
而是把上一轮缺失的恢复 authority 固化为可实现、可测试且不污染 Git 的本地 tooling contract：

- 每个 semantic write 在发送前生成唯一 journal entry，持久化 exact method/path/canonical UTF-8
  body/idempotency key、body/key digests、version/revision inputs、manifest/Skill binding 和状态；
- 同目录 temp write、file `fsync`、atomic rename 和支持平台上的 directory `fsync` 定义了
  `PREPARED` 与 `DISPATCHED` 先于 `fetch` 的 ordering；
- 启动时先扫描未完成 entry，再从 journal 原字节重放，public read 对账后才标记
  `COMMITTED`/`REJECTED`；changed intent 只能创建新 attempt/key/immutable entry；
- 真实 HTTP acceptance 用 child-process harness 在 upstream commit 后杀死 runner，新进程用同
  run ID 恢复，并比较跨进程 body/key digests、API replay metadata 和最终单一业务结果。

因此开发者不再需要自行决定请求体保存形式、原子落盘时机、恢复顺序或 crash oracle。其余
Skill、真实 HTTP、human boundary、real-data browser、实际 Codex/Claude 证据和全量门禁设计
继续保持完整。

本轮仅发现一处局部描述不一致：Design §6.1 的 Mermaid 把
`RECOVERING_UNKNOWN` 唯一画回 `PREFLIGHT_PASSED`，但 `resumePhase` 字段、同节正文、§7.2
流程图和 Implementation Slice 2 都要求恢复最后 durable non-recovery checkpoint。详细字段和
实施规则足够明确，故记为 Minor、不中断 Pass。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 的问题、场景、Goals、18 项 AC、Non-goals、恢复、安全、兼容和 no-publish 边界保持完整。 | 无。 |
| Data structure clarity | Pass | Design §5 定义 manifest、run record、durable request journal、client validation record 和 fault plan；journal 覆盖 exact body/key、digests、authority inputs、bindings、states、timestamps、observation、refs、retention。 | 仅 TPR-002 状态图终点需与字段语义统一。 |
| New/changed fields highlighted | Pass | 每项新字段均给出 type、required/default、owner、validation 和 persistence/compatibility；canonical body 的 64 KiB、synthetic-only、secret exclusion 与 serialization version 明确。 | 无阻塞缺口。 |
| Data flow clarity | Pass | Design §7.2 和 Implementation §4.3 定义 journal-before-send、crash/unknown、startup scan、exact replay、public reconcile、terminal/new-intent 流程。 | 无。 |
| Core object lifecycle | Pass | Demo run、durable request、Skill invocation 和 client evidence lifecycle 均有创建、持久化、状态、恢复、terminal、retention/deletion 和 observable rules。 | TPR-002 仅为顶层图示一致性。 |
| Flow diagram | Pass | Demo run state、durable request state、Skill sequence 和 reproducible demo flow 覆盖主路径与 crash/restart recovery。 | 将 §6.1 recovery arrow 改为 `resumePhase` 语义即可。 |
| Developer handoff readiness | Pass | 六个 slices、文件路径、allowed/forbidden scope、implementation rules、targeted gates、real-client responsibility、PR/rollback/acceptance 条件完整。 | 无阻塞开放决定。 |

## Cycle 1 Finding Closure

| Previous finding | Status | Cycle 2 evidence |
| --- | --- | --- |
| `TPR-001` 跨进程未知结果恢复没有持久化的请求字节 authority | Closed | Design §3.5、§5.3、§6.1–6.2、§7.2、§8–9、§12–15 定义 exact durable bytes/key、journal fields、atomic write-before-send、request/run lifecycles、startup replay/reconcile、安全/retention 和 crash proof；Implementation Slice 2–3 列出 `request-journal.ts`、状态/损坏/secret tests、child-process kill harness、跨进程 digest/replay/单结果 oracle。 |

## Qualified Areas

- 请求中的 requirements、design、implementation plan SHA-256 与 exact commit 文件逐一一致。
- Requirements SHA 与 Cycle 1 相同，acceptance criteria digest 未变化；Cycle 2 只修订 Design
  与 Implementation Plan，没有改变用户确认的 scope。
- `e9c5665` 是 Cycle 1 plan commit `ff2ca5e` 的直接后代，diff 仅包含上述两份计划文档，
  `git diff --check` 通过。
- 远端 feature branch 在评审时精确指向 `e9c56653901583f2824f8662b1a87dc2c1a69c5c`；
  deterministic Cycle 2 review-record branch 创建前不存在。
- Journal entry 路径由 sanitized step/attempt 推导，不接受任意 caller path；body 有 size、JSON、
  synthetic lineage 和 secret scan，key 为可重派生的非秘密 synthetic identity。
- `PREPARED/DISPATCHED/OUTCOME_UNKNOWN/COMMITTED/REJECTED` 清楚区分发送前、已声明发送、
  结果未知和 terminal；未完成 entries 在任何后续 scenario expansion/read 前恢复。
- `expectedVersion`/`basedOnRevision` 被同时保存在 exact canonical body 与
  `authorityInputs`，恢复不会因 authority 已推进而重建不同 body。
- missing/corrupt/oversized/tampered/secret-bearing journal、changed manifest/Skill 和 old-key
  body/version drift 都要求 fail-before-send；terminal changed intent 使用新 entry/key。
- runtime/API/OpenAPI/database/domain/Web 继续保持无变更；Skill 与 demo 只通过真实 listening
  HTTP 使用 frozen LP-03 contract。
- human-control 与 AI bearer 分离、loopback/synthetic guard、raw transcript/local proof ignore、
  actual Codex/Claude evidence 和 no-static-substitution 规则保持完整。
- final matrix 保留 LP-01 至 LP-03 全部门禁，并新增 journal containment、crash/restart
  body/key equality 和真实数据浏览器验证。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-002 | Minor | Demo run recovery 状态图把恢复终点固定为 `PREFLIGHT_PASSED` | Design §5.2 定义 `resumePhase` 为最后 durable checkpoint；§6.1 正文称恢复后继续该 checkpoint，§7.2 与 Implementation §4.3 也写“resume last checkpoint/`resumePhase`”。但 §6.1 Mermaid 仅画 `RECOVERING_UNKNOWN --> PREFLIGHT_PASSED`。 | 若机械照图实现，原 run 在更晚 checkpoint 发生恢复时会回退 phase，产生多余 scenario scan；详细 field/text/implementation contract 已消除架构歧义，因此不要求重新送审。 | 把图中 recovery transition 标注为 restore `resumePhase`，或列出允许返回的 non-recovery checkpoints；若产品只允许回到 `PREFLIGHT_PASSED`，则收窄 `resumePhase` 类型和其余正文。 | no |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| `DemoScenarioManifestV1` | Pass | committed synthetic inputs、bounds、template refs、runtime IDs/version ownership 与 expected views 完整。 |
| `DemoRunRecordV1` | Pass with Minor | `RECOVERING_UNKNOWN`、`resumePhase`、sanitized trace/body digest、refs/assertions/result 和 atomic proof 明确；仅 TPR-002 图示需同步。 |
| `DurableRequestJournalEntryV1` | Pass | identity/path、exact canonical body、digests、authority inputs、raw key/binding/serialization、states/timestamps、observation/refs、atomicity、retention 和 secret rules closed。 |
| `ClientValidationRecordV1` | Pass | actual client/version/mode/observer/Skill/run/input/transcript/request/resource/Web/objective/evidence fields 与 live verification 完整。 |
| `UnknownResultFaultPlan` / crash harness | Pass | one-shot downstream drop 与 upstream-commit child-process kill 各有明确 trigger、authority 和 oracle。 |
| Existing API/domain/report contracts | Pass / unchanged | frozen artifact digests、forbidden runtime paths 和 full regression gates 防止 LP-04 暗改既有行为。 |

## Data Flow And Lifecycle Review

- Initial write：read authority → expand/freeze canonical body → derive key → validate synthetic/secret/bounds →
  atomic `PREPARED` → atomic `DISPATCHED` → `fetch` → public read → terminal journal state。
- Crash/restart：startup validates run/manifest/Skill/serialization/path/digests → scans stable step/attempt order →
  enters `RECOVERING_UNKNOWN` → replays stored method/path/body/key without expansion/read → public reconcile →
  terminal state → resumes `resumePhase`。
- Same intent：same journal bytes/key；`COMMITTED` only re-reads and skips；`REJECTED` remains terminal。
- Changed intent/version/report correction：prior entry must be terminal；fresh authority read derives a new
  semantic attempt、key and immutable journal entry，never overwriting old proof。
- Failure path：missing/corrupt/tampered/secret/mismatched journal stops before send and preserves diagnosis；
  `IDEMPOTENCY_IN_PROGRESS` bounded same-byte retries；conflict and auth/human errors remain fail-closed。
- Retention/deletion：journal stays below exact ignored run until verification；only exact local run directory may be
  removed，API business records are not deleted。
- Missing transitions or ownership rules: none blocking；TPR-002 仅需同步 run diagram。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: durable request state diagram covers every request state and terminal；reproducible demo flow
  explicitly includes unresolved scan、digest validation、exact replay、public reconcile、crash loop and same-process
  retry；Skill sequence retains public authority boundary。
- Recommended diagram change: resolve TPR-002 by aligning the single run-level recovery arrow with `resumePhase`。

## Implementation Readiness

- Clear implementation path: yes；developer can implement the six slices without inventing replay persistence,
  ordering, state, security or acceptance semantics。
- Affected modules/components: repository Skill/references、`demo/lp04` fixtures、`scripts/lp04` runner/journal/
  verifier/facilitator、one API acceptance file、dedicated Playwright config/spec、package scripts 和 docs only。
- Open decisions developers would still need to make: none blocking；TPR-002 以 detailed field/text contract 为
  authority，在实现时统一图示即可。

## Verification Readiness

- Unit/contract proof：journal schema、safe filename/bounds、atomic ordering、all legal/illegal transitions、
  exact UTF-8/key goldens、corrupt/tampered/secret/drift fail-before-send、route/Schema freeze。
- Real HTTP proof：same-process dropped response plus child process killed after upstream commit；fresh process same
  run ID replays exact body/key，observes replay metadata，publicly reconciles and proves one collection/history item。
- Counter proof：crash after `PREPARED`、`COMMITTED` zero-write restart、changed manifest/Skill、old-key
  body/version drift、renewed version intent new key、invalid/corrected report and AI/human credential separation。
- End-to-end proof：real-data proposer/executor Web、two report structures、actual Codex/Claude runs、live resource
  re-read、secret scan、frozen digests and complete existing repository gates。
- Missing proof: none blocking；可在 run lifecycle unit test 中锁定 TPR-002 的 resume target。

## Modification Recommendations

1. 实现 run state machine 前统一 TPR-002 的 Mermaid recovery arrow 与 `resumePhase` contract，并用 unit
   test 锁定允许的 recovery targets。
2. 保留 journal 与 sanitized `result.json` 的职责分离；不要为了提交证据把 canonical body 复制进 Git。

## Re-review Requirements

无需因 TPR-002 单独重新送审；本 exact plan snapshot 已通过。若实现前改变 journal 的 exact-body/key
authority、write-before-send ordering、request terminal semantics、crash/restart oracle、synthetic/secret
guard、既有 runtime contract 或实际 Codex/Claude 证明要求，则必须形成新的 plan commit/digest 并重新评审。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；LP-04 cycle 2、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `beda767d2ec0b6b5a284af3ce957143414236c2673696e931ac3e0403c643872`
  作为有效 Cycle 2 请求接受，并绑定上一结果
  `3d7e3853ebb894ff34ceffbba696c7b636fa7df953b2913e09cbd07b02d5a66d`。
- remote feature branch 与 exact review worktree HEAD 均为
  `e9c56653901583f2824f8662b1a87dc2c1a69c5c`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `8fdf05ea...`、design `7ff1ed43...`、implementation plan
  `bb9d4b94...`，均匹配请求；requirements 与 Cycle 1 相同。
- Cycle 2 commit 是 Cycle 1 `ff2ca5e...` 的直接后代；diff 仅修改 Design 与 Implementation
  Plan，`git diff --check` 通过。
- 读取并核对了 Cycle 1 review、完整 confirmed requirements、Cycle 2 design/implementation plan、
  existing `expectedVersion` / report `basedOnRevision` contracts 与 frozen artifact digests。
- 本次是 exact-snapshot 设计复审；没有修改源计划、执行 feature 实现测试、编写代码、更改
  feature branch、调用实际客户端或发起 merge。
