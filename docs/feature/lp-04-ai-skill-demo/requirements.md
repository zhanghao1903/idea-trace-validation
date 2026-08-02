# Requirements: LP-04 AI Skill 与可重复演示

- Status: Confirmed
- FeatureId: lp-04-ai-skill-demo-5f8c2a9d7e41
- Branch: codex/lp-04-ai-skill-demo
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-08-01T11:09:44Z
- Authoritative baseline: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Source plan: `docs/implementation-plans/v0-1/lp-04-ai-skill-demo.md`
- Primary source requirements: REQ-020、REQ-027
- Primary source acceptance criteria: AC-001、AC-015

## Problem

LP-01 至 LP-03 已经提供 Idea、项目执行、决策、人类确认、结构化汇报和双角色 Web 的
真实纵向能力，但仓库还没有供 Codex、Claude 等 AI 客户端遵循的 Skill，也没有可清理、
可重复运行的演示数据和演示脚本。因此，自然语言意图如何可靠地映射到现有 API、如何在
网络结果未知或业务冲突时恢复、何处必须停下来交给人类确认，目前都依赖操作者临场判断；
项目也缺少一套能客观证明完整故事而不制造平行状态的演示方式。

LP-04 需要补齐这两个交付缺口：以现有 REST API 和权威数据库为唯一业务入口，提供可被
兼容 AI 客户端采用的仓库内 Skill，并提供使用合成数据、可重复执行且包含恢复路径的演示
闭环。它不重新设计 LP-01 至 LP-03 的领域、API 或 Web。

## Current behavior

- LP-03 已在 Engineering Lifecycle 中以 `ACCEPTED_NO_PUBLISH` 正式关闭：merge commit
  `818671c504c8b8b8cd41f8ebc096f341ece6b18f`，acceptanceId
  `7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8b`，
  closureId
  `25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`，
  releaseTargets 为 `[]`；没有 tag、GitHub Release、package 或部署。
- 当前权威基线已经公开 Idea、澄清、推进、项目状态转换、进展、事项、证据、结论、人类
  确认、结构化汇报和双角色体验的真实 REST API；机器可读契约为运行时
  `/openapi.json` 与冻结的 `openapi/lp03.v1.json`。
- AI 写入使用 Bearer token 和 `Idempotency-Key`；高影响确认使用独立 human-control
  token 和路径绑定的短期 cookie。公开 Web 的角色切换只是信息组织，不是身份认证或授权。
- API 已提供结构化的校验、版本冲突、幂等冲突、处理中和服务未就绪等失败语义；报告只
  接受既有七类受控块，并保持系统权威状态独立。
- 仓库当前不存在 `skills/` 交付、演示数据生成方式、demo smoke 或人工演示脚本。
- `docs/project-management.md` 仍把 LP-03 记为 `Ready for Acceptance`、LP-04 记为
  `Not Started`，尚未同步 LP-03 的正式关闭事实和 LP-04 的实际阶段。

## Desired scenarios

1. 想法提出者向一个刚加载 Skill 的兼容 AI 客户端描述不完整想法；AI 区分已知事实、
   假设和缺失信息，必要时提问，并通过真实 API 创建唯一、可读取的 Idea，而不虚构内容。
2. 想法提出者明确要求推进后，AI 读取当前记录和允许动作，再完成澄清或推进；未收到明确
   推进意图时，Idea 继续停留在 Idea 池。
3. 执行者以自然语言汇报进展、阻塞、待确认问题、支持请求、证据和结论；AI 将意图映射到
   对应 API，保留追加式历史，并在版本冲突后重新读取权威状态再恢复。
4. AI 为项目提交符合既有协议的结构化汇报；校验失败时根据结构化错误定位并修正，不绕过
   协议、不覆盖权威状态，也不生成任意 HTML、JavaScript 或 CSS。
5. 一次写请求出现网络结果未知；AI 使用同一个幂等键和完全相同的意图重试，最终系统只有
   一个业务结果。若原意图改变，则使用新的请求，而不是复用旧键掩盖差异。
6. 旅程到达人类确认边界时，AI 清楚说明需要人完成的步骤并停下；它不读取、索取、记录或
   使用 human-control token，也不代表人批准、拒绝、完成、停止、移交或重开。
