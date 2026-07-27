# v0.1 实施计划

- Status: Completed F3 Plan
- Feature: `v0-1-project-plan`
- Target demo date: 2026-08-06
- Technical architecture: [technical-architecture.md](./technical-architecture.md)
- Requirements baseline: `aedb210b95cbbeabc69ce776ed6966b36677196b`
- Updated: 2026-07-27

## 1. 计划目标

在不扩大确认需求的前提下，以可独立验证的代码切片实现：

```text
Idea 登记/澄清
-> 明确进入执行
-> 项目进展、问题、支持与证据
-> 结构化汇报
-> 双角色 Web
-> 人类确认结论
-> 完成/重开
-> Skill + 演示数据
-> 单机部署
```

每个切片都必须包含实现、测试、文档和可回滚提交。不得先堆积全部代码再统一验证。

## 2. 范围冻结

### Must

- 单工作空间，无注册登录；
- Idea、澄清、等待执行、执行中、暂停、完成、重开；
- 进展、阻塞、待确认问题、支持请求、证据、结论；
- 高影响操作的人类确认；
- Codex/Claude 可使用的 REST API 和 Skill；
- 想法提出者/执行者双视图；
- 七类结构化汇报块、安全校验与旧版本回退；
- 幂等、并发冲突、审计历史和明确错误；
- Docker Compose、个人域名 HTTPS、备份恢复和演示脚本。

### 本期不做

- MCP；
- 用户、登录、角色权限、多租户；
- 通用文件上传和对象存储；
- Web 完整手工新增/编辑表单；
- AI HTML/JavaScript/CSS；
- WebSocket、消息队列、微服务；
- 服务端抓取外部 URL；
- 企业级监控、高可用和水平扩展。

出现范围压力时只能削减非 Must 的视觉润色和辅助筛选，不能删除状态可信、确认、
错误恢复、报告安全或演示主链路。

## 3. 目标仓库结构

首个实现切片创建：

```text
package.json
package-lock.json
tsconfig.base.json
eslint.config.js
.prettierrc.json
.editorconfig
.env.example
.gitignore

apps/api/
apps/web/
packages/contracts/
packages/domain/
packages/application/
packages/db/
skills/idea-validation/
tests/contract/
tests/integration/
tests/e2e/
deploy/
scripts/
.github/workflows/ci.yml
```

现有 `docs/feature/v0-1-project-plan/` 保持为功能事实和设计入口。

## 4. 切片计划

### Slice 0 — 工程骨架与契约单一来源

**目标日期：2026-07-28 上午**

文件：

```text
package.json
package-lock.json
tsconfig.base.json
eslint.config.js
.prettierrc.json
.editorconfig
.env.example
.gitignore
apps/api/package.json
apps/web/package.json
packages/*/package.json
packages/contracts/schemas/structured-report.v1.schema.json
packages/contracts/src/report.ts
packages/contracts/src/errors.ts
packages/contracts/src/index.ts
tests/contract/structured-report.test.ts
.github/workflows/ci.yml
```

工作：

1. 建立 npm workspaces、TypeScript strict、lint、format、Vitest 和统一脚本。
2. 将 Report Schema 从 docs 移到 `packages/contracts/schemas/`，更新文档链接。
3. 使用 `Ajv2020` strict + formats 编译 Schema。
4. 固化统一成功/错误信封和稳定错误码类型。
5. CI 先运行 format、lint、typecheck、contract test 和 build。

门禁：

- `npm ci` 从空缓存可复现；
- 七种块正例和危险/未知字段反例通过；
- contracts 不依赖 API、DB 或 Web；
- Lockfile 和 Node engine 固定。

提交：`build: scaffold workspace and shared contracts`

### Slice 1 — 数据库与领域状态机

**目标日期：2026-07-28 下午**

文件：

```text
packages/domain/src/shared/*
packages/domain/src/ideas/*
packages/domain/src/projects/*
packages/domain/src/confirmations/*
packages/domain/test/*
packages/db/src/schema/*
packages/db/src/client.ts
packages/db/src/repositories/*
packages/db/migrations/0001_initial.sql
packages/db/drizzle.config.ts
tests/integration/database-lifecycle.test.ts
deploy/compose.yaml
```

