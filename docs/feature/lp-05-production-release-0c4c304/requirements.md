# Requirements: LP-05 0c4c304 生产版本发布

- Status: Confirmed
- FeatureId: lp-05-production-release-0c4c304-7b1e9a4d2c60
- Branch: codex/lp-05-production-release-0c4c304
- DeliveryMode: AGILE_REVIEWED
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-08-06T05:21:44Z
- Canonical source commit: `0c4c30410e9a2cc2c848047214654ab9df2585a2`
- Canonical source tree: `e95778ede5ed3b947c37a1a4129374a63195b452`
- Production target: `idea.zhanghao.work` / `115.29.237.117`
- Candidate platform: `linux/amd64`

## Problem

用户已在 Main 任务表达“发布新版本”的明确意图，但当前生产站点仍运行未包含最新 OpenAPI
一致性热修复的旧版本。公开读取显示 `https://idea.zhanghao.work/health/ready` 当前为 ready，
但线上 `/openapi.json` 仍包含 6 条应从 Swagger 隐藏的 SPA shell path；这证明已合并的新版本
尚未部署，客户端仍无法基于真实生产 source/runtime 生成可信的连接 handoff。

最新可发布代码已经通过 PR #10 的精确 head 审查、合并和 required checks。下一步需要把
exact merge commit 构建为新的 `linux/amd64` 候选，使用既有 LP-05 生产升级控制器完成备份、
迁移、部署、恢复与回滚门禁，并在部署后生成非秘密 `DeploymentConnectionHandoffV1`。

发布意图不能替代尚未存在的候选 manifest、`DeploymentProposalV1` 和 `proposalSha256`。
本需求确认只授权 Main 进入计划、候选构建和 proposal 准备；生产变更前仍必须把精确候选、
目标、操作集和摘要呈现给用户，并获得单独的 per-release 明确授权。

## Current behavior

- canonical branch `codex/v0-1-project-plan` 已独立核验精确指向
  `0c4c30410e9a2cc2c848047214654ab9df2585a2`，tree 为
  `e95778ede5ed3b947c37a1a4129374a63195b452`。
- PR #10 的 exact reviewed head `ef4485b6d25c9f799c9422d45b96b6e38c78c3e1` 已 APPROVE/MERGED；
  merge commit 的 `verify` 与 `lp05-candidate` checks 为 SUCCESS。
- 最新 frozen `openapi/lp03.v1.json` 文件 SHA-256 为
  `fe853576812ae5d133f6d2880c3b2d3cb07de3f7dbe49471953d4bb6105cd18c`；完整 canonical
  OpenAPI digest 为 `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`。
- Main 于 2026-08-06 独立观察到生产 ready，live OpenAPI 响应 SHA-256 为
  `671b690c98b4accd48d73980e28743f1baa6c2460966fcc677bfbf66bb9349f2`，且仍暴露 `/`、
  `/proposer`、`/executor`、`/proposer/projects/{projectId}`、
  `/executor/projects/{projectId}`、`/confirmations/{confirmationId}`；现状不得被写成已部署 hotfix。
- 已关闭的 `lp-05-openapi-handoff-hotfix-8d3f6a1c2e90` 只证明代码和隔离回归通过，最终 disposition
  为 `ACCEPTED_NO_PUBLISH`；它不拥有本次生产发布。
- 旧 `lp-05-deployment-release-8c3f1a6d5e20`、merge `99734e8…`、既有 proposal、失败 attempt、
  rollback/manual cleanup 和当前生产 release 均为历史事实，不是最新 candidate source。
- 仓库已有受校验的 LP-05 candidate、proposal/envelope、备份、迁移、active attempt journal、
  ownership、smoke、隔离恢复、rollback 和 evidence 契约；本 feature 不需要新建发布引擎。

## Desired scenarios

1. Main 从 exact merge `0c4c304…` 构建并验证一个不可变 `linux/amd64` 候选，生成确定的
   `releaseId`、manifest、image/archive identity 和 `manifestSha256`。
2. Main 将绑定该候选、`idea.zhanghao.work`、`115.29.237.117`、previous release、备份策略、
   operation/exclusion 集合的完整 proposal 与 `proposalSha256` 呈现给用户；只有用户明确绑定该
   摘要授权后才开始一个生产 attempt。
