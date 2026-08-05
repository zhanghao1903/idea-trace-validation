# Requirements: LP-05 客户端连接资料与初始化 Skill

- Status: Confirmed
- FeatureId: lp-05-client-connection-profile-6a2d9f4c1b70
- Branch: codex/lp-05-client-connection-profile
- DeliveryMode: AGILE_REVIEWED
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-08-05T05:02:28Z
- Priority: P1
- Authoritative baseline: `d181bf9a02a8c47da909050faa213fbc5efb71e7`
- Related production state: `idea.zhanghao.work` is `ONLINE_WITH_RECORDED_ISSUES`

## Problem

当前 Idea Validation Skill 能指导 Codex、Claude 等客户端调用现有 API，但客户端在真正使用
之前仍缺少一个明确、可重复且安全的初始化入口。现有文档只要求从 secure operator
configuration 接收 API base URL 和 AI bearer credential，没有定义客户端如何完成初次配置、
如何验证配置、如何保存非秘密连接资料、如何安全引用 token，也没有把调用方署名固定为可
复用的双字段契约。

发布侧同样没有稳定的客户端连接交付物。每次部署后，操作者无法直接得到一个绑定实际 URL、
release、Skill 版本和 credential identity 的非秘密 profile；raw token 的交付、复用、过期和
轮换边界也没有统一约定。这使客户端安装依赖临时说明，容易使用错误地址、错误版本、过期
凭据或不一致署名，并增加 token 被粘贴到 prompt、日志或仓库的风险。

本 feature 需要提供一个独立的初始化 Skill/初始化流程，要求配置网站地址、AI token 的安全
来源以及双字段署名，并生成可由现有业务 Skill 使用的客户端连接资料。它不改变现有业务
权限，不把署名当作认证，也不授权生成生产凭据或再次发布。

## Current behavior

- 权威代码基线为 `d181bf9a02a8c47da909050faa213fbc5efb71e7`。
- `skills/idea-validation-workflow/references/client-setup.md` 仅说明 base URL 和 AI bearer 必须
  来自安全 operator configuration；没有初始化 Skill、稳定环境变量名、连接 profile schema、
  本地安全引用或重新初始化规则。
- 当前 Skill 支持 Codex 和 Claude/兼容 Markdown-Skill 客户端，但安装说明只覆盖加载 Skill，
  没有统一的连接配置与验证示例。
- 公共写入契约已有 AI actor 的 `client` 与 `displayName` 字段；它们用于归属和审计，不是
  authentication、authorization 或 permission evidence。部分服务端生成的归属仍由部署配置
  `AI_WRITE_CLIENT`、`AI_WRITE_DISPLAY_NAME` 决定，客户端不得伪造服务端拥有的身份。
- 普通公开 Web 和 GET 读取不要求 token；AI 写操作要求 AI bearer。`HUMAN_CONTROL_TOKEN`
  与 scoped confirmation cookie 属于独立人类控制边界，现有 Skill 明确禁止接收或使用它们。
- 当前部署 `idea.zhanghao.work` 已通过人工授权上线并标记为
  `ONLINE_WITH_RECORDED_ISSUES`。该事实不是本 feature 的代码修复、需求确认、token 交付或
  发布授权。

## Desired scenarios

1. 用户安装初始化 Skill 后，为一个客户端提供生产网站地址、安全 token 来源、稳定
   `clientId` 和可读 `displayName`；初始化流程校验输入并生成不含秘密的连接 profile。
2. Codex 或 Claude 加载现有业务 Skill 时读取同一份已初始化连接资料，不需要用户再次在
   prompt 中粘贴 URL、token 或署名，也不会因客户端不同而分叉业务决策流程。
3. 初始化流程能区分“网站/OpenAPI 已验证”“credential 已安全配置”和“credential 已在
   隔离验证中证明可用”，不以 token 格式或公开 GET 成功冒充认证成功。
4. 现有业务 Skill 发起允许的 AI 写操作时，从 profile 使用 `clientId` 与 `displayName` 填充
   公共契约允许的调用方归属，并在读取结果/审计记录中观察到相同值；署名不提升权限。
5. 每次部署向操作者提供与实际 release 绑定的非秘密 ClientConnectionProfile，以及独立的
   token 安全交付或既有 credential 引用。token 未过期、未泄露且权限未变化时不强制轮换。
6. token 过期、泄露、权限变化或明确策略触发轮换后，操作者更新安全 credential，重新初始化
   或刷新 profile 绑定；旧 token 失效且不会残留在 profile、输出、日志或示例中。