工作：

1. 实现类型化 ID、ActorContext、领域错误和时间抽象。
2. 实现 Idea/Project 状态机、结论与确认摘要。
3. 建立所有 v0.1 表、约束和索引。
4. 实现仓储端口及 Drizzle PostgreSQL 适配器。
5. 用 Testcontainers 或独立测试数据库验证迁移和事务。

门禁：

- 所有合法/非法状态转换单测；
- 一个 Idea 不能绑定两个项目；
- 完成必须有 confirmed 结论；
- 版本冲突不覆盖；
- 迁移可对空数据库执行。

提交：`feat: add domain lifecycle and database schema`

### Slice 2 — API 基础、Idea 与查询投影

**目标日期：2026-07-29**

文件：

```text
apps/api/src/app.ts
apps/api/src/server.ts
apps/api/src/config.ts
apps/api/src/plugins/error-handler.ts
apps/api/src/plugins/request-context.ts
apps/api/src/plugins/write-token.ts
apps/api/src/plugins/web-control.ts
apps/api/src/routes/health.ts
apps/api/src/routes/control-session.ts
apps/api/src/routes/ideas.ts
apps/api/src/routes/projects-read.ts
packages/application/src/commands/create-idea.ts
packages/application/src/commands/answer-clarification.ts
packages/application/src/commands/promote-idea.ts
packages/application/src/queries/*
tests/integration/api-ideas.test.ts
```

工作：

1. 启动 Fastify、配置校验、统一错误、日志脱敏和健康检查。
2. 实现创建 Idea、澄清回答和显式推进。
3. 实现 proposer/executor 查询投影、游标分页和允许操作。
4. 实现公开只读、AI Bearer token 和 Web 控制能力三种访问边界。
5. 写 API response schema，生成 OpenAPI。

门禁：

- 不完整 Idea 保留澄清问题；
- 未显式推进不创建项目；
- 相同请求幂等重放只生成一条记录；
- 两种视图读取相同权威数据；
- 控制 token 不进入日志，交换后使用安全 cookie；
- OpenAPI 生成无差异。

提交：`feat: expose idea intake and role projections`

### Slice 3 — 项目执行事实

**目标日期：2026-07-30**

文件：

```text
apps/api/src/routes/project-transitions.ts
apps/api/src/routes/progress-updates.ts
apps/api/src/routes/attention-items.ts
apps/api/src/routes/evidence.ts
packages/application/src/commands/project/*
packages/application/src/queries/project-detail.ts
tests/integration/api-project-workflow.test.ts
```

工作：

1. 实现开始、暂停、恢复等非终态转换。
2. 实现进展、阻塞、待确认问题、支持请求和回应。
3. 实现 Evidence 元数据与 HTTPS 外链；不 fetch、不上传。
4. 实现追加式纠正和历史读取。

门禁：

- 进展不能隐式改变状态；
- 事项解决保留原记录和回应；
- 非 HTTPS 与跨项目证据引用被拒绝；
- 并发版本冲突返回 409；
- 审计事件与业务写入同事务。

提交：`feat: add project progress attention and evidence`

### Slice 4 — 结论与人类确认

**目标日期：2026-07-31**

文件：

```text
apps/api/src/routes/conclusions.ts
apps/api/src/routes/confirmations.ts
packages/application/src/commands/submit-conclusion.ts
packages/application/src/commands/request-confirmation.ts
packages/application/src/commands/decide-confirmation.ts
packages/db/src/repositories/confirmation-repository.ts
apps/web/src/features/confirmation/*
tests/integration/confirmation-flow.test.ts
tests/e2e/confirmation.spec.ts
```

工作：

1. 实现结论版本、限制、不确定性与四种建议去向。
2. 实现摘要绑定、30 分钟过期、单次 token hash。
3. 实现 fragment token 交换、HttpOnly cookie、批准/拒绝。
4. 完成、停止、移交和重开必须通过确认。

门禁：