7. 演示者从文档化的干净或已知起点生成纯合成数据，重复展示 Idea 池、执行中、阻塞、待
   确认、支持、动态汇报和完成项目；再次运行不会造成不可解释的重复或污染共享环境。
8. 演示结束时，想法提出者和执行者页面从同一权威数据展示各自重点，人工脚本能够说明
   发生了什么、哪里经过人类治理、失败如何恢复以及如何清理演示数据。

## Goals

- 提供一份仓库版本化、面向 Codex、Claude 及遵循同类 Markdown Skill 约定客户端的
  Skill，覆盖两类角色的意图识别、最小字段收集、真实 API 工作流、结果解释和恢复边界。
- 让 Skill 始终把现有 API/OpenAPI 与数据库记录视为权威来源，不在客户端、文件或对话中
  维护另一套项目状态。
- 提供安全、合成、可清理且可重复的演示数据生成方式、自动化 demo smoke 和人工演示
  脚本，证明核心旅程与至少一个非顺利路径。
- 用可复现证据验证客户端按 Skill 操作的行为，而不是只验证静态提示词或 mock 响应。
- 在同一 LP-04 交付中同步项目管理入口和 LP-04 计划状态，保留 LP-03 的精确关闭追踪。

## Acceptance criteria

1. 仓库中存在可发现、可版本化的 Skill 主文档及必要参考；主文档说明适用角色、支持的
   意图、调用前置条件、最小字段、权威数据边界、人类确认边界、成功判断和失败恢复入口。
2. 在干净演示环境中，想法提出者从一段自然语言开始，兼容 AI 客户端按 Skill 调用真实
   API，创建且随后读取到唯一 Idea；请求和结果可以由演示证据关联，数据库或本地文件中
   不存在由 Skill 维护的第二份 Idea 状态。
3. 当输入缺少 API 或业务旅程所需信息时，Skill 要求 AI 明确区分事实、假设和待澄清项，
   提问或按现有契约保存缺失项；验收反例证明 AI 不会编造提出者、期望结果、证据、确认
   决定或其他未知事实。
4. Skill 覆盖想法提出者的创建、读取、澄清和显式推进旅程；未收到明确推进意图时，演示
   证明 Idea 不产生执行项目。
5. Skill 覆盖执行者对现有项目的读取、允许的状态转换、进展、事项、证据、结论与结构化
   汇报旅程，并清楚区分“记录事实”和“改变项目状态”。
6. 到达人类确认步骤时，Skill 要求 AI 停止自动化并交还给人；验收证明 AI bearer token
   不能替代 human-control token 或 scoped cookie，确认被拒绝、过期或缺少 capability 时
   不会被绕过。
7. 对一次模拟的网络结果未知，客户端以相同请求体和同一 `Idempotency-Key` 重试；最终只
   产生一条权威业务记录。对同键不同意图、幂等处理中和确定性失败，Skill 分别给出与现有
   结构化错误一致的解释和恢复动作。
8. 对版本冲突，Skill 先重新读取最新权威资源和允许动作，再决定是否以新的明确请求继续；
   它不会盲目覆盖版本。对校验错误、未认证、禁止、未找到和服务未就绪，Skill 不把失败
   误报为成功，并给出有限、可理解的重试或纠正路径。
9. AI 能按 Skill 提交一份符合现有结构化汇报协议的报告，并在一个故意无效的报告示例中
   使用返回的定位信息修正请求；无效请求不成为新的有效 revision，系统权威状态不被报告
   内容覆盖。
10. 演示数据至少覆盖：暂不验证或待澄清 Idea、执行中项目、阻塞、待确认问题、支持请求、
    动态结构化汇报和已完成项目；所有人物、内容、链接和标识均为明确的合成演示数据。
11. 演示数据生成方式可从文档化的干净或已知状态重复运行；连续两次演示要么使用隔离标识
    生成可区分结果，要么安全恢复到已知状态，不依赖手工修改数据库，也不执行面向共享或
    生产环境的破坏性清空。