3. 已授权升级沿用既有 LP-05 顺序完成安全备份、显式迁移、应用/HTTPS readiness、真实 smoke、
   post-deploy backup、隔离恢复和 post-restore smoke；所有阶段写入同一不可变 attempt journal。
4. 部署后公开 health、Web、API 与完整 OpenAPI 一致性通过；6 条 SPA route 继续提供页面，但
   不再出现在 Swagger/OpenAPI 中。
5. 部署方基于实际新 release/source/Skill/OpenAPI 生成并验证非秘密
   `DeploymentConnectionHandoffV1`，客户端可在后续流程引用它；raw bearer 与 human-control
   credential 始终通过独立安全渠道保管。
6. 任一门禁失败时不把新版本标记为已发布；控制器按既有 upgrade rollback 规则恢复上一精确
   应用版本、保留数据和追加历史，不执行 fresh-install 资源删除或历史改写。

## Goals

- 把 exact merge `0c4c304…` 作为唯一新生产 candidate source 发布到指定域名/IP。
- 复用并证明现有 LP-05 升级、备份、迁移、恢复、回滚和 evidence 契约，而不引入 ad-hoc 操作。
- 用真实生产观察证明 OpenAPI hotfix 已生效且完整 live/frozen contract 一致。
- 为客户端生成与实际部署绑定、可验证且不含秘密的连接 handoff。
- 保留“需求确认、候选 proposal 授权、部署证据与最终 lifecycle 接受”之间的独立门禁。

## Delivery policy

用户已为本快照选择 `AGILE_REVIEWED`：Requirements、Main 和 Review 参与交付；Main 绑定
已提交计划，Review 对精确交付 head 进行风险聚焦审查，仅 critical findings 阻塞。以下为已
展示的模式及差异：

- `AGILE`：Requirements + Main；Main 绑定已提交计划，并在精确 PR/candidate authority 上记录
  required checks 与核心发布旅程 smoke，不使用独立 Review。
- `AGILE_REVIEWED`：Requirements + Main + Review；Main 绑定计划，Review 对精确交付 head
  进行一次风险聚焦审查，仅 critical findings 阻塞；major/minor 保留为 durable advisory notes。
- `STRICT`：Requirements + Main + Review；独立 Review 必须批准精确计划，并对代码/发布载体
  执行完整 blocker/major remediation policy。

交付方式只改变评审深度，不改变 exact source/candidate、required CI、merge、Goal、proposal
摘要授权、生产资源 ownership、发布策略或 durable history 门禁。

## Requirements

- `REQ-01`：生产 candidate 的 source commit/tree 必须分别精确为 `0c4c304…` 和 `e95778e…`，
  platform 为 `linux/amd64`；不得使用 `99734e8…`、feature head、dirty tree 或浮动 tag/latest。
- `REQ-02`：candidate 必须由现有受校验生成器构建并通过 manifest、OCI archive/image、base image、
  migration catalog、Web/OpenAPI digest、synthetic-only 和 required verification 校验。
- `REQ-03`：生产目标必须精确绑定 `idea.zhanghao.work` 与 `115.29.237.117`；任何域名、IP、平台、
  candidate、previous release 或 operation 变化都需要新 proposal 和新授权。
- `REQ-04`：Main 必须先呈现完整 closed `DeploymentProposalV1` 与 `proposalSha256`；用户对本需求
  的确认和当前“发布新版本”意图都不能替代对该 exact digest 的 per-release 授权。
- `REQ-05`：授权 envelope 必须沿用既有 source-task、过期时间、单 attempt、operations 与
  excluded operations 边界；失败、过期或漂移后不得复用。
- `REQ-06`：此次操作按 upgrade 对待，必须在迁移前验证 safety backup，并沿用显式 migration、
  readiness、HTTPS、smoke、post-deploy backup、隔离 restore 与 post-restore smoke 顺序。
- `REQ-07`：生产/恢复容器、network、volume、数据库 identity 和备份只按既有 exact label/ID/name
  ownership 契约观察和操作；不得使用广域删除、项目级盲目清理或 caller-authored PASS。