- 原 token 不入库、不入日志；
- token 过期、重复使用、摘要或版本变化均失败；
- 单次确认可原子批准结论与对应终态；
- 重开必须有原因且保留完成结论和历史。

提交：`feat: add human confirmation for high-impact changes`

### Slice 5 — 结构化汇报 API 与渲染器

**目标日期：2026-08-01**

文件：

```text
packages/contracts/src/report-validator.ts
packages/application/src/commands/submit-report.ts
packages/db/src/repositories/report-repository.ts
apps/api/src/routes/reports.ts
apps/web/src/report-renderer/report-renderer.tsx
apps/web/src/report-renderer/blocks/*
apps/web/src/report-renderer/report-error-boundary.tsx
tests/contract/report-semantic.test.ts
tests/integration/report-revisions.test.ts
apps/web/src/report-renderer/*.test.tsx
```

工作：

1. 实现协议中的九步校验管线。
2. 保存不可变 revision、摘要、latest accepted/renderable 指针。
3. 实现七种固定块组件、受限 Markdown 和权威引用补全。
4. 实现渲染错误回退和安全诊断。

门禁：

- AC-016 的两个完全不同项目报告通过；
- 无效报告不创建 revision；
- 汇报声称虚假状态时权威项目头不变；
- 幂等和 `basedOnRevision` 并发测试通过；
- 人为块异常回退上一可渲染版本。

提交：`feat: validate version and render structured reports`

### Slice 6 — 双角色 Web

**目标日期：2026-08-02**

文件：

```text
apps/web/src/main.tsx
apps/web/src/app/router.tsx
apps/web/src/api/client.ts
apps/web/src/features/role-switcher/*
apps/web/src/features/proposer/*
apps/web/src/features/executor/*
apps/web/src/features/project-detail/*
apps/web/src/styles/*
apps/web/src/**/*.test.tsx
tests/e2e/role-views.spec.ts
```

工作：

1. 建立无需登录的角色切换和可分享 URL。
2. 想法提出者视图实现状态分组、进度、待确认和支持。
3. 执行者视图区分未完成/已完成，突出下一步、阻塞和事项。
4. 项目详情固定权威头 + 动态汇报区 + 历史。
5. 公开访问保持只读；控制 cookie 启用必要确认、纠偏和状态操作。
6. 不做完整编辑表单。

门禁：

- 刷新和直接 URL 保持视图；
- 空、加载、失败、旧数据状态明确；
- 键盘导航和基本移动端布局可用；
- 两类视图不维护独立客户端状态副本。

提交：`feat: add proposer and executor web views`

### Slice 7 — Skill 与演示闭环

**目标日期：2026-08-03**

文件：

```text
skills/idea-validation/SKILL.md
skills/idea-validation/references/api-workflows.md
skills/idea-validation/references/report-protocol.md
scripts/seed-demo.ts
scripts/run-demo-smoke.ts
tests/e2e/demo-story.spec.ts
docs/demo-script.md
docs/api/openapi.json
```

工作：

1. Skill 明确角色、字段收集、确认边界、幂等重试和错误恢复。
2. 创建覆盖 Idea 池、执行中、阻塞、待确认、支持、动态报告和完成项目的演示数据。
3. 实现完整演示故事自动化测试和人工脚本。
4. 使用真实 API，不允许 Skill 保存独立状态或绕过确认。

门禁：

- 从自然语言意图到 API 请求的示例完整；
- 网络未知结果复用 request ID；
- Skill 不泄露 token；
- `demo-story.spec.ts` 覆盖 AC-001–019 的主路径。

提交：`feat: add ai skill and repeatable demo workflow`

### Slice 8 — 部署、恢复与加固

**目标日期：2026-08-04**

文件：

```text
deploy/Dockerfile
deploy/compose.yaml
deploy/compose.production.yaml
deploy/Caddyfile
scripts/migrate.ts
scripts/backup.sh
scripts/restore-smoke.sh
scripts/deploy-smoke.sh
docs/deployment.md
docs/operations.md
CHANGELOG.md
```

工作：

