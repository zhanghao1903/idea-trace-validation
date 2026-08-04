# Technical Plan Review: LP-05 production deployment rollback hotfix (Cycle 2)

- Review date: 2026-08-04
- Reviewed artifact(s):
  - `docs/feature/lp-05-deploy-rollback-hotfix/requirements.md`
  - `docs/feature/lp-05-deploy-rollback-hotfix/design.md`
  - `docs/feature/lp-05-deploy-rollback-hotfix/implementation-plan.md`
- Reviewed plan commit: `1c84dd398ed6b44f81682986be7df28ea55b749d`
- Reviewed composite SHA-256: `10f03ecf7ff759177fdbd5103fb5c81c2812d3385e46c7e279ea4080dd62c4b6`
- Review request: `04db39c9a07dc8f2f32270cef530a073f1d394f855d522fe8080e011e76e324e`
- Previous result: `5ac88a17b5bcea4805e03aab54f206bf0b428e6de104e05975cb15d22cf5f1ea`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 1 的两个 Blocker 与一个 Major 已被 closed lifecycle/evidence contracts、RestoreLifecycleV2 三类资源 authority 和 exact-identity deletion 实质关闭。剩余三项是局部字段/失败分支对齐，可在实现中机械修正，不要求开发者重新决定架构、安全边界或授权语义。

## Handoff Judgment

该 exact snapshot 可以交给开发者实现。修订后的计划不再让实现代码反向发明 cleanup authority：
`DockerResourceIdentityV1`、observations、fixed cleanup policy、`ProductionLifecycleV1`、
`RestoreLifecycleV2`、cleanup result/reference、aggregate record 和 terminal envelope 均已定义路径、closed
shape、字段类型/空值、owner、digest、attempt bindings、state invariants、persistence、replay 和 compatibility。

Cycle 1 的 restore 与破坏性删除风险也已关闭。production 和 restore 的 containers/networks/volumes 都必须
证明 project/environment/role/attempt/target/candidate labels；V2 restore lifecycle 同时记录三类 pre/post
observations；删除不再使用 project-wide Compose down，而只使用 frozen 且复核后的 container/network IDs 与
just-in-time 复核的 volume name。晚到 orphan 或 replacement 不是 delete argument，必须保留并使 cleanup FAIL。

三个局部规则需要在实现 contract tests 中对齐。第一，upgrade rollback 明确保持原行为，但当前
`CleanupResultV1.NOT_APPLICABLE` 只允许 zero observations，无法表达“previous release 已恢复、production
resources 应原样保留”的正常 upgrade 分支。第二，`DockerResourceIdentityV1.mountpoint` 被声明成拒绝路径
分隔符的 `safeString`，而真实 Docker volume mountpoint 是路径。第三，application rollback 抛错时 aggregate
仍要求 `applicationRollbackSha256`；需明确由谁、在何时生成现有七字段 schema-valid FAIL record。三者都有
唯一、局部且与既定架构一致的修正方向，不阻断计划批准。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Confirmed requirements 给出真实失败 attempt、两个独立缺陷、15 项 AC、Goals、Non-goals、历史及授权边界。 | 无。 |
| Data structure clarity | Pass | Design §§5-6 定义 resource identity/observation、policy、production/restore lifecycle、cleanup variants/reference、aggregate 与 terminal envelope 的 closed contracts。 | TPR2-004/005/006 是局部 variant/type/failure-order 对齐。 |
| New/changed fields highlighted | Pass | 新字段均有 type、required/null、owner/source、validation、digest、binding、path、persistence 和 compatibility；无隐式 defaults。 | `mountpoint` validator 按 TPR2-005 修正；`CleanupReferenceV1.status` 实现时限定为 aggregate `PASS|FAIL` 并纳入 exact-key tests。 |
| Data flow clarity | Pass | Sequence 覆盖 zero inventory → lifecycle → mutation → principal/row proof → freeze/reverify → exact delete → quiescence → aggregate/reference → terminal transition。 | application exception 的 strict FAIL materialization 顺序按 TPR2-006 固定。 |
| Core object lifecycle | Pass | production V1/restore V2 的 CREATING/READY/QUIESCING/CLEANED/CLEANUP_FAILED、atomic persistence、digest chain、replay/conflict 和 V1 read-only compatibility 已定义。 | upgrade preservation 的 NOT_APPLICABLE result invariant 按 TPR2-004 对齐。 |
| Flow diagram | Pass | Sequence 与 state diagram覆盖 production/restore authority、set-drift abort、exact deletion 和 terminal states。 | 无阻断缺口。 |
| Developer handoff readiness | Pass | S1-S6 给出精确模块、contracts、实现顺序、真实 Docker/negative/full gates、docs、PR/merge/release boundary。 | 三项 Minor 纳入实现 contract tests 和代码审查。 |

## Cycle 1 Remediation Judgment