7. base URL 错误、OpenAPI 不兼容、token 缺失/错误、profile 与 release 不匹配、署名非法或
   用户误提供 human-control credential 时，初始化或业务 Skill fail closed，并给出不泄密的
   修复提示。

## Goals

- 提供一个独立、可发现的客户端初始化 Skill/流程，统一收集并验证网站地址、AI credential
  安全来源、`clientId` 和 `displayName`。
- 定义一个不含秘密、可版本化并绑定 release/Skill/credential identity 的
  ClientConnectionProfile，供 Codex、Claude 和兼容客户端共同使用。
- 让部署后的连接资料与 token 交付/引用可重复、可轮换、可验证，同时避免每次发布无意义地
  强制更换 token。
- 保持 AI bearer、human-control credential、公开读取和 actor attribution 的既有权限边界。
- 通过真实客户端加载与隔离 API 回归证明“初始化后可用”，而不是只验证静态文档或 mock。

## Delivery policy

用户已为本 Draft 选择 `AGILE_REVIEWED`，优先级为 P1：Main 负责提交计划并绑定所选模式；
Review 对精确代码 head 做一次风险聚焦审查，仅 critical findings 阻塞。导致产品不能完成
核心初始化/调用旅程、秘密或权限边界破坏、核心需求不满足、核心回归、不可逆不安全行为或
required CI 失败的问题属于 critical；major/minor 作为 durable advisory notes 保留。

未选择的替代方式及差异如下：`AGILE` 不使用独立 Review，由 Main 在精确 head 上记录
required CI 与核心旅程 smoke；`STRICT` 要求独立 Review 先批准精确计划，并按完整
blocker/major remediation policy 审查代码。交付方式只改变评审深度，不改变精确快照、CI、
merge、Goal、发布授权或 durable history 门禁。

## Acceptance criteria

1. 仓库提供一个与现有 `idea-validation-workflow` 明确分工的初始化 Skill/初始化入口。它只
   负责客户端连接配置、验证与安全交接，不执行 Idea/项目业务写入，也不复制或分叉现有
   decision loop。
2. 初始化必须要求四项有效输入：网站 `baseUrl`、AI bearer credential 的安全来源或引用、
   稳定 `clientId`、可读 `displayName`。缺少任一项都不能生成可用 profile。
3. 生产 `baseUrl` 必须规范化为单一 HTTPS origin，拒绝 userinfo、credential-bearing URL、
   query、fragment、不允许的 path、非预期重定向或不受信任 origin；仅隔离本地开发/测试可
   按文档允许 loopback HTTP。
4. 初始化验证目标 liveness/readiness 与 OpenAPI 可达、origin 一致且契约兼容；验证失败时
   不写出“ready/usable”结论，也不继续到业务 Skill。
5. raw AI token 只能从不进入模型 prompt 的安全 operator input、本地受限 token file、环境
   变量或等价 secret provider 读取。初始化 Skill 不要求用户在对话中粘贴 token，不回显、
   记录、摘要、上传或写入命令参数、URL、profile、Git、普通日志、错误、截图或验收证据。
6. ClientConnectionProfile 至少包含 schema/version、规范化 `baseUrl`、OpenAPI URL、精确
   Skill commit/version、`releaseId`、`clientId`、`displayName`、非秘密 credential id 或安全
   fingerprint、`issuedAt`、可明确表达未知/无到期时间的 `expiresAt`、已声明 AI scopes 和
   验证状态；profile 不含 token value、human credential、cookie 或数据库连接信息。
7. Profile 的 credential id/fingerprint 只能用于区分和轮换追踪，不能用于认证、恢复 token
   或替代 bearer；日志和证据只能记录该非秘密标识及验证状态。
8. 初始化后的业务 Skill 在公共契约允许客户端提供 actor attribution 的写操作中稳定使用
   `clientId` 作为 `client`、`displayName` 作为展示署名；重新读取资源/审计记录时能观察到
   相同值。署名永远不作为 token、权限、human intent 或授权证明。
9. 对由服务端配置拥有的 attribution，客户端初始化不得覆盖或伪造。若某条现有 route 无法
   表达客户端署名，Skill 必须保持现有契约并明确说明限制，不能发明字段、header 或旁路。
10. 公开 Web 与 GET 读取继续无需 AI token；AI 写操作继续要求有效 AI bearer。初始化 Skill
    和业务 Skill 都拒绝接收、存储、转发或使用 `HUMAN_CONTROL_TOKEN`、human capability
    cookie 或其他人类确认凭据。
