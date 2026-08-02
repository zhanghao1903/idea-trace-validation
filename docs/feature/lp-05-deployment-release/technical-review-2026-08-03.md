# Technical Plan Review: LP-05 部署与发布就绪（Cycle 2）

- Review date: 2026-08-03
- Reviewed artifact(s):
  - `docs/feature/lp-05-deployment-release/requirements.md`
  - `docs/feature/lp-05-deployment-release/design.md`
  - `docs/feature/lp-05-deployment-release/implementation-plan.md`
- Reviewed plan commit: `9a1bcf42f428246ac7d11ab7f400adc133f10fc8`
- Reviewed composite SHA-256: `230924753e3d466de75502efe353ed89274cf65605d76648b7f2cbac5a5f3370`
- Review request: `0dbd4f427c1416d8a83224ecac6ede16657cb1c27a69640021f6140954b8829d`
- Previous result: `fc791d2a6b5e86b80bd655e5f87878be7a8be568da171fe56f055e6ad0287464`
- Reviewer stance: Architect handoff readiness
- Final decision: Pass
- Decision summary: Cycle 1 的两个 Major 与一个 Minor 已被完整的外部验收状态机、closed authority records、canonical digest/equality chain 和 host toolchain contract 实质关闭。剩余两组局部 provenance/state-schema 不一致可在实现中机械修正，不要求开发者重新决定架构或安全边界。

## Handoff Judgment

该 exact snapshot 可以交给开发者实现。修订后的设计把 repository release-readiness 与外部部署权限
继续严格分开，同时把 AC 10/16 从自然语言要求变成了不可跳过的状态路径：initial external smoke
之后生成 target/attempt/candidate/source-DB 绑定的 `POST_DEPLOY_RECOVERABILITY` 备份，恢复 exact
ciphertext 到隔离环境，验证 migration 与 synthetic story，证明生产资源前后 byte-equal，再运行
`EXTERNAL_POST_RESTORE` smoke，最后才允许 `DEPLOYED`。

Cycle 1 的 authority-schema 缺口也已闭合到可实现程度。候选、授权 proposal/envelope、attempt journal、
backup、restore、smoke 与 final evidence 均有 owner/source、required/default、validation、persistence、
canonical digest、retention/expiry 和跨记录 equality rules；Main 仍必须获得绑定 exact proposal digest 的
用户授权，local/fixture evidence 永远不能升级为 external PASS。

复审仅发现两个非阻断的局部一致性问题：候选 `sourceCommit` 仍写成必须存在于 feature branch，与
squash merge 后 production candidate 必须等于新 merge commit 的规则冲突；attempt/smoke closed shapes
还有三处机械性字段规则未对齐。它们不改变方案路径，可作为实现期 contract tests 和代码审查检查项。

## Mandatory Criteria

| Criterion | Status | Evidence | Gap / required fix |
| --- | --- | --- | --- |
| Requirement background and goals | Pass | Requirements 完整说明问题、20 项 AC、Goals、Non-goals、失败恢复、公开数据和独立授权。 | 无。 |
| Data structure clarity | Pass | Design §§3.2、5–7 定义 candidate、proposal/envelope、attempt/nested refs、backup、restore、smoke 和 final evidence 的 v1 contracts。 | TPR-004/005 是局部字段规则对齐，不影响整体 schema authority。 |
| New/changed fields highlighted | Pass | 新持久对象均给出 type、required/default、owner/source、validation 和 persistence/compatibility；canonical digest 通用协议明确。 | 实现时补齐 TPR-005 三处 exact field rules。 |
| Data flow clarity | Pass | topology、startup sequence、complete state diagram、restore sequence 和九项 equality chain覆盖来源、转换、存储、消费、失败及一次 bounded resume。 | 无阻断缺口。 |
| Core object lifecycle | Pass | immutable records、append-only attempt journal、single-use/expiry、backup retention pinning、restore cleanup、terminal failure/rollback 和 evidence retention 均明确。 | fresh-install 的 `sourceDatabase` 起始 null 规则需按 TPR-005 对齐。 |
| Flow diagram | Pass | topology、startup、complete external state machine 和 restore/equality sequence 共同覆盖 repository/runtime/external acceptance path。 | 无。 |
| Developer handoff readiness | Pass | 五个 slices、精确文件、实现顺序、negative fixtures、CI gates、PR/release boundary 和 post-merge authority 均可直接执行。 | 两项 Minor 纳入实现 contract tests。 |

## Qualified Areas

