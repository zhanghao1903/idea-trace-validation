# Requirements: LP-05 生产 OpenAPI 与连接 Handoff 一致性热修复

- Status: Confirmed
- FeatureId: lp-05-openapi-handoff-hotfix-8d3f6a1c2e90
- Branch: codex/lp-05-openapi-handoff-hotfix
- DeliveryMode: AGILE_REVIEWED
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-08-06T00:02:29Z
- Priority: P1
- Authoritative merged baseline: `31b5e42fa0c25fbc41d6a02f16abb64832861312`
- Current deployed source authority: `d181bf9a02a8c47da909050faa213fbc5efb71e7`
- Current deployed release: `lp05-d181bf9a02a8-amd64`

## Problem

生产站点 `https://idea.zhanghao.work` 的公开 liveness、readiness 和 OpenAPI 均可访问，
但客户端初始化所必需的非秘密 `DeploymentConnectionHandoffV1` 无法被部署方如实生成。
初始化因此以“缺少部署方生成的 handoff 文件”失败。

handoff 生成器从已部署 source commit 读取冻结的 `openapi/lp03.v1.json`，并要求其完整
canonical OpenAPI digest 与准备交付的运行时文档一致。当前冻结文档的完整 canonical digest
为 `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`，生产运行时文档
的完整 canonical digest 为
`5166c611797bb7be6fe6dc1964831c02aa6d27a1d1d460e4747556a2112bdb09`，所以生成器正确地
fail closed 并返回 `SOURCE_OPENAPI_MISMATCH`。

差异不是业务 API 或数据库故障，而是启用生产 Web 托管后，Swagger 把 6 条 SPA shell
路由加入了 `/openapi.json`；生成冻结文档时没有启用 Web 托管，因此文档中没有这些路由。
仓库中没有任何提交的 `openapi/lp03.v1.json` 与当前生产文档匹配。不能通过捏造 source
authority、放宽完整文档哈希或制作与事实不符的 handoff 绕过该问题。

## Current behavior

- 权威合并基线 `31b5e42fa0c25fbc41d6a02f16abb64832861312` 包含已合并的客户端初始化
  Skill、profile 与 handoff 生成器；canonical origin `codex/v0-1-project-plan` 精确指向该提交。
- 当前生产 release `lp05-d181bf9a02a8-amd64` 声明的 source authority 是
  `d181bf9a02a8c47da909050faa213fbc5efb71e7`。
- `scripts/openapi-support.ts` 构建用于生成冻结文档的 app 时没有配置 `webDistDir`。
- 生产 app 在存在 `webDistDir` 时注册 `/`、`/proposer`、`/executor`、
  `/proposer/projects/{projectId}`、`/executor/projects/{projectId}` 和
  `/confirmations/{confirmationId}` 六条 Web shell 路由；这些路由当前被 Swagger 收入运行时
  OpenAPI，但不在冻结文档中。
- `openapi/lp03.v1.json` 的完整 canonical digest 已从权威基线独立复算为
  `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`，并确认不含上述
  六条 Web 路由。
- 当前兼容性校验有意对完整 canonical OpenAPI 文档进行哈希，以覆盖 route、schema、security、
  actor 字段及所有被 Skill 消费的契约；该严格边界本身不是缺陷。
- 本次复现只读取公开 endpoint 与仓库事实：未生成 handoff、未读取 bearer、未执行生产写入或
  生产变更。

## Desired scenarios

1. 在启用真实 Web 静态托管的生产等价 app 中，`/openapi.json` 仍只描述机器可读 API，完整
   canonical 内容与同一 source commit 的 `openapi/lp03.v1.json` 一致。
2. 用户继续正常访问 6 条 SPA shell 路由和静态资源，但这些 Web 页面入口不再被宣称为公共
   API operation，也不影响 OpenAPI digest。
3. 部署方在一个新的、另行授权并验证成功的生产 release 后，能够从精确 release、source、
   Skill 和冻结 OpenAPI 事实生成合法的非秘密 `DeploymentConnectionHandoffV1`。
4. 若真实 API 的 path、method、schema、security 或其他完整文档内容发生未绑定漂移，handoff
   生成和客户端初始化仍 fail closed，不会因本热修复而接受不一致契约。
