# Requirements: LP-03 结构化汇报与双角色体验

- Status: Confirmed
- FeatureId: lp-03-reporting-role-experience-9c4d7e1a6b20
- Branch: codex/lp-03-reporting-role-experience
- ConfirmedBy: User in Requirements task
- ConfirmedAt: 2026-07-31T15:09:15Z

## Problem

LP-01 和 LP-02 已经形成从 Idea 到项目执行、关注事项、Evidence、结论和人类确认的
可运行 API 闭环，但当前仓库仍只有 API、共享契约、PostgreSQL 迁移和自动化验证。
想法提出者和执行者没有无需登录即可使用的网页视图，无法在一个直观入口中查看各自
关心的 Idea、项目、进展、事项、Evidence、结论和历史。

仓库已经保存一份声明式结构化汇报 Schema 和协议设计，但尚未提供汇报提交 API、
严格的语义与安全校验、不可变 revision、通用渲染器或失败回退。不同项目因此仍不能
在不编写项目专用页面的情况下安全展示不同章节和内容结构。

LP-03 需要把现有权威业务数据转化为两类清晰的只读 Web 体验，并完成结构化汇报从
提交、校验、版本化到安全渲染的闭环。动态汇报只能补充展示，不能成为第二套项目状态
或覆盖 LP-01/LP-02 已验收的权威事实。

## Current behavior

- 权威合并基线是 `644af4f186b054a9c5d1c6db087a97e009f545a3`，即 LP-02
  PR #4 的 merge commit；canonical `origin/codex/v0-1-project-plan` tip 与该
  commit 完全一致。
- Engineering Lifecycle 已将 feature `lp-02-execution-decisions-4e8a2c7d91b3`
  通过 `ACCEPTED_NO_PUBLISH` 正式关闭：
  - RequirementsHandoff:
    `f4a188fe24c11b745932718f7e3ffa3980ae4e21a37791d0e5f6a0d22ef8fe8c`
  - plan PASS:
    `afc3975524b8c8c6393a0f117ed8b7b7ac4a9d1057faf49cdfbe628649a1550c`
  - merged code result:
    `d38c0b23153c3a805e9e3d64a61b9825a3190400ead450660c655d2462f4f7ff`
  - acceptanceId:
    `b63ec86101008217bfa6eab6bbeda41713735e7099b051a2a7e21f3026321cba`
  - closureId:
    `418d1de3689d1bef9a1ce3ee2abf88cb3e44cd1976dc3ec40c2e15f7b63d5061`
  - releaseTargets: `[]`
  - 没有创建 tag、GitHub Release、package、部署或其他发布产物。
- [项目管理入口](../../project-management.md) 的合并内容仍把 LP-02 标记为
  `Ready for Acceptance`，总体下一步仍是完成 LP-02 正式验收；它尚未同步上述正式
  关闭事实。LP-03 仍为 `Not Started`。
- LP-02 已提供公开的 Idea/项目及执行历史读取、AI bearer 写入、独立 human-control
  能力和单次 scoped confirmation cookie。proposer 与 executor 投影读取同一份
  PostgreSQL 权威数据，项目详情已包含当前状态、阶段、下一步、最近进展、关注事项、
  Evidence、最新结论、允许操作和历史集合入口。
- 当前 API 没有结构化汇报提交或读取路由，也没有汇报 revision 数据。已完成项目的
  汇报冻结、基于 revision 的并发和渲染状态都尚未成为运行时行为。
- `packages/contracts/schemas/structured-report.v1.schema.json` 已作为共享契约保留，
  [结构化汇报协议](../v0-1-project-plan/structured-report-protocol.md) 定义了七类固定块、
  严格校验、安全边界、引用和回退语义，但协议状态仍是设计输入而非已实现能力。
- 仓库不存在 `apps/web` 或 Web 构建产物，也未锁定 Web 运行时依赖。当前 README 明确
  把“结构化汇报 Web”归入 LP-03。
- LP-02 留有一个非阻塞 follow-up：可选细化宽泛的 PostgreSQL `55P03` 诊断分类。
  它不是 LP-03 的依赖或默认交付范围。

## Desired scenarios