- Cycle 2 requirements/design/implementation-plan SHA-256 与请求逐一一致；remote feature branch 和 isolated
  worktree 均精确为 `9a1bcf42f428246ac7d11ab7f400adc133f10fc8`。
- previous result message ID 精确绑定 Cycle 1 FAIL；`9c733037...` 是本修订的直接父提交，差异只修改
  design 与 implementation plan，`git diff --check` 通过。
- TPR-001 已关闭：state graph 新增 `POST_DEPLOY_BACKUP_VERIFIED`、`RESTORE_ENV_READY`、
  `RESTORE_VERIFIED`、`PRODUCTION_UNCHANGED_VERIFIED`、`POST_RESTORE_SMOKE_PASSED`，并禁止 pre-migration、
  local、stale、wrong-target/DB/attempt proof 满足 external PASS。
- TPR-002 已关闭：`canonical-json-v1`、immutable/append-only persistence、proposal/envelope expiry/single-use、
  target/database identities、backup purpose、restore evidence、smoke modes 和 final evidence equality chain
  形成单一 authority model。
- TPR-003 已关闭：Docker Engine、Compose plugin 和 age 的版本范围、安装来源、能力检测及稳定 preflight
  failure codes 已进入 Design/Implementation。
- fresh install 与 upgrade 被明确区分；upgrade 要求 pre-migration safety backup，fresh target proof 不能
  掩盖既有 volume/release/data；任何 post-replacement failure 都禁用 ingress。
- typed `LOCAL` 与 `TEST_FIXTURE` records 只能验证 state/verifier，不能生成 production PASS；真实域名、
  trusted TLS、initial story、post-deploy backup/restore 和 re-smoke 仍需单独授权后的真实证据。
- frozen OpenAPI、lockfile、三份 migration 与 forbidden product paths 保持不变；LP-05 不借部署修改业务契约。

## Disqualified Gaps And Risks

| ID | Severity | Issue | Evidence | Impact | Required fix | Blocks pass |
| --- | --- | --- | --- | --- | --- | --- |
| TPR-004 | Minor | Candidate provenance rule 与 squash-merge production identity 不一致 | Design §3.2 要求 `sourceCommit` “must exist on feature branch”；§5.2 又要求 production candidate `sourceCommit == mergeCommitSha`。配置 merge method 是 squash，merge commit 正常只存在于 base branch，不存在于 feature branch history。 | 按字面实现会拒绝唯一允许的 post-merge production candidate，或迫使实现者放宽错误的 ref。 | 将候选规则改为：pre-merge verification candidate 必须等于 reviewed feature head；production candidate 必须等于 authoritative merged base commit，并验证该 commit reachable from configured base/ref。不要要求 squash merge commit 存在于 feature branch。补 pre/post-merge provenance tests。 | no |
| TPR-005 | Minor | Attempt/smoke closed contracts 有三处局部字段不一致 | Design §5.3 要求 fresh target 的 `sourceDatabase` 从 `PREFLIGHT_PASSED` 起非 null，但 read-only fresh preflight 证明尚无 production volume/DB；sequence 0 的 `AttemptTransitionV1.from` 仍要求 state，却未定义初始值；`SmokeEvidenceRefV1` 投影 `assertionSetSha256`，§7.1 `SmokeEvidenceV1` 顶层表未定义该字段。 | 严格 parser/state tests 无法同时满足字面规则，但不改变外部验收架构。 | fresh path 允许 `sourceDatabase` 保持 null 到 exact DB 创建/inspect 后的明确 state；sequence 0 定义 `from:null` 或 `START` literal；在 `SmokeEvidenceV1` 增加 derived `assertionSetSha256` 及 canonical算法，并让 refs/restoredStory equality 使用同一字段。 | no |

## Data Structure Review

| Object / schema | Result | Evidence |
| --- | --- | --- |
| `ReleaseCandidateManifestV1` | Pass with Minor | canonical digest、archive/base-image/migration/verification nested contracts 完整；production source ref wording 见 TPR-004。 |
| `DeploymentProposalV1` / `DeploymentAuthorizationEnvelopeV1` | Pass | exact candidate/target/backup/operations/exclusions/consent/toolchain、user evidence digest、expiry 和 single-use 均 closed。 |
| `DeploymentAttemptV1` / transition journal | Pass with Minor | projection、hash chain、legal graph、one bounded interruption、terminal failure 与 rollback明确；三处局部 field rule 见 TPR-005。 |
| `BackupManifestV1` | Pass | safety/post-deploy purpose、target/source DB/release/candidate/story、ciphertext/encryption/tool/verification 和 pinned retention 清楚。 |
| `RestoreEvidenceV1` | Pass | exact backup、isolated target、migration/restored story、production before/after、cleanup 与 status fail-closed。 |
| `SmokeEvidenceV1` | Pass with Minor | LOCAL/external modes、TLS/origin/story/resources/assertions 与 equality明确；缺 derived assertion-set field 行见 TPR-005。 |
| `DeploymentEvidenceV1` | Pass | 完整 authority refs、initial smoke、post-deploy backup、restore、production unchanged、post-restore smoke 和 transition tail 均 required。 |
| Existing API/domain/database contracts | Pass / unchanged | frozen digests、forbidden paths 和 regression gates 防止 LP-05 引入业务/API/migration drift。 |

