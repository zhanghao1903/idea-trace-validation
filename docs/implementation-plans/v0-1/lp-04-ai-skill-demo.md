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
- LP-01 至 LP-03 必须已提供可用的真实 API、确认流、结构化汇报和双角色 Web。
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

- [ ] Codex 或 Claude 可按 Skill 将自然语言 Idea 创建为唯一且可读取的权威记录。
- [ ] Skill 对字段不足、API 失败、网络未知和确认拒绝给出明确恢复路径。
- [ ] 网络未知时复用原 request ID，不重复创建业务对象。
- [ ] Skill 不保存独立状态、不绕过人类确认且不泄露 token。
- [ ] 演示数据覆盖 Idea 池、执行中、阻塞、待确认、支持、动态汇报和完成项目。
- [ ] 人工脚本可重复展示从 Idea 创建到结论归档的核心故事。

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
- Blocker: `None`

## 9. Status

`Not Started`

LP-03 未验收前，可以准备文案结构，但不能把 mock 或静态页面演示当作真实闭环证据。

## 10. Next step

为 LP-04 启动独立 Engineering Lifecycle Requirements 阶段，并选择当时可用的
Codex/Claude 客户端和演示环境作为可复现验收输入。