1. 用户直接打开想法提出者视图，无需登录即可看到全部 Idea，并按普通 Idea、待澄清、
   等待执行、执行中/暂停和已完成识别或筛选。
2. 对已经进入执行的 Idea，想法提出者能看到最新进展、下一步、等待其处理的决策或
   支持请求，以及最新验证结论和建议去向。
3. 执行者打开自己的视图，清楚区分未完成与已完成项目，并优先看到当前状态、阶段、
   下一步、阻塞、待确认问题和支持请求。
4. 用户通过页面中的角色切换直接在 proposer 与 executor 视图间切换；刷新、后退、
   前进或打开可分享 URL 后仍保持所选视图，但切换不产生身份或权限含义。
5. 用户打开项目详情，固定权威区域始终展示 LP-01/LP-02 状态、阶段、进展、事项、
   Evidence、结论、确认和历史；结构化汇报只出现在独立的动态区域。
6. AI 为两个项目分别提交章节、块类型和顺序完全不同的有效声明式汇报；同一通用页面
   按各自内容正确展示，不需要项目专用模板或代码。
7. AI 提交未知字段、未知块、危险 Markdown/URL、过大内容、错误表格或无效引用时，
   API 返回可定位错误且不创建 revision，上一份有效汇报继续可用。
8. 相同汇报因网络未知结果被安全重试时只产生一个 revision；基于旧 revision 的并发
   提交被拒绝并提示重新读取、合并后重试。
9. 汇报引用同项目 Evidence 或 AttentionItem 时，页面从权威 API 补全标题、状态和
   链接；汇报正文中的伪造状态或跨项目引用不会覆盖权威事实。
10. 最新汇报在运行时无法渲染时，页面保留固定权威区域，显示安全降级提示并回退到
    上一份可渲染 revision；若没有旧版本，则显示明确空态而不是崩溃或注入原内容。
11. 持有某一 LP-02 scoped confirmation capability 的人可以在受限页面查看该操作的
    确切摘要并批准或拒绝；普通公开访问仍保持只读，且不出现完整人工编辑表单。
12. LP-03 准备正式验收时，唯一项目管理入口准确记录 LP-02 已验收但未发布的关闭
    证据，以及 LP-03 的实际交付状态和客观验证证据。

## Goals

- 建立无需登录、可直接切换且可分享 URL 的 proposer/executor 双角色 Web 体验。
- 让两个角色从同一权威数据读取不同重点，不维护平行客户端业务状态。
- 提供项目详情的固定权威区域、动态汇报区域、关联对象和历史。
- 实现结构化汇报的严格提交、可定位校验、幂等、并发和不可变版本语义。
- 用七类冻结的声明式块支持不同项目的不同章节与顺序，不执行 AI 生成代码。
- 安全渲染受限 Markdown，并用权威 Evidence/AttentionItem 数据补全引用。
- 在无效提交或运行时渲染失败时保留上一份有效、可渲染汇报。
- 复用 LP-01/LP-02 的 API、访问、错误、readiness 和安全边界，保持既有客户端兼容。
- 提供基本键盘、移动端、空态、加载、失败和旧数据体验。
- 更新项目管理事实，使 LP-02 正式关闭与 LP-03 独立验收状态可追踪。
- 为 LP-04 的 AI Skill 与可重复演示提供稳定报告 API 和 Web 表面，不提前实现 LP-04。

## Functional requirements

