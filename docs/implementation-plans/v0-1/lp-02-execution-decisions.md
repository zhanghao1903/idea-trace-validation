# LP-02 项目执行与决策闭环

- Plan ID: `LP-02`
- Source slices: Slice 3–4
- Primary requirements: REQ-006–010、REQ-013
- Primary acceptance criteria: AC-005、AC-007、AC-008、AC-009、AC-010、AC-012

## 1. Goal

让执行者能够提交项目进展、难点、待确认问题、支持请求、证据和验证结论，并让高影响
操作经过可追踪的人类确认，形成可纠正、可重开的执行闭环。

## 2. Scope

- 实现开始、暂停、恢复等非终态转换。
- 实现追加式进展、阻塞、待确认问题、支持请求、回应和 Evidence 元数据。
- 实现结论版本、限制、不确定性与继续、调整、停止、移交建议。
- 实现摘要绑定、过期和单次使用的人类确认。
- 支持纠正、撤销、完成和带原因重开，并保留原历史。

## 3. Out of scope

- Idea intake、基础状态机和查询投影；这些由 LP-01 交付。
- 结构化汇报、双角色完整页面、AI Skill、演示数据和部署。
- 通用文件上传、外部 URL 抓取、通知系统或复杂审批流。

## 4. Dependencies

- Acceptance dependency: `LP-01`
- LP-01 必须已提供稳定的项目聚合、版本控制、审计事件、仓储和 API 错误契约。
- Planning inputs:
  [domain model](../../feature/v0-1-project-plan/domain-model.md) 与
  [source implementation plan](../../feature/v0-1-project-plan/implementation-plan.md).

## 5. Main deliverables

- 项目转换、进展、关注事项、证据、结论和确认 API。
- 追加式业务记录及与项目写入同事务的审计事件。
- 人类确认 token 的安全存储、交换、过期和重放保护。
- 项目详情查询和进展、事项、证据、结论历史。
- 执行工作流与确认流程的集成和端到端测试。

## 6. Implementation stages

1. 按 Slice 3 实现非终态转换和执行事实。
2. 实现追加式纠正、回应与历史读取，验证并发冲突。
3. 按 Slice 4 实现结论版本和高影响操作确认。
4. 实现完成、停止、移交与重开恢复路径及安全检查。

## 7. Acceptance checklist

- [ ] 进展包含摘要、完成工作、当前状态、下一步、证据和时间，且不隐式改变状态。
- [ ] 阻塞解除后仍可读取背景、影响、原状态和解除说明。
- [ ] 待确认问题及支持请求在响应或关闭后保留原描述和回应。
- [ ] 验证结论同时记录证据、限制、不确定性和建议去向。
- [ ] 完成、停止、移交和重开只在有效人类确认后生效。
- [ ] token 过期、重复使用、摘要变化或版本冲突均失败且不产生部分写入。
- [ ] 纠正、暂停、重开或撤销不静默删除历史。

至少一个客观验收场景：创建阻塞、待确认问题和支持请求，分别解决后读取完整历史；
提交带证据与限制的结论，经一次性人类确认完成项目，再填写原因确认重开，原完成结论
仍然可追踪。

Acceptance record:

- Result: `None`
- Accepted by: `None`
- Accepted at (UTC): `None`
- Evidence: `None`

## 8. Risks and blockers

- Risk: 确认机制过度扩大；只保护已确认的高影响操作，不让普通进展逐条等待批准。
- Risk: 追加式记录与项目状态不同步；所有权威写入和审计事件保持同一事务。
- Blocker: `None`

## 9. Status

`Not Started`

LP-01 未验收前，本计划可以准备非依赖设计，但不能进入
`Ready for Acceptance`。

## 10. Next step

为 LP-02 启动独立 Engineering Lifecycle Requirements 阶段，并以 LP-01 的实际
验收结果重新确认 API 与数据迁移边界。