5. 未获得生产部署授权时，团队只能完成代码、隔离回归、候选重建和 proposal 准备，不能生成
   冒充当前生产事实的 handoff。

## Goals

- 恢复“冻结 OpenAPI 是机器可读 API 单一权威，生产运行时文档与其完整一致”的契约。
- 保持 6 条 Web shell 路由的用户可访问性，同时将它们与 Swagger/OpenAPI API contract 分离。
- 用启用真实 `webDistDir` 的生产等价回归防止生成环境与生产环境再次漂移。
- 保留 handoff/source/Skill 的严格 authority 绑定与完整文档哈希，不引入绕过路径。
- 为另行授权的新生产部署与后续非秘密 handoff 生成建立可验收前置条件。

## Delivery policy

用户已为本快照选择 `AGILE_REVIEWED`：Requirements、Main 和 Review 参与交付；Main 绑定
已提交计划，Review 对精确代码 head 进行风险聚焦审查，仅 critical findings 阻塞。以下为已
展示的模式及差异：

- `AGILE`：Requirements + Main；Main 绑定已提交计划，并在精确 PR head 上记录 required CI 与
  核心旅程 smoke，不使用独立 Review。
- `AGILE_REVIEWED`：Requirements + Main + Review；Main 绑定计划，Review 对精确代码 head
  进行一次风险聚焦审查，仅 critical findings 阻塞；major/minor 作为 durable advisory notes。
- `STRICT`：Requirements + Main + Review；独立 Review 必须批准精确计划，并对代码执行完整
  blocker/major remediation policy。

选择只改变评审深度，不改变精确快照、required CI、merge policy、Goal serialization、发布
授权或 durable history 门禁。

## Requirements

- `REQ-01`：启用 Web 托管时，运行时 `/openapi.json` 必须与同一 source commit 的冻结
  `openapi/lp03.v1.json` 保持完整 canonical 一致。
- `REQ-02`：6 条 SPA shell 路由必须继续提供现有 Web 页面行为，但不得作为机器可读 API
  operation 出现在 Swagger/OpenAPI 文档中。
- `REQ-03`：冻结 OpenAPI 与运行时 OpenAPI 必须继续采用完整文档 canonical digest；不得改成
  route 子集、兼容性投影白名单、忽略 additive route 或弱化 schema/security 的比较。
- `REQ-04`：真实业务 API 的 path、method、parameter、request/response schema、security
  declaration 和 error contract 不得因该热修复发生产品级改变。
- `REQ-05`：生产等价验证必须在非空且实际可服务 Web shell/asset 的 `webDistDir` 条件下运行，
  不能只复用未配置 Web 托管的 OpenAPI generator 路径。
- `REQ-06`：handoff 生成器继续验证 source commit 中的冻结 OpenAPI、Skill commit/tree、Skill
  version、release facts 与完整 OpenAPI digest；错误 authority 仍被拒绝。
- `REQ-07`：本 feature 不改变 initializer 的 fail-closed 行为，也不读取、生成、轮换或交付 raw
  AI bearer 或 human-control credential。
- `REQ-08`：当前生产 release、失败复现、既有候选/proposal/deployment 与 lifecycle 历史保持
  不变；不得回写历史来制造一致性。
- `REQ-09`：合并后必须从新的精确提交重建候选并准备新的 proposal；生产部署、外部 handoff
  交付和客户端生产初始化分别需要后续明确授权。

## Acceptance criteria

1. `AC-01`：权威基线测试确认冻结 `openapi/lp03.v1.json` 的完整 canonical digest 为
   `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`，且不包含 6 条
   SPA shell 路由。
2. `AC-02`：生产等价 app 使用存在 `index.html` 和静态 asset 的真实非空 `webDistDir` 启动后，
   `/openapi.json` 与生成/提交的 `openapi/lp03.v1.json` 完整 canonical 相等，digest 也精确相等。
3. `AC-03`：同一生产等价 app 中，`/`、`/proposer`、`/executor`、
   `/proposer/projects/:projectId`、`/executor/projects/:projectId`、
   `/confirmations/:confirmationId` 均继续返回现有 Web shell 行为；对应 OpenAPI path 不存在。
4. `AC-04`：Web asset 的服务、deep-link、cache-control、CSP 和未知 Web/API route 的 404 边界
   保持现有回归通过。