| ID | Requirement |
| --- | --- |
| LP3-REQ-001 | LP-03 必须从 LP-02 权威合并基线演进；既有 Idea、项目、执行事实、结论、确认、版本、幂等记录和审计历史必须在升级后保持可读，LP-01/LP-02 已验收 API 行为不得回退。 |
| LP3-REQ-002 | 结构化汇报必须使用仓库内单一、版本化、机器可读的规范源，并覆盖章节以及 `text`、`metrics`、`list`、`table`、`timeline`、`evidence_refs`、`action_refs` 七类固定块。不得维护第二份语义可能漂移的手写协议类型。 |
| LP3-REQ-003 | AI 只能提交声明式 JSON。汇报不得包含或执行 HTML、JavaScript、CSS、SVG、iframe、表单、模板表达式、事件处理器、动态组件、远程嵌入或其他可执行页面内容。 |
| LP3-REQ-004 | 服务端必须在保存前依次完成请求大小/JSON、协议版本、结构、语义、安全、项目边界、引用、幂等和并发校验。任一校验失败都不得创建 revision、改变当前指针或追加成功审计。 |
| LP3-REQ-005 | 结构、语义和安全错误必须使用稳定错误码并提供可定位的 JSON Pointer 或等价字段路径；单次响应必须有明确上限，不能通过回显完整危险正文泄露或放大输入。 |
| LP3-REQ-006 | v1 汇报必须执行已确认协议的复杂度边界，至少包括 256 KiB 总大小、1–20 个章节、每章节 1–30 个块以及各固定块的字段、数量和字符串限制；超限内容必须整体拒绝，不能截断后保存。 |
| LP3-REQ-007 | `evidence_refs` 和 `action_refs` 只能提交稳定 ID；引用必须存在并属于同一项目。标题、状态、链接和其他权威字段必须在读取/渲染时由服务端数据补全，不能信任汇报中的副本。 |
| LP3-REQ-008 | 汇报载荷不得设置、隐藏、替换或重命名项目状态、阶段、确认结果、操作者、允许操作、审计历史、服务端 ID、revision 或服务端时间。冲突文本只能作为普通陈述展示。 |
| LP3-REQ-009 | 每次成功提交必须创建不可变 revision，保存稳定报告 ID、项目 ID、revision、前一 revision、规范化内容摘要、协议版本、原始声明式内容、提交者和服务端接受时间。历史 revision 不得原地改写或物理删除。 |
| LP3-REQ-010 | 汇报提交必须延续可重试语义：相同项目、相同幂等身份和相同规范化内容返回首次成功结果且不新增 revision；同一身份表达不同内容时返回明确幂等冲突。 |
| LP3-REQ-011 | 首次汇报必须基于 revision 0；后续提交必须基于当前最新 accepted revision。过期 revision 不得覆盖更新后的汇报，并必须返回当前 revision 或重新读取提示。 |
| LP3-REQ-012 | 汇报校验、revision 保存、当前指针更新和脱敏审计必须原子完成；事务或基础设施失败不得报告成功或留下部分 revision，并允许用同一幂等身份安全重试。 |
| LP3-REQ-013 | 已完成项目不得接受新汇报；项目按 LP-02 规则重开后，可以基于完成前最后 accepted revision 继续提交，不得清除完成前汇报历史。 |
| LP3-REQ-014 | API 必须提供当前 accepted、当前可渲染和有稳定顺序的历史 revision 读取能力。无汇报、只有失败 revision、存在旧协议版本或当前版本不可渲染时，响应必须可明确区分。 |
| LP3-REQ-015 | 通用渲染器必须按服务端保存的章节和块顺序渲染七类固定块，不得根据项目 ID、标题、业务类型或 AI 提供的组件名选择项目专用页面。 |
| LP3-REQ-016 | `text` 块只允许协议规定的有限 Markdown。原始 HTML 和危险/非 HTTPS URL 必须在保存前拒绝，浏览器渲染仍必须转义不受信任内容并避免可执行 DOM 注入。 |
| LP3-REQ-017 | 项目状态、阶段、最新进展、关注事项、结论、确认和历史必须在汇报组件之外的固定权威区域渲染；动态汇报失败、缺失或声称冲突事实时，该区域仍显示最新 LP-01/LP-02 权威数据。 |
| LP3-REQ-018 | 最新 accepted revision 不能安全渲染时，页面必须显示不包含危险正文的降级提示并使用上一份可渲染 revision；没有上一版本时显示安全空态。失败诊断只能包含受限摘要，不能暴露凭据或完整汇报正文。 |
| LP3-REQ-019 | 已保存的受支持旧协议 revision 必须保持只读可用；不支持的版本不得被猜测渲染或静默改写，页面应回退到受支持版本或显示明确的兼容提示。 |
| LP3-REQ-020 | 想法提出者视图必须遍历或正确分页读取全部 Idea，并能按普通 Idea、待澄清、等待执行、执行中、暂停和已完成识别、分组或筛选。组合状态必须从同一 Idea/项目权威关系得出。 |
| LP3-REQ-021 | 想法提出者视图必须为已进入执行的 Idea 展示最新进展、下一步、等待 proposer 的决策请求、支持请求以及最新已确认结论和建议去向；没有相关数据时显示明确空态。 |
| LP3-REQ-022 | 执行者视图必须区分未完成项目（排队、执行中、暂停）和已完成项目，并优先展示状态、阶段、下一步、阻塞、待确认问题、支持请求、更新时间和最新结论。 |
| LP3-REQ-023 | proposer 与 executor 视图必须读取同一服务端权威对象、ID、状态和版本。角色只改变信息组织与突出重点，不创建独立副本，也不赋予身份或额外权限。 |
| LP3-REQ-024 | 页面必须提供明显的角色切换，并把当前角色表达在可分享、可直接打开的 URL 中；刷新、浏览器前进/后退和深链接必须保持角色与目标项目。切换不要求注册、登录或认证。 |
| LP3-REQ-025 | 项目详情必须提供固定权威头、角色相关摘要、最新进展、关注事项、Evidence、结论、确认结果、稳定顺序历史和动态汇报区，并允许读取完整集合而不只依赖有限 preview。 |
| LP3-REQ-026 | Web 必须为首次无数据、空列表、加载中、分页加载、404、API 不可用、readiness 不满足、旧数据和局部渲染失败提供可理解状态及安全重试方式，不能把失败显示为空数据或已成功。 |
| LP3-REQ-027 | Web 的核心浏览、筛选、角色切换、项目详情和确认决策必须支持键盘操作、可见焦点、语义化标签和基本窄屏布局；状态与错误不能只用颜色表达。 |
| LP3-REQ-028 | 公开 Web 访问必须保持只读。只有浏览器持有与单一 LP-02 确认绑定的有效 scoped capability 时，才可以查看其确切摘要并批准或拒绝；能力缺失、过期或不匹配时不得显示为成功或开放其他写操作。 |
| LP3-REQ-029 | 确认 capability、human-control token、AI bearer、cookie、数据库连接信息和完整敏感正文不得进入可读 JavaScript 状态、URL 查询参数、页面内容、客户端诊断、日志或错误。LP-03 不得把声明角色描述为已认证身份。 |
| LP3-REQ-030 | LP-03 API 必须延续 LP-02 的版本化路径、统一成功/错误信封、请求关联、readiness gate 和访问边界，提供机器可读的报告写入/读取契约，并保留冻结的 LP-01 与 LP-02 契约证明。 |
| LP3-REQ-031 | LP-03 必须具有自动化 Schema/语义/安全、持久化、API、组件和浏览器验收测试，覆盖七类块、两个不同报告、无效内容、引用、幂等、revision 冲突、事务回滚、权威隔离、角色视图、深链接、键盘/窄屏和渲染回退。 |
| LP3-REQ-032 | LP-03 准备正式验收前，`docs/project-management.md`、LP-02 计划和 LP-03 计划必须在同一交付变更中同步实际证据：LP-02 为 `Accepted`，记录 `ACCEPTED_NO_PUBLISH`、merge/acceptance/closure 标识和无发布产物；LP-03 为 `Ready for Acceptance` 并指向客观验证证据，但不得提前写成 `Accepted` 或已发布。 |