1. Multi-stage 构建 React 并复制到 App 镜像。
2. Compose 设置私有网络、健康检查、命名卷、只读容器和 restart policy。
3. Caddy 设置域名、HTTPS、CSP、安全头和请求大小边界。
4. 实现备份、恢复 smoke、迁移和部署 smoke。
5. 完成环境变量、密钥轮换和故障处理说明。

门禁：

- `docker compose config --quiet`；
- App/DB 健康顺序正确；
- 空服务器可按文档启动；
- 备份能恢复到临时数据库并读取演示数据；
- 日志中无 token、cookie、数据库 URL 或正文。

提交：`ops: add production deployment backup and recovery`

### Slice 9 — 发布候选验证

**目标日期：2026-08-05；2026-08-06 为缓冲与用户验收**

工作：

1. 运行全部 CI、浏览器 E2E、契约和迁移测试。
2. 对生产候选执行完整演示脚本。
3. 校对 OpenAPI、Skill、部署文档、Changelog 和已知限制。
4. 检查无私密数据、生成物、临时文件和无关改动。
5. 用户提供服务器/域名并明确授权后，部署生产候选。
6. 记录实际域名、镜像摘要、数据库迁移、备份和 smoke 结果。

门禁：

- Must 场景全部通过；
- 所有 required checks 为绿色；
- 部署与恢复均有可重复证据；
- 仍未证明的外部条件明确列为限制；
- 稳定 PR 候选存在后才进入 F6 并发送独立审查。

提交：仅提交验证中发现的必要修复和证据文档，不制造空的“验证完成”提交。

## 5. 日程与关键路径

| 日期 | 关键结果 | 不能延后的门禁 |
| --- | --- | --- |
| 07-27 | F2 架构 + F3 计划 | 范围和边界明确 |
| 07-28 | 工程、契约、DB、状态机 | 迁移与状态机测试 |
| 07-29 | Idea API 与读取投影 | Idea 不自动执行 |
| 07-30 | 项目执行事实 | 事务、审计、并发 |
| 07-31 | 结论与人类确认 | token/摘要/重开规则 |
| 08-01 | 结构化汇报 | 安全、版本、回退 |
| 08-02 | 双角色 Web | 权威头与角色投影 |
| 08-03 | Skill 与演示 | 真实 API 端到端 |
| 08-04 | 部署与恢复 | HTTPS、备份恢复 |
| 08-05 | 发布候选 | 全量测试与文档 |
| 08-06 | 用户验收与缓冲 | 外部部署证明 |

关键路径是：契约 → 数据库/状态机 → API → 确认/报告 → Web → Skill → 部署。
视觉润色不能阻塞该路径。

## 6. 每个切片的统一完成定义

每个切片必须同时满足：

1. 代码只在指定模块内，不引入无关重构。
2. 新行为有确定性单元/集成/契约测试。
3. 错误、幂等、并发和恢复路径有至少一个反例测试。
4. API Schema、OpenAPI、Skill 或用户文档同步更新。
5. `format:check`、`lint`、`typecheck`、相关测试和 build 通过。
6. 没有 token、个人配置、构建产物、数据库卷或演示私密数据进入提交。
7. 提交只包含该切片，推送后远端 SHA 与本地一致。

## 7. 测试矩阵

| 层 | 目录 | 重点 |
| --- | --- | --- |
| Domain | `packages/domain/test` | 状态机、不变量、摘要、重开 |
| Contract | `tests/contract` | OpenAPI、Report Schema、错误信封 |
| DB integration | `tests/integration` | 迁移、事务、约束、幂等、并发 |
| API integration | `tests/integration` | 状态码、鉴权、请求大小、恢复 |
| Web unit | `apps/web/src/**/*.test.tsx` | 七块、角色视图、错误边界 |
| Browser E2E | `tests/e2e` | 核心故事、确认、回退、双视图 |
| Deployment | `scripts/*smoke*` | Compose、迁移、HTTPS、备份恢复 |

最少端到端场景：