5. `AC-05`：冻结文档的所有既有 API path、method、schema、security scheme 与错误契约在修复
   前后没有非预期变化，`npm run openapi:check` 通过。
6. `AC-06`：回归明确证明比较的是完整 canonical 文档；任一真实 API path/method、schema、
   security declaration 的增加、删除或修改都会产生不同 digest 并 fail closed。
7. `AC-07`：若任一 Web shell 路由重新进入 Swagger/OpenAPI，生产等价一致性回归失败；测试不能
   通过删除 expected path、放宽 digest 或只检查 required route 子集规避。
8. `AC-08`：隔离的 release fixture 使用匹配的 source commit、Skill commit/version、冻结
   OpenAPI 和 release facts 时能生成 schema-valid、无秘密的 `DeploymentConnectionHandoffV1`；
   错误 source 或 digest 继续返回 `SOURCE_OPENAPI_MISMATCH`。
9. `AC-09`：handoff 生成与上述测试不读取 bearer、不生成 credential、不执行业务或生产写入，
   输出与日志不包含 token、Authorization header、human-control credential 或数据库 secret。
10. `AC-10`：相关 static-host、OpenAPI、client-profile unit/integration 测试以及项目 required CI
    全部通过；不得跳过或放宽既有 secret、auth、source/Skill authority 门禁。
11. `AC-11`：当前 `lp05-d181bf9a02a8-amd64`、source authority `d181bf9a…`、已观察的两个 digest、
    失败代码和“未生成 handoff”事实以追加方式保留，不被改写或冒充已修复。
12. `AC-12`：合并后从新的精确 commit 构建候选并形成新 proposal；旧候选、旧 proposal 或当前
    人工部署不得被复用为已包含热修复的证据。
13. `AC-13`：只有在用户独立授权并成功部署新候选、再度观察 live/readiness/OpenAPI 且证明
    runtime digest 与新 source 冻结文档一致后，才可生成绑定该新 release 的生产
    `DeploymentConnectionHandoffV1`。
14. `AC-14`：需求确认、handoff、计划/代码批准、合并、测试或候选构建均不构成生产访问、部署、
    release、handoff 外部交付、token 操作、tag、package、registry、GitHub Release 或 Skill
    发布授权。

## Non-goals

- 不把完整 OpenAPI 哈希改为 required-operation 子集或忽略 additive route。
- 不为当前生产文档伪造、回填或挑选一个不存在的 source commit。
- 不把 SPA shell/static routes 纳入公共机器可读 API contract，也不重新设计 Web 页面或路由。
- 不改变业务 API、数据库 schema、migration、认证授权、actor attribution 或 human-control
  边界。
- 不重新设计 `DeploymentConnectionHandoffV1`、ClientConnectionProfile、initializer、Skill
  安装或 credential 轮换契约。
- 不在 Requirements、实现或 merge 阶段连接/修改生产、生成生产 handoff、读取 bearer、执行
  生产 smoke/write、部署或发布。
- 不处理 migration ledger 分类、PostgreSQL `55P03` 诊断或其他 LP-05 follow-up。

## Failure and recovery expectations

- 若生产等价 runtime 与冻结 OpenAPI 仍不一致，修复不得交付为通过；生成器和 initializer 保持
  fail closed，并只报告不含秘密的 bounded error/digest evidence。
- 若排除 Swagger 暴露导致任一 SPA shell、asset、cache 或 CSP 行为回归，必须修复 Web 回归，
  不能通过把 Web route 重新加入 OpenAPI 达成表面通过。
- 若实现发现当前生产差异不只包含已知 6 条 Web route，停止 handoff 生成，记录完整非秘密 diff，
  返回 Requirements 重新评估，不能扩大忽略范围。
- 若未来有真实 API 变更，必须生成并提交新的版本化 OpenAPI authority、重建候选并重新绑定
  release；不得让本热修复把合法变化静默吞掉。
- 若新候选部署失败，沿用既有 LP-05 rollback/attempt 规则；失败部署不能生成生产 handoff。
- 若部署后再次出现 source/runtime mismatch，保留部署和诊断历史，停止客户端初始化，创建独立
  缺陷流程，不覆盖既有 handoff 或 profile。