## Acceptance criteria

| ID | Requirement IDs | Observable criterion |
| --- | --- | --- |
| LP3-AC-001 | LP3-REQ-001、LP3-REQ-030 | Given 一个含 LP-01/LP-02 完整执行数据和确认历史的数据库，when 应用 LP-03 升级并运行既有 API 验收，then 原对象、ID、版本、历史、错误和冻结契约保持可读且测试继续通过。 |
| LP3-AC-002 | LP3-REQ-002–006、LP3-REQ-009 | Given 七类块各一份边界内合法样例，when 提交，then 服务端创建一个不可变 revision；未知字段/块、危险内容、错误表格或超限样例被整体拒绝并返回可定位路径。 |
| LP3-AC-003 | LP3-REQ-007–008、LP3-REQ-017 | Given 汇报引用同项目与其他项目的 Evidence/AttentionItem，并在文本中声称虚假完成状态，when 提交和展示，then 同项目引用由权威数据补全，跨项目引用被拒绝，固定项目头仍显示真实状态。 |
| LP3-AC-004 | LP3-REQ-009–012 | Given 同一内容和幂等身份被重复提交，when 请求重放，then 返回首次 revision 且数量不变；不同内容冲突，基于旧 revision 的并发写入返回当前 revision，事务失败不留部分记录。 |
| LP3-AC-005 | LP3-REQ-013–014、LP3-REQ-019 | Given 一个已完成项目和多份旧/新协议汇报，when 尝试提交、读取、重开后再提交，then 完成态写入被冻结，历史保持不变，重开后可续写，受支持旧版本可读且不支持版本安全降级。 |
| LP3-AC-006 | LP3-REQ-015–016 | Given 两个项目的章节、块类型和顺序完全不同，when 打开详情，then 同一通用渲染器按各自顺序正确显示七类块，DOM 中没有原始 HTML、脚本、危险链接或项目专用组件选择。 |
| LP3-AC-007 | LP3-REQ-014、LP3-REQ-017–019 | Given 最新 accepted revision 被人为触发运行时渲染异常，when 打开项目详情，then 权威头正常、页面显示安全提示并回退上一可渲染版本；无旧版本时显示安全空态且不暴露失败正文。 |
| LP3-AC-008 | LP3-REQ-020–021、LP3-REQ-026 | Given 系统存在普通 Idea、待澄清 Idea 以及排队、执行中、暂停和已完成项目，when 打开 proposer 视图并使用筛选/分页，then 每个 Idea 只进入正确类别，执行项显示最新进展及等待 proposer 的事项和结论。 |
| LP3-AC-009 | LP3-REQ-022–023、LP3-REQ-026 | Given 执行者有多个未完成和已完成项目，when 打开 executor 视图，then 两组清楚分离，未完成项目直接显示下一步、阻塞、待确认、支持请求和更新时间，且引用与 proposer 相同的权威版本。 |
| LP3-AC-010 | LP3-REQ-023–025 | Given 用户从 proposer 切换到 executor、刷新、使用前进/后退并直接打开项目深链接，when 页面重新读取数据，then URL、角色和目标项目保持一致，两视图不生成平行业务状态且无需登录。 |
| LP3-AC-011 | LP3-REQ-017、LP3-REQ-025–026 | Given 项目具有完整 LP-02 历史但没有汇报，when 打开详情，then 固定权威头、执行集合与历史可读取，动态区显示“尚无汇报”而不是错误或空白页面。 |
| LP3-AC-012 | LP3-REQ-028–029 | Given 普通公开浏览器和持有单一有效 scoped confirmation capability 的浏览器，when 打开确认页面并尝试决定，then 前者保持只读，后者只看到对应摘要并可批准或拒绝；过期/错配能力失败且秘密不进入页面、URL 查询或诊断。 |
| LP3-AC-013 | LP3-REQ-026–027 | Given 键盘用户、窄屏以及 API 加载/失败/404 场景，when 完成角色切换、筛选、项目导航和确认决策，then 焦点、标签、状态、错误与重试可理解，布局不遮挡核心信息。 |
| LP3-AC-014 | LP3-REQ-004、LP3-REQ-012、LP3-REQ-018、LP3-REQ-029–031 | Given 校验、保存、审计、读取或渲染各边界发生失败，when 检查数据库、API、页面和日志，then 没有部分 revision、权威事实未变、可安全恢复，且秘密和完整危险正文未泄露。 |
| LP3-AC-015 | LP3-REQ-032 | Given LP-03 准备正式验收，when 查看唯一管理入口及 LP-02/LP-03 计划，then LP-02 显示 `Accepted` 和精确关闭证据、无发布产物，LP-03 显示 `Ready for Acceptance` 和验证证据，LP-04 仍未被自动确认或授权。 |
| LP3-AC-016 | LP3-REQ-001–032 | Given 两个已执行项目，when 分别提交结构和顺序不同的有效汇报并打开双角色页面，再提交危险/无效汇报、制造最新渲染失败并切换角色/深链接，then 通用渲染、权威隔离、错误定位、旧版本回退、角色信息重点和全部历史均符合本快照。 |