- `REQ-08`：upgrade 失败只允许恢复 previous exact app/image/config 并保留 additive migration
  与生产资源；不得套用 fresh-install 零数据资源删除权限，也不得自动恢复生产数据库。
- `REQ-09`：成功条件必须包括公开 health、HTTPS/Web/API、完整 canonical live/frozen OpenAPI
  equality、6 条 SPA shell route 可访问且不出现在 OpenAPI、完整 synthetic journey 和恢复后复验。
- `REQ-10`：生产 handoff 只能在 attempt 达到可信部署终态且实际 release/source/OpenAPI 已复核后
  生成；其 release、source、Skill tree/version、credential identity 和 digest 必须来自真实事实。
- `REQ-11`：handoff/profile/evidence/proposal/journal 不得包含 raw AI bearer、Authorization header、
  `HUMAN_CONTROL_TOKEN`、confirmation cookie、数据库 URL/password、SSH/DNS secret 或私密正文。
- `REQ-12`：本次发布不自动轮换或生成 AI/human credential；如到期、泄露、scope 变化或策略要求
  轮换，必须停止并走独立 credential rotation 授权流程。
- `REQ-13`：全部旧 candidate/proposal/attempt/rollback/manual cleanup/release 和 lifecycle 记录保持
  原样追加保存；不得重命名、重写、删除或把旧证据归属到新 release。
- `REQ-14`：本 feature 只发布现有已合并代码。若候选构建、preflight 或部署揭示需要 runner、
  schema、应用或 migration 代码修复，停止发布并创建独立 Requirements feature，不在服务器临时补丁。

## Acceptance criteria

1. `AC-01`：candidate manifest 证明 `sourceCommit=0c4c304…`、`sourceTree=e95778e…`、
   `platform=linux/amd64`，且确定性 release ID 为 `lp05-0c4c30410e9a-amd64`；manifest/image/archive
   identity 和 required checks 全部通过。
2. `AC-02`：candidate 的 frozen OpenAPI file SHA-256 精确为 `fe853576…`，完整 canonical digest
   精确为 `5b2cbcd…`；Web assets、migration catalog 和 synthetic-only 标识均由 manifest 验证。
3. `AC-03`：生产 mutation 前，Main 展示 exact proposal JSON 与 `proposalSha256`，其 candidate、
   target domain/IP、platform、previous release、backup policy、mandatory operations 与 exclusions
   全部闭合；用户另行明确引用该 digest 授权。
4. `AC-04`：preflight 在 mutation 前重新读取目标、DNS/TLS、toolchain、candidate、current release、
   Compose/resource/database identity 与可用备份条件；任何不一致不启动 attempt。
5. `AC-05`：升级 attempt 在同一有效 envelope/journal 内完成并验证 pre-migration safety backup、
   migration、app ready、HTTPS ready、initial external smoke、post-deploy backup、isolated restore、
   production unchanged 和 post-restore external smoke 后，才进入 `DEPLOYED`。
6. `AC-06`：部署后 `/health/live`、`/health/ready`、核心公开 API、proposer/executor/project/
   confirmation Web 页面与 LP-04 synthetic journey 全部通过，TLS、安全头、cache 和请求边界保持。
7. `AC-07`：部署后 live `/openapi.json` 与 `0c4c304…:openapi/lp03.v1.json` 深度/完整 canonical
   相等，digest 为 `5b2cbcd…`；6 条 SPA shell path 在浏览器仍返回页面但不在 OpenAPI paths 中。
8. `AC-08`：post-deploy backup 被验证并恢复到严格隔离环境；migration checksums、synthetic story、
   resource/assertion identities 相等，生产资源 before/after byte-equal，隔离资源按 exact ownership
   清理。
9. `AC-09`：任一阶段失败时 evidence 不声称发布成功；既有 rollback 使 previous app 恢复 ready
   或准确记录 `ROLLBACK_FAILED`，不删除 upgrade 生产数据/资源、不做 down migration/生产 restore。
10. `AC-10`：成功部署后生成 schema-valid `DeploymentConnectionHandoffV1`，绑定实际
    `lp05-0c4c30410e9a-amd64`、source `0c4c304…`、匹配的 Skill authority 与 canonical OpenAPI
    digest；错误 source/tree/version/digest 继续 fail closed。