## Public API and compatibility impact

- 预期没有业务 API、OpenAPI API surface、schema、security 或 error contract 变化。
- 运行时 `/openapi.json` 将不再暴露 6 条 HTML SPA shell route；这些 route 从未存在于冻结
  `openapi/lp03.v1.json`，也不是客户端业务 API，因此该变化恢复而非扩大 canonical contract。
- 现有 Web URL、静态资源、Codex/Claude Skill、initializer、profile schema 与 actor attribution
  保持兼容。
- 若必须修改任何公共业务 API 或 handoff/profile schema 才能实现，Main 必须带证据返回
  Requirements，不能顺带扩大本热修复。

## Safety, privacy, permissions, and authorization

- 所有诊断与验收只使用公开 endpoint、仓库内容、非秘密 digest 和隔离 fixture；不得请求、读取、
  打印或保存 raw AI bearer、human-control token、cookie、SSH/DNS/database credential。
- `/openapi.json` 的完整 security declarations 继续被哈希；不得因修复 Web route 漂移而弱化
  AI write bearer 或 human-confirmation boundary。
- `DeploymentConnectionHandoffV1` 是非秘密 integrity envelope，不是 credential、生产访问或发布
  授权；其 source/release/Skill/digest 字段必须来自可验证事实。
- 当前生产 endpoint 可公开读取不授权写操作、credential usability 验证、token 轮换或生产变更。
- 测试与文档必须使用无效占位符或隔离 secret，不得把真实 production facts 与真实 secret 组合
  进 Git、日志、prompt、URL 或验收证据。

## Release impact

- 本热修复合并后必须从精确新提交重建 candidate 并形成新的 proposal，不能复用
  `lp05-d181bf9a02a8-amd64` 或任何旧 proposal。
- 新 candidate 的生产部署仍受 LP-05 `RELEASE_AWAITING_AUTHORIZATION` 与显式 per-release
  authorization 约束；本需求不授予该权限。
- 部署成功后，操作者先重新验证公开 liveness/readiness/OpenAPI 与 exact source authority；只有
  digest 一致才可生成非秘密生产 handoff。
- handoff 与 raw bearer 仍通过不同渠道交付。是否复用现有 credential identity 由既有过期、
  泄露、scope 与轮换策略决定，本热修复不触发或授权 token 轮换。

## Assumptions

- `ASM-01`：Main 提供的生产复现证据可信且截至 2026-08-06 未发生后续生产变更；任何后续 live
  变化必须重新观察，不能沿用旧 digest。
- `ASM-02`：仓库独立核验已确认 `31b5e42…` 是 canonical origin 当前合并 tip，冻结文档 canonical
  digest 为 `5b2c…adb7`，代码只在启用 `webDistDir` 时注册已知 6 条 Web shell 路由。
- `ASM-03`：这 6 条 route 是 HTML shell/deep-link 入口，不是外部客户端应消费的 API operation。
- `ASM-04`：业务 API 契约在本热修复中不需要合法变更；若该假设不成立，必须回到 Requirements。
- `ASM-05`：优先级为 P1；优先级不构成紧急生产变更、绕过评审或发布授权。

## Traceability

| Source fact / user need | Requirements | Acceptance criteria |
| --- | --- | --- |
| 初始化因缺少 handoff 失败 | `REQ-01`, `REQ-06` | `AC-02`, `AC-08`, `AC-13` |
| 生产 runtime 与 source OpenAPI digest 不同 | `REQ-01`, `REQ-03` | `AC-01`, `AC-02`, `AC-05`–`AC-07` |
| 差异仅为 6 条 Web shell route | `REQ-02`, `REQ-05` | `AC-02`–`AC-04`, `AC-07` |
| 不弱化完整 API/schema/security 哈希 | `REQ-03`, `REQ-04`, `REQ-06` | `AC-05`–`AC-10` |
| 不伪造 source 或改写历史 | `REQ-06`, `REQ-08` | `AC-08`, `AC-11`, `AC-12` |
| 部署后才能生成生产 handoff | `REQ-09` | `AC-12`–`AC-14` |

## Open questions

None. `DEC-01` 已由用户明确选择 `AGILE_REVIEWED`；当前没有其他产品范围或授权问题。
