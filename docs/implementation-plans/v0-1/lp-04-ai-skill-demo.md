# LP-04 AI Skill 与可重复演示

- Plan ID: `LP-04`
- Source slices: Slice 7
- Primary requirements: REQ-020、REQ-027
- Primary acceptance criteria: AC-001、AC-015

## 1. Goal

提供 Codex、Claude 等兼容客户端可遵循的 AI Skill，并用真实 API、可重复演示数据和
脚本证明核心旅程可以从自然语言意图贯通到权威站点与双角色网页。

## 2. Scope

- 编写 Skill 的角色、字段收集、API 工作流、人类确认边界和错误恢复说明。
- 提供从自然语言意图到稳定 API 请求的示例。
- 建立覆盖 Idea 池、执行中、阻塞、待确认、支持、动态汇报和完成项目的演示数据。
- 提供自动化演示 smoke、端到端故事和人工演示脚本。
- 验证网络未知结果复用请求 ID，Skill 不保存独立项目状态。

## 3. Out of scope

- 新建另一套业务模型、状态存储、MCP Server 或 AI 专用旁路。
- 训练、微调或托管语言模型。
- 修改 LP-01 至 LP-03 已验收的领域、API 或页面范围，除非通过新的需求变更。
- 生产部署、域名、备份恢复和发布候选判断。

## 4. Dependencies

- Acceptance dependency: `LP-03`
- LP-03 已在 merge `818671c504c8b8b8cd41f8ebc096f341ece6b18f` 上通过
  `ACCEPTED_NO_PUBLISH` 验收关闭，release targets 为 `[]`。
- LP-01 至 LP-03 已提供可用的真实 API、确认流、结构化汇报和双角色 Web。
- Planning input:
  [source implementation plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 5. Main deliverables

- `SKILL.md` 及 API 工作流、汇报协议参考。
- 与服务当前契约一致的 OpenAPI 快照或引用。
- 可清理、可重复执行的演示数据生成方式。
- 自动化 demo smoke、浏览器端到端故事和人工演示脚本。
- Codex/Claude 角色旅程、重试和确认边界的证据。

## 6. Implementation stages

1. 按 Slice 7 编写 Skill 主流程与最小字段收集规则。
2. 补齐 API、结构化汇报、幂等重试和人类确认参考。
3. 创建覆盖核心故事的演示数据与人工脚本。
4. 使用真实 API 运行自动化演示和两种兼容 AI 客户端的代表性验证。

## 7. Acceptance checklist

- [x] Codex 与 Claude 各自按 Skill 调用真实 API，并留下可公开重读的代表性客户端证据。
- [x] Skill 对字段不足、API 失败、网络未知和确认拒绝给出明确恢复路径。
- [x] 网络未知时复用原 request ID，不重复创建业务对象；真实 HTTP 跨进程 oracle 已通过。
- [x] Skill 不保存独立状态、不绕过人类确认且不泄露 token。
- [x] 演示数据覆盖 Idea 池、执行中、阻塞、待确认、支持、动态汇报和完成项目。
- [x] 独立人工 facilitator 可重复展示从 Idea 创建到结论归档的核心故事。

至少一个客观验收场景：在干净演示环境中按 Skill 从一段自然语言创建 Idea，经真实
API 推进和汇报，并在模拟网络未知后用同一 request ID 重试；最终只有一条权威记录，
且两个角色页面显示相应结果。

Acceptance record:

- Result: `None`
- Accepted by: `None`
- Accepted at (UTC): `None`
- Evidence: `None`

## 8. Risks and blockers

- Risk: Skill 与 API 漂移；示例和自动化演示必须使用当前契约，不加隐藏参数。
- Risk: 演示脚本只覆盖顺利路径；至少保留网络未知、输入不足和确认拒绝恢复场景。
- Risk: 客户端自报或资源创建成功不能单独授权 PASS；必须同时绑定原始 transcript 摘要、
  闭合 POST request claims、逐条公开请求审计和资源精确读回；拒绝请求须配对精确 transcript
  request/result。
- Blocker: `None`。实际 Codex CLI 与 Claude Desktop/Claude Code 客户端均已完成独立运行，
  且 Cycle 2 保留的混合真实/伪造 request-ID 反例现已 fail closed。

## 9. Status

`Ready for Acceptance`

Skill、确定性 demo、跨进程未知结果恢复、真实 HTTP、人类边界和真实数据双角色浏览器故事
已实现并通过比例化门禁。实际 Codex 与 Claude 客户端证据均为 PASS；该状态只表示可送交
Engineering Review，不表示已审查、已合并、已发布或已正式验收。

## 10. Next step

在无进一步文件变更的 remediation exact head 上执行完整验证矩阵并发送 Cycle 3
Engineering Review。LP-05 保持 `Not Started` 且需求未确认。