## Data Flow And Lifecycle Review

- Candidate：exact Git snapshot → pinned build → inspected image/archive → canonical manifest → same-head gate。
- Authorization：read-only target/toolchain facts → canonical proposal digest → explicit user authorization → immutable
  single-use envelope → one attempt。
- External attempt：preflight → safety/fresh proof → migrate → app/HTTPS → initial story smoke → post-deploy backup →
  exact isolated restore → restored reads → production unchanged → public re-smoke → final evidence。
- Failure：oracle failure terminal，禁用 ingress；upgrade app rollback，fresh install 保留 DB/evidence 但不公开；
  不自动 down 或 production DB restore。
- Retention：immutable evidence 保留到 closure 后的独立 archival/deletion authority；active/final evidence 引用的
  backup 不因 seven-copy policy 被删除。

## Flow Diagram Review

- Diagram present: yes。
- Diagram adequacy: topology、startup、complete state graph 和 restore sequence 足以让开发者实现主路径、
  external boundary、failure、resume 与 equality validation。
- Recommended diagram changes: 无阻断更改；TPR-005 的 fresh DB identity state 对齐时同步状态标签即可。

## Implementation Readiness

- Clear implementation path: yes。
- Affected modules/components: `deploy/**`、`scripts/lp05/{shared,candidate,deploy,database,smoke}/**`、dedicated
  tests、CI、operations/evidence docs、README/CHANGELOG/project management/source plan。
- Open decisions developers would still need to make: 无架构级或安全级决定；仅 TPR-004/005 的明确机械修正。

## Verification Readiness

- Unit/authority：closed parsers、canonical digests、expiry/single-use、transition hashes、cross-record equality。
- Runtime/local：pinned non-root image、Compose/Caddy、secret scan、proxy contracts、DB failure、rollback。
- Database/evidence：two backup purposes、exact restore、migration/story equality、production unchanged、wrong/stale/
  local/empty/cross-record negative fixtures。
- External：单独授权后的 trusted HTTPS initial smoke、post-deploy backup/restore、production unchanged、post-restore
  re-smoke 与 final digest；local/fixture 不能替代。
- Minor follow-up tests：squash-merge provenance、fresh DB identity timing、initial transition encoding、
  `assertionSetSha256` canonical projection。

## Modification Recommendations

1. 在 Slice 1 开始时先以 contract tests 固定 TPR-004/005，避免后续 state/evidence fixtures 重写。
2. 保持当前 strict external authority/equality chain；不要为简化本地测试给 LOCAL/TEST_FIXTURE 增加 production parser 通道。

## Re-review Requirements

无计划级 re-review 要求。该 exact snapshot 可进入授权的 implementation GoalRun。TPR-004/005 必须在实现与
代码审查中按上述规则闭合；若实现需要改变 external state graph、authority semantics、public contract、
database migration 或授权范围，则返回 Requirements/plan review，而不是自行扩展。

## Review Evidence And Limitations

- `workflowctl.py status`：本任务为 ready Review；LP-05 Cycle 2、stage `PLAN_REVIEW_PENDING`。
- `workflowctl.py accept-plan-review`：request
  `0dbd4f427c1416d8a83224ecac6ede16657cb1c27a69640021f6140954b8829d` 有效，previous result binding 正确。
- remote feature branch 与 isolated review worktree HEAD 均为
  `9a1bcf42f428246ac7d11ab7f400adc133f10fc8`；创建前本地/远端 Cycle 2 review-record branch 不存在。
- SHA-256：requirements `06966791...`、design `9f1f7d23...`、implementation plan `1a5f2ab1...`，均匹配请求。
- 完整读取 requirements/design/implementation plan，并核对 Cycle 1 report、修订 diff、baseline ancestry、
  frozen artifacts、actual merge policy 与 plan-only scope。
- 本次只做 exact-snapshot re-review；没有修改 source plan、feature branch、服务器、DNS、secrets、release
  target、production data 或外部状态。