11. `AC-11`：handoff 生成器不访问 bearer，生成/验证输出及所有 proposal、journal、evidence、
    日志和 Git secret scan 均不含 AI/human token 或其他生产 secret；handoff 与 bearer 分渠道。
12. `AC-12`：完整 deployment evidence bundle 离线校验 PASS，并绑定同一 candidate、target、attempt、
    backup/restore、smoke、OpenAPI、times 和 known limitations；caller-authored observation 不能替代
    external active oracle。
13. `AC-13`：旧 merge `99734e8…`、旧 production release、全部历史 proposal/attempt/cleanup 与
    closed hotfix 记录保持原样；新 evidence 只追加并精确归属于本 feature/candidate。
14. `AC-14`：除 exact production upgrade 与部署后非秘密 handoff 外，不创建或发布 tag、GitHub
    Release、package、registry image、Skill marketplace artifact，不修改 DNS，不执行生产 DB restore，
    除非这些 operation 另有独立明确授权。
15. `AC-15`：部署成功和 evidence PASS 不自动构成最终 lifecycle 接受/关闭；Main 按 Lifecycle
    呈现精确 merge/deployment/evidence 结果，完成对应 acceptance/closure 记录。

## Non-goals

- 不重新实现或扩展 LP-05 deployment controller、authorization engine、attempt journal、backup、
  restore、rollback、resource ownership 或 evidence schema。
- 不修复新的代码、migration、runner 或生产配置缺陷；发现缺陷即停止并进入独立 feature。
- 不把 `99734e8…`、旧候选、旧 proposal 或旧生产 evidence 包装成 `0c4c304…` 的发布证据。
- 不进行 DNS 变更、服务器迁移、操作系统升级、容器运行时升级、生产 DB restore 或凭据轮换。
- 不创建 tag、GitHub Release、package、registry/marketplace 发布或对外 Skill 新版本。
- 不导入真实公司、客户、个人或商业敏感数据；公开站点继续只承载允许公开读取的合成数据。
- 不改变公共 API、数据库 schema、Web 产品功能、initializer/profile/handoff schema 或权限边界。

## Failure and recovery expectations

- 候选构建/验证失败：不生成 proposal，不从 dirty tree、旧 merge 或临时镜像继续。
- proposal 未获 exact digest 授权、授权过期或 target/candidate/operation 漂移：不启动生产 mutation，
  重新生成 proposal 并重新请求授权。
- preflight、备份、migration、readiness、HTTPS、smoke 或 restore 失败：停止 forward progress，保留
  当前服务和 evidence，按既有 upgrade rollback 规则恢复 previous app。
- OpenAPI 仍不相等或仍暴露任一 SPA shell path：部署不视为成功，不生成生产 handoff；保留完整
  非秘密 diff/digest 并创建独立缺陷 feature。
- rollback/cleanup 证据不完整、ownership 漂移或外来资源出现：fail closed 为
  `ROLLBACK_FAILED`，停止自动操作并要求人工调查；不得扩大删除范围。
- secret 疑似进入输出、日志、Git 或 evidence：停止发布/handoff 交付，按独立安全流程轮换受影响
  credential，并保留事件历史。
- handoff 生成或 authority 验证失败：生产部署事实保持不变，但客户端交付未完成；不得手工编辑
  handoff 绕过 source/Skill/OpenAPI 绑定。

## Public API and compatibility impact

- 预期不修改公共 API、OpenAPI artifact、database schema、migration、Web URL、Skill 或
  client-profile/handoff schema；这是现有 merge 的生产升级。
- 发布后 `/openapi.json` 恢复与 frozen API contract 完整一致，6 条 HTML shell route 继续作为
  Web 入口但不宣称为 API operation。
- 公开 GET、AI bearer write、human-control token/scoped confirmation cookie、actor attribution、
  idempotency 与 request-version 语义保持不变。
- 若真实生产环境需要任何产品/contract 修改才能通过，必须返回 Requirements，不能把部署 feature
  扩成兼容性开发。

## Safety, privacy, permissions, and authorization

- 用户的“发布新版本”是明确发布意图，但当前尚无 exact candidate manifest/proposal digest；它不
  授权未知字节、未知 operations 或漂移目标的生产 mutation。