## Traceability

| Source | LP-03 coverage |
| --- | --- |
| 原 REQ-014–015、AC-004 | LP3-REQ-020–021、LP3-AC-008 |
| 原 REQ-016–017、AC-006 | LP3-REQ-022、LP3-REQ-025、LP3-AC-009、LP3-AC-011 |
| 原 REQ-018、AC-013 | LP3-REQ-023–024、LP3-AC-010 |
| 原 REQ-021–023、AC-016 | LP3-REQ-002–007、LP3-REQ-009–016、LP3-AC-002、LP3-AC-006 |
| 原 REQ-024、AC-018 | LP3-REQ-007–008、LP3-REQ-017、LP3-AC-003 |
| 原 REQ-025、AC-017 | LP3-REQ-004–005、LP3-REQ-014、LP3-REQ-018–019、LP3-AC-007 |
| LP-03 Slice 5 | LP3-REQ-002–019、LP3-REQ-030–031 |
| LP-03 Slice 6 | LP3-REQ-020–031 |
| LP-02 正式关闭事实 | Current behavior、LP3-REQ-032、LP3-AC-015 |

## Non-goals

- 不重复实现或重新验收 LP-01 的 Idea intake、澄清、推进和基础读取。
- 不重复实现或重新验收 LP-02 的执行转换、进展、关注事项、Evidence、结论和确认
  领域逻辑。