| Cycle 1 finding | Cycle 2 disposition | Evidence |
| --- | --- | --- |
| TPR-001 — lifecycle/cleanup/transition contracts 未 closed | Closed | Design §§5.1-6.3 给出完整 resource/observation/policy/lifecycle/result/reference/terminal matrices、paths、digests、state invariants、resolver、replay 和 compatibility；Implementation S2/S3逐项引用。 |
| TPR-002 — restore 缺 network 与 attempt ownership proof | Closed | `compose.restore.yaml` 进入 affected boundary；RestoreLifecycleV2 要求 production 同等级的 project/environment/role/attempt/target/candidate labels，三类 observations 和 zero proof；V1 只读。 |
| TPR-003 — broad Compose down 无 identity-safe fence | Closed | Design §6.4 禁止 `compose down`/`--remove-orphans`，冻结并二次复核完整 set，只删除 exact identities；late orphan/replacement 保留且 FAIL；真实 Docker negatives 明确。 |

## Qualified Areas

- Cycle 2 requirements/design/implementation-plan SHA-256 与请求逐一一致；remote feature branch 和 isolated
  review worktree 均精确为 `1c84dd398ed6b44f81682986be7df28ea55b749d`。
- previous result 精确绑定 Cycle 1 FAIL；`dd37736c...` 是本修订直接父提交，diff 只修改 design 与
  implementation plan，`git diff --check` 通过。
- 配置 DB principal 的唯一来源、显式 `--username`/`--dbname`、无 ambient/default fallback 和真实
  PostgreSQL 17.10 no-`postgres`-role proof 保持完整。
- Compose authority env keys 被固定且由 parsed attempt 覆盖；production/restore 每个 service/network/volume
  都进入 static render 与 live-label proof。
- lifecycle paths、mode `0600` atomic writes、closed fields、canonical digests、state-specific nullability、
  previous digest、fixed quiescence policy、resolver path safety 和 old-record no-migration 均可实现。
- application rollback 七字段 shape 保持不变；cleanup 只以独立 reference/terminal digest 进入 transition，
  extra keys 继续 fail closed。
- identity-safe deletion 明确拒绝 broad project command，并覆盖 set drift、late orphan、same-name replacement、
  partial cleanup 和 reappearance；真实 Docker 必须同时证明 production/restore 三类资源归零且 sentinels 不变。
- 历史 failed attempt、manual cleanup、old proposal/envelope 不可变；plan approval、merge 或本地 proof 都不构成
  production deployment/release authorization。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR2-004 | Minor | `NOT_APPLICABLE` invariant 无法表达正常 upgrade preservation | Design §5.3/Implementation out-of-scope 要求 `previousRelease !== null` 时 existing upgrade rollback unchanged；基线 application rollback 会恢复 previous release 并返回 PASS，production resources 正常非零。Design §6.1 却要求所有 `NOT_APPLICABLE` before/after observations 都为相等 zero sets。 | 若机械实现该 row，upgrade aggregate 只能错误 FAIL 或无法编码，和 compatibility 声明冲突。 | 将 production `NOT_APPLICABLE` 明确分成 fresh-no-resource 与 upgrade-preserved reason/invariant：upgrade 要求 `previousRelease !== null`、不产生 production delete arguments、before/after resource sets 相等且可非零；aggregate 仍可 PASS。增加 upgrade rollback contract regression。 | no |
| TPR2-005 | Minor | Volume `mountpoint` 的字段类型与全局 validator 冲突 | Design §5.1 定义 `safeString` 拒绝 path separators；同节把 volume `mountpoint` 声明为 `safeString` 且必进入 identity digest。真实 Docker mountpoint 是绝对路径。 | 按字面实现会拒绝每个真实 volume identity，使成功 cleanup 无法通过 parser。 | 为只读 Docker mountpoint 定义不作为文件操作目标的 bounded absolute-path type，或存储 `mountpointSha256`/从 identity 移除 raw path；保持 JIT identity equality，并加入真实 Docker parser test。 | no |
| TPR2-006 | Minor | Application rollback exception 到 aggregate/terminal evidence 的 strict FAIL materialization 顺序未写明 | `RollbackCleanupEvidenceV1.applicationRollbackSha256` 与 `TerminalRollbackEvidenceV1.applicationRollbackSha256` 必填；failure matrix 要求 application rollback 失败时 aggregate FAIL。基线 controller 只在 oracle 抛错后构造七字段 FAIL rollback。 | 若 aggregate 在 controller catch 前写入，就没有可绑定的 schema-valid application rollback digest；不同模块可能生成不同 failure objects。 | 指定单一 owner 在聚合前把 exception 转成既有七字段 schema-valid FAIL rollback（稳定 reason/timestamps/redacted error digest），让 aggregate、terminal envelope、attempt projection 引用同一 canonical object；加入 thrown-application + cleanup PASS/FAIL tests。 | no |

## Data Structure Review