- Requirements 确认、handoff、计划/代码审查、候选构建或 proposal 生成均不替代用户对
  `proposalSha256` 的单独明确授权。
- 生产访问只允许在有效 envelope 下针对 `idea.zhanghao.work` / `115.29.237.117` 执行 proposal
  列出的最小操作；先只读核验，再按 attempt journal 有界变更。
- secret 只从仓库外受限配置读取，绝不进入 prompt、CLI 参数、Git、镜像层、URL、普通日志、
  screenshot、proposal、handoff 或 evidence；AI 客户端永不接触 human-control credential。
- 备份、数据库、容器、network、volume 与恢复环境继续遵守 exact identity/ownership、隔离和最小
  删除边界；生产 DB restore 始终需要新的 destructive-operation proposal 和授权。
- non-secret handoff 是 release integrity envelope，不是 bearer、认证、部署权限或发布授权。

## Release impact

- 本 feature 的唯一默认 release target 是将 exact candidate `lp05-0c4c30410e9a-amd64` 升级到
  `https://idea.zhanghao.work` 对应服务器，并在成功后生成该 release 的非秘密连接 handoff。
- 当前 Draft/后续 Requirements 确认只允许准备 candidate/proposal；Main 必须在 candidate 实际
  构建后呈现 exact `proposalSha256` 并获得独立 per-release 授权。
- 授权 envelope 最多启动一个有界 attempt；失败、过期或漂移必须新建 proposal/授权，不能继续
  使用用户当前的自然语言发布意图。
- 成功 evidence 必须追加保留；旧失败部署、manual cleanup、retired proposal、current/previous
  release 与 lifecycle history 不得覆盖或删除。
- tag、GitHub Release、package、registry、Skill 发布、DNS 变更、credential rotation 和生产 DB
  restore 不属于默认 target。

## Assumptions

- `ASM-01`：`0c4c304…` / `e95778e…` 是截至本快照的 canonical latest merge/tree；若 canonical
  branch 前进，仍不得静默换 source，必须返回 Requirements 或新建 release feature。
- `ASM-02`：目标仍是现有单机 Linux `amd64` 生产服务器 `115.29.237.117` 和域名
  `idea.zhanghao.work`；DNS、TLS 和运行时访问材料由既有仓库外安全通道维护。
- `ASM-03`：当前生产是 upgrade target，包含需要保留的数据/资源和可识别 previous release；
  fresh-install cleanup 权限不适用。
- `ASM-04`：公开实例继续只承载获准的合成演示数据；本 feature 不授权导入真实敏感数据。
- `ASM-05`：现有 LP-05 controller、backup/restore、rollback、journal、ownership 和 evidence 契约
  已由此前 features 验证，本次只复用，不扩大或改写。
- `ASM-06`：用户愿意在 candidate 构建并展示 exact proposal 后，再次明确授权该
  `proposalSha256`；若未授权，feature 安全停留在 release awaiting authorization。

## Traceability

| Source / user intent | Requirements | Acceptance criteria |
| --- | --- | --- |
| 发布最新 `0c4c304…`，不得复用 `99734e8…` | `REQ-01`, `REQ-02`, `REQ-13` | `AC-01`, `AC-02`, `AC-13` |
| 精确目标域名/IP/platform | `REQ-03`, `REQ-05` | `AC-03`, `AC-04` |
| 复用 LP-05 安全部署/恢复契约 | `REQ-06`–`REQ-08` | `AC-05`, `AC-08`, `AC-09`, `AC-12` |
| 部署后证明 hotfix 与完整 OpenAPI equality | `REQ-09` | `AC-06`, `AC-07` |
| 生成非秘密 DeploymentConnectionHandoffV1 | `REQ-10`–`REQ-12` | `AC-10`, `AC-11` |
| 需求确认不替代 exact proposal 授权 | `REQ-04`, `REQ-05` | `AC-03`, `AC-14`, `AC-15` |

## Open questions

None. `DEC-01` 已由用户明确选择 `AGILE_REVIEWED`。Exact candidate `manifestSha256`、
image/archive identity 与 `proposalSha256` 只有构建/验证后才产生；它们不是当前 Requirements
的可预填值，但在生产 mutation 前必须由 Main 展示并获得独立授权。