11. 每次部署生成或更新一份绑定精确 release 的非秘密 ClientConnectionProfile，并向操作者
    提供安全 credential 交付/引用步骤。若现有 AI token 未过期、未泄露、权限未变化且策略
    未要求轮换，可以在新 release 中继续使用同一 credential identity，但必须重新验证可用性。
12. 新 token 只在首次配置、到期、泄露、权限变化或显式轮换策略触发时生成/发放；轮换后
    profile 更新 credential identity 与时间状态，旧 token 被证明不再授权，任何原始值都不
    进入版本化资产或验收记录。
13. 初始化结果必须区分连接/OpenAPI 验证、credential presence 和 credential usability。
    不得以长度/格式检查或公开 GET 通过声称 token 有效；正确/错误 token 的实际授权边界必须
    在隔离测试环境通过无生产数据风险的真实 HTTP 回归证明。
14. 至少一个 Codex 和一个 Claude/兼容 Markdown-Skill 客户端按统一文档完成：加载初始化
    Skill、建立 profile、加载业务 Skill、执行一条隔离合成 AI 写入、用公开读取验证结果及
    双字段署名。两者使用同一 profile 契约和 decision loop，不维护互相漂移的配置格式。
15. 负向测试覆盖：缺失/非法 base URL、跨 origin redirect、缺失/错误/过期 token、把
    human-control token 当 AI token、空白/超长/非法署名、profile release/Skill mismatch、
    secret 出现在输出，以及未经初始化直接调用业务 Skill；全部 fail closed 且不产生未授权
    业务写入。
16. 重复执行初始化在输入未变时是安全且结果稳定的；base URL、Skill/release、署名或
    credential identity 改变时必须显式更新并重新验证，不能静默复用陈旧 proof。
17. `npm run skill:check`、相关契约/安全/真实客户端回归、required CI 和现有 LP-01 至 LP-05
    门禁通过；不得通过放宽 secret scan、公开写权限、actor schema 或 human-control 边界来
    使新流程通过。
18. 文档为 Codex、Claude 和通用兼容客户端提供统一的安装、初始化、环境变量/token-file
    引用、验证、更新、轮换、故障恢复和卸载/移除本地 profile 示例；所有示例使用无效占位符，
    不含真实 token 或生产秘密。
19. 当前生产站点、人工部署记录、既有 release/proposal/attempt 和 credential history 保持
    不变。本 feature 不通过修改服务器或历史记录来制造通过证据。
20. 需求确认、handoff、计划/代码批准、合并或测试均不构成 credential 生成/发放、生产访问、
    部署、release、token 轮换、tag、package、registry、GitHub Release 或 Skill 发布授权。

## Non-goals

- 不新增登录、多租户、OAuth、API key 管理平台、用户账户、RBAC 或通用 secret manager。
- 不把 `clientId`、`displayName`、credential fingerprint 或 profile 本身变成认证/授权机制。
- 不向 AI 客户端提供 human-control token、confirmation cookie、SSH/DNS/数据库凭据或生产
  管理权限。
- 不要求每次发布都生成新 token；也不允许因方便而无限期忽略到期、泄露、权限变化或显式
  轮换策略。
- 不在本 feature 中重新设计公共业务 API、报告 attribution、部署 controller、release
  authorization 或现有 Idea/project workflow。
- 不自动连接或修改当前生产站点，不创建真实 credential，不执行部署/发布或发送外部消息。
- 不把初始化 Skill 扩展为安装器、包管理器、凭据托管服务或跨产品通用连接框架。

## Failure and recovery expectations

- 网站地址无效或目标不 ready：拒绝 profile ready 状态，保留非秘密诊断并允许修正 URL 后
  重试；不自动跟随到外来 origin。
- OpenAPI 不可达或版本不兼容：停止业务 Skill，说明实际与期望 Skill/release 标识，不猜测
  route 或降级到旧契约。
- token 缺失、不可读、错误、过期或 scope 不足：不发业务写入；提示操作者通过安全渠道修复
  credential，不打印值或环境。
- profile 损坏、字段漂移或绑定不匹配：fail closed，要求重新初始化；不得局部忽略校验或
  自动拼接缺失署名。
- 署名无效：在任何写入前拒绝，并分别指出 `clientId` 或 `displayName` 的非秘密格式问题。
- token 疑似泄露：停止使用，标记 credential identity 需轮换，清理可安全清理的本地派生物；
  不删除 Git、release 或审计历史掩盖事件。
- 客户端请求结果未知：继续遵守现有幂等恢复规则；不得因重新初始化而用同一 key 改写请求。

## Public API and compatibility impact