| Object / schema | Result | Evidence / note |
| --- | --- | --- |
| Production identity input | Pass | `target`、configured user/database、runner 与 no-fallback 行为保持清楚。 |
| `DockerResourceIdentityV1` / Observation | Pass with minor fix | 三类 union、bounds、sort/dedupe、labels、identity/set digests完整；volume path type见 TPR2-005。 |
| `CleanupPolicyV1` | Pass | 3 samples、250 ms、15 max、30 s固定且写入 digest，不接受 ambient override。 |
| `ProductionLifecycleV1` | Pass | deterministic path、closed fields、CREATING-before-mutation、state chain、frozen set、terminal reference、replay/retention 完整。 |
| `RestoreLifecycleV2` | Pass | 同等级 authority/network proof；V1 historical read-only、不迁移、不授权新 cleanup。 |
| `CleanupResultV1` / Aggregate | Pass with minor fix | scoped variants、principal/count/observations/errors、sole aggregate path/digest完整；upgrade N/A invariant见 TPR2-004。 |
| `CleanupReferenceV1` | Pass | fixed relative path resolver、attempt/status/digest equality 和 traversal rejection明确。 |
| `TerminalRollbackEvidenceV1` | Pass with minor fix | application + cleanup binding、terminal derivation和 canonical digest完整；exception materialization见 TPR2-006。 |
| Existing `DeploymentAttemptV1.rollback` | Pass / unchanged | 七字段 closed shape 与 extra-key rejection保持兼容。 |

## Data Flow And Lifecycle Review

- Identity flow：validated config → attempt-scoped active operation → explicit `psql` principal → parsed instance facts。
- Authority flow：parsed attempt → overwritten Compose env keys → static/live labels → closed resource identities → sorted
  observation/set digest → lifecycle state/digest。
- Cleanup flow：disable ingress → production row proof → freeze observations → complete re-observation equality → exact-ID/JIT
  volume deletion → bounded zero quiescence → scoped results → sole aggregate → fixed-path reference → terminal envelope。
- Concurrency：controller lock/join阻止本流程 forward actor；不依赖它保护外部 Docker mutation，late resources从不
  成为 delete arguments并由 post-observation触发 FAIL。
- Compatibility：old lifecycle/evidence read-only；new attempts用 V1 production/V2 restore；无 historical migration。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: sequence 与 state diagram 已覆盖两类 lifecycle、set drift、identity-safe deletion、cleanup
  authority 和 terminal transition。
- Recommended diagram change: 实现文档可在 rollback exception 分支标出 strict FAIL materialization，属于
  TPR2-006 的局部增强，不影响当前主路径完整性。

## Implementation Readiness

- Clear implementation path: yes。
- Affected modules/components: two production identity readers/call sites；production/restore Compose labels；new
  cleanup contract module；active operations/oracle/controller narrow result；tests、evidence docs、operator docs、
  changelog。
- Open architecture decisions: none。三项 Minor 都是既定行为下的 exact contract 对齐，不扩大 deletion、
  public API、production access 或 release authority。

## Verification Readiness

- unit/contract：每个 state/variant/nullability/exact-key/digest/binding/resolver/replay；wrong principal；strict
  application rollback；upgrade preservation；application exception materialization。
- real Docker：PostgreSQL 17.10 custom user/no postgres role；两条 identity readers；post-Postgres injected failure；
  production/restore containers/networks/volumes zero；foreign/late/replacement sentinels unchanged。
- negative：foreign/missing project/environment/role/attempt/target/candidate labels、nonzero rows、set drift、partial
  cleanup、reappearance、false zero、wrong reference/path/status/SHA/lifecycle/application digest。
- full gate：targeted LP-05 commands、`npm run verify`、`git diff --check`；Docker proof必须本地或 GitHub Actions
  authoritative run，不得 mock-only。

## Modification Recommendations

1. 在实现第一个 contract commit 同时修正 TPR2-004/005/006，并以 focused tests 锁定，不必重新设计主流程。
2. `evidence-schema.md` 明确记录 upgrade-preserved N/A variant、volume path/digest choice 和 application FAIL owner，
   让后续独立 verifier 无需读取实现推断。

## Re-review Requirements

不需要新的 technical-plan cycle。Main 可对该 exact plan commit 启动开发；代码审查必须验证三项 Minor 已在
实现、contract tests 和 evidence documentation 中对齐，并且不得以修正它们为由扩大 cleanup authority 或
触发生产部署。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务绑定 `review`、bootstrap ready；hotfix Cycle 2、stage
  `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `04db39c9a07dc8f2f32270cef530a073f1d394f855d522fe8080e011e76e324e` 作为有效 Cycle 2 请求接受。
- remote feature branch 与 isolated review worktree HEAD 均为
  `1c84dd398ed6b44f81682986be7df28ea55b749d`；创建前远端 review-record branch 不存在。
- SHA-256：requirements `8d4a18cc...`、design `92d32e82...`、implementation plan `14d74860...` 均匹配请求；
  composite digest 由 lifecycle request 绑定。
- 核对了完整 requirements/design/implementation plan、Cycle 1 immutable report、exact diff、baseline ancestry、
  production/restore Compose、identity readers、rollback/controller 和 existing restore lifecycle/cleanup。
- 本次只做 exact-snapshot technical plan re-review；没有修改 plan、feature branch、production、Docker、DNS、
  secrets、release target 或外部状态。
