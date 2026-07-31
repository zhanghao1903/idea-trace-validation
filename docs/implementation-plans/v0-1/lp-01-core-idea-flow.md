# LP-01 核心基础与 Idea 流程

- Plan ID: `LP-01`
- Source slices: Slice 0–2
- Primary requirements: REQ-001–005、REQ-011–012、REQ-019
- Primary acceptance criteria: AC-002、AC-003、AC-011、AC-014

## 1. Goal

建立可复现的工程与共享契约基础，完成 Idea 登记、澄清、显式推进、项目关联和角色化
读取，使系统首次拥有可追踪的权威 Idea 流程。

## 2. Scope

- 建立工作区、严格类型、共享契约、统一错误信封和基础 CI。
- 建立 Idea、ValidationProject、ActorContext 和 AuditEvent 的最小持久化模型。
- 实现 Idea/项目生命周期、合法转换、乐观并发和追加式历史。
- 提供创建 Idea、回答澄清、显式推进及 proposer/executor 基础查询 API。
- 建立公开只读、AI 写入和必要 Web 控制的访问边界及 OpenAPI。

## 3. Out of scope

- 进展、阻塞、待确认、支持请求、结论和高影响确认。
- 结构化汇报渲染、完整双角色 Web、AI Skill、演示数据和生产部署。
- 用户、登录、权限组、多租户、MCP 或一个 Idea 对应多个首要项目。

## 4. Dependencies

- Acceptance dependency: `None`
- Planning inputs:
  [confirmed requirements](../../feature/lp-01-core-idea-flow/requirements.md),
  [technical design](../../feature/lp-01-core-idea-flow/design.md),
  [reviewed implementation plan](../../feature/lp-01-core-idea-flow/implementation-plan.md).

## 5. Main deliverables

- 可从锁文件复现的应用、包和测试工作区。
- 共享结构化汇报 schema、错误契约和生成的 OpenAPI。
- 数据库初始迁移、领域状态机、仓储和审计历史。
- Idea intake、clarification、promotion 和角色化读取 API。
- 对应领域、契约和 API 集成测试。

## 6. Implementation stages

1. 按 Slice 0 建立工程骨架、共享契约和基础 CI。
2. 按 Slice 1 实现数据库、领域不变量、生命周期和迁移。
3. 按 Slice 2 实现 API 基础、Idea 命令与查询投影。
4. 同步 OpenAPI、运行说明和错误恢复说明。

## 7. Acceptance checklist

- [x] 从干净环境安装依赖后，格式、类型、契约测试和构建可复现通过。
- [x] 不完整 Idea 分别保存已知信息、假设与澄清问题，不伪造缺失内容。
- [x] 没有显式推进动作时 Idea 持续停留在 Idea 池；推进后只创建一个关联项目。
- [x] 非法状态转换被拒绝，并返回当前状态与可理解的恢复路径。
- [x] 同一请求重放不产生重复记录；版本冲突不覆盖较新的事实。
- [x] proposer/executor 查询读取同一份权威数据，成功操作产生可追踪历史。

至少一个客观验收场景：对同一不完整 Idea 请求重放两次，系统只保留一个 Idea，
仍处于待澄清状态；明确推进后生成唯一项目，随后发起非法转换得到确定性拒绝。

Acceptance record:

- Result: `ACCEPTED_NO_PUBLISH`
- Merge commit:
  `b562a3c0ede8384afef2007b8057a1250650a39f`
- Acceptance ID:
  `35d19b6c45c96c037c011b8c0f371ebfd454ff4b762492e70e6dc98e0ee9ef4a`
- Closure ID:
  `82e0fb86b20b1f82e04d6ec4aa53a094e8cc32ea8ad3a7dfed3d2258ccb5188d`
- Release targets: `[]`
- Release artifacts: `None` — no tag, GitHub Release, package or deployment was
  created.
- Evidence:
  [LP-01 verification](../../feature/lp-01-core-idea-flow/verification.md)

## 8. Risks and blockers

- Risk: 状态机或持久化约束返工会影响所有后续计划；先固定领域不变量再扩展页面。
- Risk: 访问边界可能被误写成身份系统；v0.1 只声明操作者归属，不声称已认证身份。
- Blocker: `None`

## 9. Status

`Accepted`

Engineering Lifecycle 已用 `ACCEPTED_NO_PUBLISH` 记录正式接受并关闭本 feature；
关闭不包含发布授权或发布产物。

## 10. Next step

作为 LP-02 已满足的验收依赖继续保留完整关闭证据；不自动授权发布，也不自动改变
LP-02 或后续计划状态。