- 预期不修改现有公共 API、OpenAPI、数据库 schema、Web 路由或状态机。初始化和 profile 使用
  现有 base URL、OpenAPI 与 actor attribution 契约。
- `clientId` 对应现有 AI actor `client` 语义，`displayName` 对应其可读署名；二者是调用方
  声明的归属，不是 authentication 或 permission evidence。
- 现有 `$idea-validation-workflow` decision loop、幂等 key、version read-before-write、公开
  human handoff 和错误恢复语义保持兼容。
- 若实现发现必须新增认证 endpoint、修改 report 的服务端 attribution 或改变公共 actor
  schema，Main 必须带可复现证据返回 Requirements，不能作为初始化便利顺带修改。

## Safety, privacy, permissions, and authorization

- raw token 永远不得进入模型上下文或任何版本化/可公开资产。初始化只接收安全引用或通过
  不可回显的 operator surface 获取 secret；业务 Skill 只在发 HTTP Authorization header 时
  使用它。
- Profile、日志和验收记录只保存非秘密连接元数据、credential identity/fingerprint、状态和
  摘要。不得保存 Authorization header、完整环境 dump、cookie、数据库 URL 或请求私密正文。
- base URL 校验必须防止 credential 被发送到 userinfo、redirect、非预期 path 或其他 origin。
- AI token 只授予既有 AI write 边界。Human-control credential 与人工确认动作始终由人类
  独立持有和执行，客户端 Skill 只能解释公开步骤并停止。
- 双字段署名可用于追踪哪个客户端声明了动作，但不能证明真实人身份、同意、权限或发布
  授权；UI 和文档不得把它描述为认证。
- 当前生产可访问性不授权对 `idea.zhanghao.work` 做初始化 smoke、写入、token 检查或轮换。
  所有写入验收先在隔离合成环境完成，生产操作另行授权。

## Release impact

- 每次部署的客户端交付物由两部分组成：可安全分发的 ClientConnectionProfile，以及通过独立
  安全渠道交付的新 token 或对已验证既有 credential 的本地引用。公开 release notes、Git、
  URL 和 profile 永远不包含 raw token。
- token 不与 release 强制一一对应；profile 必须明确绑定 release 与 credential identity，
  并记录已知 expiry/scopes/验证状态。复用 token 仍需对新 release 验证可用性。
- 本 feature 合并后需要从新的精确提交构建候选并形成新的 proposal；既有 candidate、proposal、
  人工部署与 production evidence 不得原地修改或冒充已包含初始化能力。
- 新候选的任何生产部署、profile 外部交付、token 生成/发放/轮换、tag、package、registry、
  GitHub Release 或 Skill 发布仍需对应的独立显式授权。

## Assumptions

- `d181bf9a02a8c47da909050faa213fbc5efb71e7` 是本 Draft 的权威代码基线，远端
  `codex/v0-1-project-plan` 精确指向该提交。
- 目标客户端至少包括 Codex、Claude 和能够加载同一 Markdown Skill 的兼容客户端。
- 用户已明确选择双字段署名：稳定 `clientId` 与人类可读 `displayName`；二者使用现有 actor
  attribution 语义，不新增权限。
- 用户已明确选择 `AGILE_REVIEWED`，优先级 P1；该优先级表示在更紧急的迁移 ledger 修复后
  紧接处理，不把本需求无声合并进该修复。
- 生产部署可能继续使用一个仍有效的 AI bearer；是否轮换由到期、泄露、权限变化或显式策略
  决定，而不是仅由 release 发生决定。
- 安全 operator surface 能提供本地 secret file、环境变量或等价不可回显引用；仓库不保存
  真实 credential。

## Traceability

| Requirement area | Source | Covered by acceptance criteria |
| --- | --- | --- |
| 初始化必须指定网站、token 与署名 | 用户明确请求及双字段确认 | 1–5、8、13–16 |
| 每次部署提供客户端连接资料 | 独立 follow-up intake | 6–7、11–12、18、20 |
| Codex/Claude 统一使用 | 当前 Skill client setup 缺口 | 1、14、18 |
| AI/human credential 隔离 | 当前 Skill 与 LP-05 安全边界 | 5、10、15、20 |
| 不强制每次 release 轮换 token | 用户确认前建议边界 | 7、11–13、20 |
| 不并入迁移 ledger 修复 | 用户指定独立 intake、P1 | 17、19–20 |

## Open questions

None. 技术计划可以在上述行为和安全边界内选择最小实现；若需要改变公共认证/API、服务端
report attribution、生产 secret 管理或 release authority，必须返回 Requirements 重新确认。