- 不实现 LP-04 的 Codex/Claude Skill、演示数据、演示脚本或 AI 工作流编排。
- 不实现 LP-05 的生产部署、域名、TLS、备份恢复、发布候选或运维证明。
- 不建设注册、登录、账户、成员、RBAC、多租户或企业身份系统。
- 不提供完整的人工新增/编辑项目表单、通用后台、CMS、Dashboard builder 或任意
  拖拽布局系统。
- 不允许项目专用 React 组件、AI 生成 HTML/JavaScript/CSS、动态 import、插件代码、
  自定义脚本或未列入协议的可执行内容。
- 不通过汇报修改项目状态、确认、操作者、审计、Evidence 或 AttentionItem。
- 不提供通用文件上传、对象存储、外链抓取、远程内容预览或第三方嵌入。
- 不建设通知、评论协作、实时推送、离线编辑、全文搜索或高级分析。
- 不默认纳入 LP-02 的 PostgreSQL `55P03` 分类优化；只有它直接阻塞 LP-03 已确认
  行为时才应另行说明。
- 不建立自研 Engineering Lifecycle 授权引擎、GitHub authority checker、通用
  future-state validator、完整 lifecycle simulator 或大规模 mutation harness。
- 不复用 LP-02 或 lightweight planning feature 的实现授权；LP-03 必须独立确认、
  计划、评审、实现和验收。

## Failure and recovery expectations

- 汇报 JSON、Schema、语义、安全或引用无效时，不创建 revision；调用方根据稳定错误
  码和字段路径修正后，以新业务意图重试。
- 网络或 5xx 导致结果未知时，调用方使用相同幂等身份和相同内容重试；系统不得创建
  重复 revision。
- 幂等冲突时保留首次结果；revision 冲突时重新读取最新报告、合并后使用新幂等身份
  提交。
- 事务、数据库或审计写入失败时不更新 accepted/renderable 指针，也不报告成功。
- 最新汇报渲染失败时保留权威头并回退上一可渲染 revision；没有旧版本时显示安全
  空态，修复后的新 revision 可以恢复正常显示。
- Evidence/AttentionItem 被纠正、撤回或改变状态时，汇报原始 JSON 保持不可变，但
  页面补全的权威当前信息随服务端事实更新并保留历史入口。
- API 不可用、readiness 失败、请求超时、分页失败或资源不存在时，页面区分失败与空
  数据，保留已显示内容并提供安全重试或返回入口。
- scoped confirmation capability 过期、错配或已消费时，不执行决定；页面清楚说明需要
  重新获得有效能力，不泄露 token/cookie。
- 不支持的旧协议版本不被猜测渲染；页面使用最近受支持版本或显示兼容提示，原 revision
  仍保留供迁移和审计。

## Public API and compatibility impact

LP-03 将增加结构化汇报提交、当前版本、可渲染版本和 revision 历史读取能力，并增加
可直接访问的 proposer、executor、项目详情和受限确认 Web 表面。具体路由与组件划分
由 Main 的技术计划决定，但每项可观察行为必须有机器可读 API 契约或浏览器验收入口。