12. 自动化 demo smoke 通过真实 HTTP API 验证创建、读取、至少一次执行事实、结构化汇报
    和幂等恢复；它不以 mock、静态页面或直接调用内部 service 代替核心业务证据。
13. 人工演示脚本列出环境前置、凭据注入方式、起点、逐步操作、每步预期 API/Web 结果、
    人类确认交接、失败恢复、结束状态和安全清理方式；新演示者无需阅读实现代码即可执行。
14. 演示最终在 proposer 与 executor Web 中显示同一权威记录的不同角色重点，并展示至少
    两种不同结构或顺序的项目汇报；页面行为继续遵守 LP-03 的公开只读与确认边界。
15. Codex 与 Claude 各完成一次针对真实 API 的代表性 Skill 验证，并记录客户端、Skill
    版本/提交、输入意图和客观结果；任一客户端未实际执行时，不得把其兼容性写成已验证，
    且该项保持未通过。其他兼容客户端可以作为补充，不能替代这两项而不经过需求变更。
16. Skill、演示脚本、测试输出、日志、截图和提交中不出现 AI bearer token、human-control
    token、scoped cookie、数据库凭据、真实个人数据或商业机密；演示中展示的敏感字段均
    使用明确占位符或脱敏值。
17. LP-04 新增的自动化检查与现有 LP-01、LP-02、LP-03 验收和全量仓库门禁共同通过；
    不得通过删除、跳过或放宽既有门禁来获得通过结果。
18. `docs/project-management.md` 和 LP-04 计划文档在同一交付中更新：LP-03 精确记录上述
    `ACCEPTED_NO_PUBLISH` 关闭事实，LP-04 在送验时为 `Ready for Acceptance`，LP-05 仍
    保持独立、未授权状态；LP-04 正式验收前不得提前记为 `Accepted`。

## Non-goals

- 不建设 MCP Server、AI 专用旁路、第二套 API、第二份项目状态或客户端同步数据库。
- 不训练、微调、托管语言模型，也不建设聊天 UI、通用 agent runtime、多代理编排器或
  自治执行平台。
- 不重新设计或扩展 LP-01 至 LP-03 已验收的领域模型、生命周期、数据库、API、报告协议
  或 Web 页面；发现真实契约缺口时按“Public API and compatibility impact”处理。
- 不让 AI 自动做出或伪造人类确认，不把角色字段或公开 Web 视图升级为认证身份。
- 不进行 LP-05 的生产部署、域名、HTTPS、备份恢复、发布候选、tag、GitHub Release、
  package 或其他发布工作。
- 不引入真实公司/客户数据、真实证据链接或生产凭据作为演示内容。
- 不建设通用自然语言评测平台、完整生命周期模拟器、authorization engine、future-state
  validator、大规模 mutation/negative harness 或与 LP-04 客观场景无关的基础设施。
- 不重做 LP-03 前端视觉设计；Superdesign 或其他视觉设计工具不是本 feature 的验收依赖。

## Failure and recovery expectations

- 输入不足：保留未知，要求澄清或使用现有契约表达待澄清项；不得猜测后继续高影响动作。
- 网络结果未知：保留原请求体与幂等键，先按 Skill 的可观察规则查询或重试；不得为同一
  意图生成新键并造成重复记录。
- 幂等键与不同意图冲突：停止复用该键，向用户说明冲突；只有用户确认的新意图才使用新键。
- 版本冲突或动作不允许：重新读取当前状态、版本与允许动作；不得强制覆盖或自动选择另一
  状态转换。
- 校验或报告协议错误：使用结构化错误中的字段路径修正；不得删除安全约束、发送任意代码
  或把被拒绝内容当作已保存。
- 未认证、禁止、确认拒绝/过期：停止受保护动作并明确所需的人类步骤；不得索取或泄露
  human-control 凭据。
- 服务未就绪或暂时失败：以有限重试和清晰状态报告处理；超过边界后保留上下文并交还用户，
  不声称成功。
- 演示准备或清理失败：保持已有权威数据可追踪，输出明确失败和人工恢复步骤；不得在未知
  环境执行全库清空、drop、不可逆删除或针对生产数据的 reset。

## Public API and compatibility impact