1. 不完整 Idea 留在待澄清。
2. Idea 长期不执行。
3. 明确推进、开始、汇报进展。
4. 阻塞、待确认问题、支持请求及回应。
5. 两个项目渲染完全不同的报告。
6. 无效报告与运行时错误回退。
7. 人确认结论后完成。
8. 填写原因并确认重开。
9. 网络超时后幂等重试。
10. 想法提出者和执行者看到不同重点但相同权威状态。

## 8. 风险与触发动作

| 风险 | 预警 | 动作 |
| --- | --- | --- |
| 依赖/脚手架耗时 | 07-28 中午仍不能跑 CI | 减少工具插件，不改变技术边界 |
| 数据模型返工 | 状态转换或确认无法用单事务表达 | 停止 Web，先修领域和迁移 |
| 报告渲染过度设计 | 08-01 中午七块未全部工作 | 不增加新块，只完成协议七块 |
| Web 视觉拖延 | 08-02 主视图未贯通 | 使用简单 CSS，取消动画和装饰 |
| Skill 与 API 不一致 | 人工示例需特殊参数 | 修 API/Skill 契约，不加隐藏旁路 |
| 服务器/DNS 未准备 | 08-03 前无访问信息 | 本地 Compose 完成，明确外部 blocker |
| 敏感数据风险 | 计划放入真实公司数据 | 停止，改用演示数据或返回需求任务 |

## 9. 部署所需外部输入

最迟 2026-08-03 需要：

- 个人服务器 SSH/部署方式；
- 域名和 DNS 修改能力；
- 80/443 端口可访问；
- 生产数据库/备份目录磁盘容量；
- `AI_API_TOKEN` 和确认 token pepper 的生成方式；
- Web 控制 token 的生成、hash 配置和安全交付方式；
- 是否允许公开展示演示数据；
- 明确的生产部署授权。

缺少这些输入不阻塞本地实现，但会阻塞 REQ-026 的外部证明。不得把凭据写入 Issue、
PR、日志、演示数据或仓库。

## 10. 回滚策略

- 每个切片独立提交，代码问题回滚到上一提交。
- 数据库迁移保持 additive；App 回滚后仍能读取旧字段。
- 生产发布前备份；迁移失败不启动新 App。
- 报告协议按版本读取，旧 revision 不重写。
- 高影响操作失败保持 `PENDING_CONFIRMATION` 或原状态，不做部分完成。
- 不使用 `git reset --hard`、强制推送或生产 `drizzle push --force`。

## 11. 文档与发布记录

实现过程中持续维护：

```text
docs/feature/v0-1-project-plan/*
docs/api/openapi.json
docs/demo-script.md
docs/deployment.md
docs/operations.md
skills/idea-validation/*
CHANGELOG.md
```

Changelog 以用户场景描述 v0.1，不罗列内部重构。真正发布版本、镜像和域名记录只在用户
明确要求并完成外部验证后填写。

## 12. 需求到切片的追踪

| 需求范围 | 实现切片 |
| --- | --- |
| REQ-001–005 Idea 与推进 | Slice 1–2 |
| REQ-006–013 执行事实、状态、历史和恢复 | Slice 1、3–4 |
| REQ-014–018 双角色 Web | Slice 2、6 |
| REQ-019 API 契约、幂等和错误 | Slice 0、2–5 |
| REQ-020 Skill | Slice 7 |
| REQ-021–025 结构化汇报 | Slice 0、5–6 |
| REQ-026 部署 | Slice 8–9 |
| REQ-027 演示数据 | Slice 7、9 |
| REQ-028 领域、协议、架构和计划 | 已由 F2/F3 文档完成 |

## 13. F3 完成门禁

本计划已给出：

- 精确模块、目录和主要文件；
- 九个可提交切片及依赖顺序；
- 单元、契约、集成、浏览器和部署检查；
- 文档、Skill、Changelog、部署和恢复工作；
- 2026-07-28 至 2026-08-06 的关键路径；
- 范围控制、风险触发、回滚和外部证明。

本文档提交后 F3 完成。下一阶段为 F4，从 Slice 0 开始，不允许跳过契约、
状态机和数据库门禁直接制作页面。