报告写入继续使用 AI bearer 访问边界，并复用现有请求关联、结构化错误、幂等与
readiness 语义；报告自身使用 `basedOnRevision` 处理并发。若请求头和报告信封同时
携带请求身份，二者关系必须有单一、明确且可验证的契约，冲突时不得猜测或重复写入。

LP-01/LP-02 已验收路由、ID、字段语义和 frozen OpenAPI 产物必须保持兼容。新增报告
协议通过明确 `schemaVersion` 演进；不得原地改写已保存 revision 或静默改变旧版本
含义。Web 是这些公共读取契约的消费者，不得形成第二套业务规则。

## Safety, privacy, permissions, and authorization

- v0.1 仍是无用户系统的单工作空间演示；proposer/executor 是查看重点，不是已认证
  身份或授权角色。
- 公开 Web 和报告读取沿用公开只读边界，因此演示环境只能使用虚构、非敏感数据，不得
  录入真实商业机密、个人数据、token、cookie 或数据库信息。
- 报告写入要求部署级 AI bearer；公开浏览器不得提交汇报。单次确认决定只接受 LP-02
  已绑定的 scoped capability，不能扩展为一般写权限。
- 汇报内容在服务端严格拒绝危险结构，在浏览器再次按文本/标量安全渲染。禁止 raw
  HTML、危险 URL、脚本、样式、远程嵌入和任意代码执行。
- HTTPS 外链只作为不受系统背书的引用展示；服务端不抓取内容，页面不得把链接存在
  解释为 Evidence 已验证。
- 固定权威区域始终优先于汇报陈述；动态内容不能改变、遮挡或伪装项目状态、确认结果、
  操作者和审计历史。
- capability、bearer、cookie 和连接秘密不得进入客户端可读状态、URL query、持久化
  报告、诊断正文、日志或错误。确认 cookie 的作用域与生命周期不得被 LP-03 放宽。
- 所有字符串、集合、表格和正文必须有大小/复杂度边界；错误与诊断只保留定位所需的
  脱敏摘要。
- 本快照不授权生产凭据配置、真实数据导入、部署、发布、tag 或 GitHub Release。

## Release impact

- LP-03 是 v0.1 的第三个可独立验收切片，不等同于完整 v0.1 或生产发布版本。
- LP-02 已通过 `ACCEPTED_NO_PUBLISH` 关闭；LP-03 文档更新必须保留“已验收但未
  发布”的区别。
- LP-03 通过正式验收后才能解除 LP-04 的验收依赖；不得据此自动确认、实施或验收
  LP-04。
- 本 feature 可以产生本地可构建的 Web 产物用于验收，但不要求发布到域名、服务器、
  package registry 或 GitHub Release；任何外部发布仍需后续明确授权。

## Assumptions

- LP-02 merge commit `644af4f186b054a9c5d1c6db087a97e009f545a3` 是本
  intake 的唯一运行时基线。
- 单工作空间、公开读取、部署级 AI 写入和独立 human-control/confirmation 能力继续
  适用于 LP-03。
- 中文是 v0.1 Web 与错误说明的优先语言；稳定机器字段和协议标识继续使用英文。
- Idea 与项目的组合状态由现有权威关系计算，不在 Web 中另存状态。
- LP-02 已提供的 preview 允许首屏摘要；完整集合和历史通过现有或兼容扩展的分页读取
  获取。
- AI Skill 尚未交付；LP-03 报告 API 可由契约测试或普通 API 客户端调用，不以 LP-04
  Skill 作为验收前置条件。
- 现有结构化汇报 Schema 和协议是 LP-03 的规范输入；如二者与本快照冲突，以用户
  后续明确确认的本快照为准，并在技术计划中记录兼容处理。
- Main 将在技术计划中核验并锁定兼容 Web 依赖，决定服务/静态资源集成方式、路由和
  数据获取实现，但不得削弱本快照的可观察行为、安全边界和失败恢复。
- LP-02 的 `55P03` 诊断分类 follow-up 保持非阻塞，不影响 LP-03 intake 或验收。

## Open questions

无阻塞性开放问题。用户已在 Requirements 任务中明确确认本需求快照。