- LP-04 的预期运行时 API、报告 Schema、领域和数据库影响均为“无变更”；Skill 和演示只
  消费 LP-03 合并基线提供的 `/openapi.json`、`openapi/lp03.v1.json` 和既有 Web 路由。
- Skill 示例和自动化演示必须从当前公开契约生成或核对，不复制隐藏参数，也不直接依赖内部
  application/db service 作为业务入口。
- 若实施中发现现有公开契约无法完成已确认场景，Main 必须记录可复现缺口并返回 Requirements
  进行显式需求变更；不得在 LP-04 授权下顺带修改 LP-01 至 LP-03 的公开行为。
- Skill 文档应保持客户端中立的核心语义，并分别给出 Codex 与 Claude 的加载/使用入口；
  客户端专有包装不得改变 API 语义、人类确认边界或权威数据来源。
- 已冻结的 LP-01、LP-02、LP-03 OpenAPI 与既有消费者保持兼容；LP-04 不授权破坏性变更。

## Safety, privacy, permissions, and authorization

- AI bearer token 只通过运行环境或客户端安全配置注入，不写入 Skill、示例、命令参数、
  数据库业务字段、日志、截图、测试快照或版本控制。
- Human-control token 和 scoped confirmation cookie 不属于 AI Skill 输入；Skill 不应请求、
  读取、转发、缓存或展示它们。需要确认时必须清楚交给人类完成现有 Web/capability 流程。
- body 中的 actor、proposer、role 与可切换 Web 视角仍是声明归属或展示视角，不得描述成
  已认证用户身份或权限证明。
- 演示数据必须是可公开的合成内容，不含真实个人信息、公司秘密、内部 URL 或可用凭据；
  外链仅使用安全、明确的演示地址。
- 数据准备和清理只针对明确识别的本地/隔离演示环境；环境身份不明、共享或生产时必须停止，
  不得做破坏性清理。
- 所有验收和交付继续服从 Engineering Lifecycle 的确认、评审、合并和发布授权；本文档
  不授权 Main 直接实现，直到用户确认并成功完成 RequirementsHandoff。

## Release impact

- LP-04 交付是仓库内 Skill、演示资产、测试和文档，不包含生产部署或外部发布目标。
- 预期关闭方式为验收后 `ACCEPTED_NO_PUBLISH`；任何 tag、GitHub Release、package、部署
  或面向外部 Skill 市场的发布都需要独立、显式授权。
- LP-04 被正式验收后只解除 LP-05 的需求依赖；不会自动确认、设计、实施或发布 LP-05。

## Assumptions

- `818671c504c8b8b8cd41f8ebc096f341ece6b18f` 是 LP-04 唯一权威代码基线，且 LP-01 至
  LP-03 的现有契约与验收结论保持有效。
- 验收环境可启动当前 Node.js/PostgreSQL 应用，并通过真实 HTTP 访问 API 和 Web。
- 用户或验收者会在仓库外安全提供有效 AI bearer token；涉及人类确认时，由人类在现有
  受控流程中提供所需能力。
- Codex 与 Claude 验收客户端能够读取仓库内 Markdown Skill 并发起 HTTP 请求；若任一
  客户端不可用，属于外部验收阻塞，不自动降低为静态文档检查。
- 中文是演示和 Skill 的主要用户语言，稳定 API 字段、错误码和技术标识保留英文。
- LP-04 不需要新的生产基础设施；部署和发布就绪继续属于 LP-05。

## Traceability

| LP-04 requirement | Source | Covered by acceptance criteria |
| --- | --- | --- |
| Codex、Claude 或兼容客户端按 Skill 完成角色旅程，并遵守人类确认边界 | REQ-020、AC-001、AC-015 | 1–9、15–16 |
| 可重复演示数据和脚本覆盖 v0.1 核心展示状态 | REQ-027、LP-04 plan | 10–14 |
| 网络未知复用请求 ID，Skill 不保存独立状态 | LP-04 plan acceptance checklist | 2、7–8、12 |
| 演示使用真实 API，保留已验收系统边界 | LP-04 plan scope/out of scope | 5–9、12、17 |
| 单一项目管理入口同步依赖和状态 | `docs/project-management.md` 更新规则 | 18 |

## Open questions

None.
