# Implementation Plan: LP-01 核心基础与 Idea 流程

- Status: F3 Implementation Plan — Awaiting Technical Plan Review
- FeatureId: `lp-01-core-idea-flow-7a4c1e9d2b60`
- Branch: `codex/lp-01-core-idea-flow`
- Requirements: [requirements.md](./requirements.md)
- RequirementsCommit: `42078fa3e2b20cb599ef795a88ee37377897c5ab`
- Design: [design.md](./design.md)
- DesignCommit: `51c186be9834bfbd9e979f76dff0d8bda7e348a3`

## 1. Scope

### In scope

- 创建 Node.js/npm workspace、锁文件、静态检查、构建、测试和 CI 基础。
- 创建 Fastify API、TypeBox 契约、OpenAPI、统一响应和错误处理。
- 创建框架无关领域层、application commands/queries 和 PostgreSQL adapter。
- 创建 LP-01 初始 migration、固定工作空间和准确 readiness。
- 实现 Idea 创建、澄清回答、显式推进和 Idea/项目基础读取。
- 实现写入认证、幂等重放/冲突、版本检查、唯一项目和原子 audit history。
- 移动并验证现有结构化汇报 Schema，保持唯一规范源。
- 用真实 PostgreSQL 完成集成、并发、失败注入和客观验收测试。
- 更新 README、LP-01 计划状态/证据和 Changelog。

### Out of scope

- LP-02 的项目执行和决策闭环。
- LP-03 的报告 API、报告渲染和 Web。
- LP-04 的 Skill、演示数据和完整演示脚本。
- LP-05 的生产部署、备份、TLS 和发布候选。
- 身份系统、多租户、消息队列、WebSocket、MCP、文件上传或对象存储。
- 自研 authorization engine、lifecycle simulator、GitHub checker 或 mutation harness。

## 2. Preconditions And Stop Conditions

- exact RequirementsHandoff
  `cef454b9c14ad77d3df0318cd908aa6475b41d72d22a29d8ea76540bd4169996`
  已由 Main 接受。
- Requirements branch tip 已核对为
  `42078fa3e2b20cb599ef795a88ee37377897c5ab`。
- F2 design 已单独提交并推送。
- 本计划必须获得 exact-commit Technical Plan Review PASS 后才能创建 F4 Goal 或写代码。
- 若 Review 发现需求、设计或计划不一致，只修订 F2/F3 并重新送审。
- 若实现需要改变公开路由、状态、表约束、幂等算法、访问边界或依赖主版本，停止 F4，
  修订技术计划并重新审查。
- F4 必须逐列、逐字段实现 design §7.1–7.4 和 §9.4；不得在代码阶段自行新增默认值、
  nullable、删除/TTL、请求字段、响应字段或 config alias。
- 不因 LP-01 实现自动开始 LP-02，也不把 LP-01 验收描述为完整 v0.1 发布。

### Cycle 1 remediation

| Finding | Plan remediation |
| --- | --- |
| TPR-001 | Design §7.1–7.4 锁定十张表、字段、类型、owner、约束、索引、changed fields 和全部对象 retention；§9.4 锁定 request/response/error/config Shape |
| TPR-002 | Design §8.4 增加 end-to-end sequence diagram 和 Idea lifecycle state diagram |
| TPR-003 | Design §12 统一为 config 合法后始终监听；health/OpenAPI 不 gate；全部业务 API 未 ready 时 503 |
| TPR-004 | 本 plan 头部和 §12 使用当轮 exact design authority |

### Cycle 2 remediation

| Finding | Plan remediation |
| --- | --- |
| TPR-001 | Design §9.4 新增 `ProjectAuthorityDto`、`ProjectMutationDto`、project summary/detail 的 proposer/executor discriminated focus Shape、nullability 和 route data |
| TPR-005 | §9.1 的 create/promotion 示例改为单一合法值，并与权威 enum/Actor 条件一致 |
| TPR-006 | `audit_events.actor_type`/`actor_role` 拆为独立列；`ActorInput` optional 与 `ActorDto` required-null 分开 |
| TPR-007 | `idempotency_records.response_payload` 只保存 success data 或 rejection error；adapter 统一重建 envelope |

## 3. Target Repository Structure

### 3.1 Root and automation

| File | Action | Purpose |
| --- | --- | --- |
| `package.json` | Create | npm workspaces、精确依赖和标准命令 |
| `package-lock.json` | Create | 可重复解析的唯一 npm lockfile |
| `.nvmrc` | Create | 固定 Node.js `24.18.0` |
| `.npmrc` | Create | lockfile 和严格 engine 策略 |
| `tsconfig.base.json` | Create | 严格共享 TypeScript 配置 |
| `tsconfig.json` | Create | project references |
| `eslint.config.js` | Create | ESLint 10 flat config |
| `.prettierrc.json` / `.prettierignore` | Create | 格式契约 |
| `.gitignore` | Update | 忽略 build、coverage、本地 env 和数据库产物 |
| `.env.example` | Create | 无秘密的配置说明 |
| `compose.yaml` | Create | 本地 PostgreSQL `17.10-alpine` 验证服务 |
| `.github/workflows/ci.yml` | Create | clean install、静态、构建和真实 DB 测试 |
| `README.md` | Create | 安装、配置、命令、API 和访问边界 |
| `CHANGELOG.md` | Update | 记录计划和后续 LP-01 运行时能力 |

### 3.2 API application

| Path | Purpose |
| --- | --- |
| `apps/api/package.json` | API workspace scripts and dependencies |
| `apps/api/tsconfig.json` | API project reference |
| `apps/api/src/config.ts` | 环境解析和秘密安全边界 |
| `apps/api/src/logger.ts` | Pino redact 配置 |
| `apps/api/src/authenticate-write.ts` | bearer token 验证 |
| `apps/api/src/errors.ts` | application/domain 到 HTTP 错误映射 |
| `apps/api/src/app.ts` | Fastify plugins、OpenAPI 和路由注册 |
| `apps/api/src/server.ts` | 启停、连接池和信号处理 |
| `apps/api/src/routes/health.ts` | live/ready |
| `apps/api/src/routes/ideas.ts` | create/list/detail |
| `apps/api/src/routes/clarifications.ts` | answer command |
| `apps/api/src/routes/promotions.ts` | promote command |
| `apps/api/src/routes/projects.ts` | list/detail |
| `apps/api/test/*` | HTTP contract/integration/security tests |

### 3.3 Shared contracts

| Path | Purpose |
| --- | --- |
| `packages/contracts/package.json` | contract workspace |
| `packages/contracts/src/common.ts` | Actor、ID、pagination、success/error envelope |
| `packages/contracts/src/ideas.ts` | Idea request/response schemas |
| `packages/contracts/src/clarifications.ts` | answer schemas |
| `packages/contracts/src/promotions.ts` | promotion schemas |
| `packages/contracts/src/projects.ts` | project schemas |
| `packages/contracts/src/health.ts` | health schemas |
| `packages/contracts/src/openapi.ts` | OpenAPI generation entry |
| `packages/contracts/schemas/structured-report.v1.schema.json` | 移入的报告唯一 Schema |
| `packages/contracts/test/*` | Schema/OpenAPI/response contract tests |
| `docs/feature/v0-1-project-plan/structured-report-protocol.md` | Update | 指向移动后的唯一 Schema |
| `docs/feature/v0-1-project-plan/schemas/structured-report.v1.schema.json` | Move | 删除旧位置，避免双规范源 |

### 3.4 Domain and application

| Path | Purpose |
| --- | --- |
| `packages/domain/src/idea.ts` | Idea aggregate、版本和状态计算 |
| `packages/domain/src/statement.ts` | 事实、假设和纠正链规则 |
| `packages/domain/src/clarification.ts` | 问题/回答追加规则 |
| `packages/domain/src/project.ts` | 项目创建和唯一关联规则 |
| `packages/domain/src/policies/promotion.ts` | 明确推进前置条件 |
| `packages/domain/src/errors.ts` | 稳定业务错误 |
| `packages/domain/test/*` | 领域 unit tests |
| `packages/application/src/ports/*` | repository、clock、ID、transaction ports |
| `packages/application/src/commands/create-idea.ts` | 创建命令 |
| `packages/application/src/commands/answer-clarification.ts` | 澄清命令 |
| `packages/application/src/commands/promote-idea.ts` | 推进命令 |
| `packages/application/src/queries/*` | Idea/项目列表和详情投影 |
| `packages/application/src/idempotency.ts` | digest 和统一命令执行协议 |
| `packages/application/src/audit.ts` | 脱敏 history 构造 |
| `packages/application/test/*` | command/query tests with explicit fakes |

### 3.5 PostgreSQL adapter

| Path | Purpose |
| --- | --- |
| `packages/db/drizzle.config.ts` | migration generation config |
| `packages/db/src/schema/*` | LP-01 table definitions |
| `packages/db/src/repositories/*` | PostgreSQL repository adapters |
| `packages/db/src/transaction.ts` | transaction 和 lock-timeout |
| `packages/db/src/migrate.ts` | migration runner |
| `packages/db/src/readiness.ts` | DB 和 migration check |
| `packages/db/migrations/0001_lp01_core.sql` | 可审阅初始 SQL migration |
| `packages/db/migrations/meta/*` | Drizzle migration metadata |
| `packages/db/test/*` | 约束、transaction、concurrency tests |

### 3.6 Test support and evidence

| Path | Purpose |
| --- | --- |
| `scripts/generate-openapi.ts` | 生成 committed OpenAPI artifact |
| `scripts/check-openapi.ts` | 失败于 OpenAPI drift |
| `scripts/test-db.ts` | 创建/销毁隔离测试数据库，不接触共享数据库 |
| `scripts/lp01-acceptance.ts` | 执行 LP1-AC-014 客观场景 |
| `openapi/lp01.v1.json` | 从路由 Schema 生成的机器可读契约 |
| `docs/feature/lp-01-core-idea-flow/verification.md` | 记录命令、环境、提交和验收摘要 |
| `docs/implementation-plans/v0-1/lp-01-core-idea-flow.md` | Update | 实际状态、阻塞、下一步和验收证据 |
| `docs/project-management.md` | Update | 同提交同步 LP-01 摘要 |

## 4. Implementation Slices

### LP1-S1: Reproducible workspace and contract foundation

Work:

1. 创建根 workspaces 和四个 package/API manifests。
2. 使用设计中的精确版本生成 `package-lock.json`，运行 `npm ci` 回验。
3. 添加 Node、TypeScript、ESLint、Prettier、build 和 CI 配置。
4. 建立 TypeBox common envelope、错误和 Actor 类型。
5. 移动报告 Schema，更新协议链接并添加 Ajv 契约测试。
6. 添加 Fastify composition root、design §11.1 的 exact config/log redact、始终监听的
   live/ready route 和共享 business readiness preHandler。

Verification:

- clean `npm ci`
- format/lint/typecheck/build
- report Schema valid/invalid fixtures
- OpenAPI 可生成且不包含报告写入路由
- 配置合法但 DB 未连接/未迁移时 listener 存在：live 200、ready 503、所有
  `/api/v1` route 503、OpenAPI 200
- 配置字段名、默认、边界、`AI_API_TOKEN` 保留和禁止 alias 的 contract tests

Commit boundary: workspace、契约、Schema move 和 health；不得包含业务 command。

Rollback: revert 新增 workspace 文件和 Schema move；恢复协议到原唯一 Schema 路径。

### LP1-S2: Domain model, database and atomic command infrastructure

Work:

1. 实现 Idea、Statement、Clarification、Project 值对象和 promotion policy。
2. 逐列创建设计 §7.2 的全部 LP-01 表、约束、索引、seed 和 audit trigger。
3. 实现 transaction、repository、clock/ID ports。
4. 实现全局 idempotency key/digest 协议、`IN_PROGRESS/SUCCEEDED/REJECTED` 状态、
   `SET LOCAL lock_timeout='2s'` + `INSERT ... ON CONFLICT DO NOTHING RETURNING`、
   SQLSTATE `55P03` 事务外映射，以及 success data / rejection error payload 保存。
5. 实现 `SELECT ... FOR UPDATE`、expected version 和统一 audit event。
6. readiness 校验期望 migration ID。

Verification:

- migration 从空 PostgreSQL 17.10 成功且可重复检测已应用状态
- 表/外键/check/unique/audit append-only 约束测试
- 相同 key/same digest、same key/different digest、并发 in-progress 测试
- 首事务 commit/rollback/超过 2 秒三种 competing insert 路径；确认 aborted
  transaction 中没有继续查询
- 版本冲突和 transaction rollback/fault injection
- migration 缺失、错误版本和数据库不可达 readiness 测试
- 所有对象无 DELETE/TTL/cleanup route/job；audit trigger 与 idempotency lifetime
  contract tests

Commit boundary: domain、application infrastructure、DB migration/repositories；不暴露未完成
的业务 route。

Rollback: 应用代码回退；已创建表保留。只允许隔离测试数据库执行显式 reset。

### LP1-S3: Idea create and authoritative reads

Work:

1. 实现 `CreateIdea`，保存 `intentSummary`、完整 declared proposer Actor、
   `desiredOutcome`、分类陈述和问题。
2. 对缺少期望结果/假设生成字段型问题并计算 `NEEDS_CLARIFICATION`。
3. 实现受凭据保护的 `POST /api/v1/ideas`。
4. 实现公开 Idea list/detail 和 proposer/executor projections；Idea detail 内嵌的 project
   summary 使用同一个 query `view` 的 project focus union。
5. 注册 TypeBox routes，生成 OpenAPI 和稳定成功/错误响应。
6. 确保创建、history 和 idempotency response 同事务提交。

Verification:

- 完整/不完整创建、输入大小、额外字段和缺失字段
- 未授权写拒绝、公共读取成功、日志不含秘密或完整 body
- 相同 create replay 只产生一个 Idea；冲突 digest 被拒绝
- 两个 view 的 ID、状态、版本和项目关联一致
- 事务写入故障时 Idea/history/成功幂等结果均不部分存在；确定性业务拒绝只保存绑定
  原 digest 的 `REJECTED` 结果

Commit boundary: create + Idea reads；项目读取可以返回空列表，但不提前提供 promotion。

Rollback: 回退 API/command；数据库结构保持向后兼容。

### LP1-S4: Clarification and traceable correction

Work:

1. 实现回答 route/command、问题锁定、expected version 和 append-only answer。
2. 实现显式 expected outcome、fact、hypothesis 修订和 supersedes 链。
3. 重新计算开放问题和 intake 状态。
4. Idea detail 返回完整问题/回答和 LP-01 audit history。
5. 保证回答不会隐式创建项目或从自由文本推断事实。
6. Idea 已关联 project 时以新 key 返回并绑定 `IDEA_ALREADY_PROMOTED`，不追加回答。

Verification:

- 回答开放问题、纠正已有回答、非法 question/idea 组合
- stale version 不覆盖；响应提供 current version/recovery
- 回答后原问题/回答可追溯，当前投影正确
- 条件完整可离开待澄清，但项目数仍为零
- 已推进 Idea 的 clarification 被确定性拒绝且原 key 重放同一错误
- audit 失败使回答和版本更新一起回滚

Commit boundary: clarification only；不混入 promotion。

Rollback: 回退 answer command/route；追加记录保持可读。

### LP1-S5: Explicit promotion and project reads

Work:

1. 实现全部七项 promotion preconditions。
2. 在一个事务中锁 Idea、创建项目、复制当前假设、关联 Idea、递增版本并写 history。
3. 实现项目 list/detail proposer/executor projections。
4. 将数据库唯一约束错误映射为 replay、`ALREADY_PROMOTED` 或版本冲突，而非 500。
5. 完成所有路由 OpenAPI 和 API error matrix。

Verification:

- 目标缺失、假设缺失、意图缺失、错误 Actor 和旧版本均拒绝且事实不变
- 合法推进只创建 `PLANNING/QUEUED` 项目
- 同 key replay 返回同响应；新 key 重复推进确定性拒绝并返回现有项目
- 两个并发推进最终只有一个项目
- 项目假设快照、来源 Idea、版本、服务端时间和 audit 正确
- project list/detail 的 proposer focus 精确突出 source Idea/outcome，executor focus
  精确突出 execution/hypotheses；两者 authority ID/status/version 完全一致
- 基础项目读取不包含 LP-02 进展或 LP-03 报告字段

Commit boundary: promotion + project reads；不实现项目执行 mutation。

Rollback: 回退 promotion route/command；已经提交的项目和历史保留。

### LP1-S6: Acceptance, documentation and status projection

Work:

1. 运行完整 clean verification 和 `scripts/lp01-acceptance.ts`。
2. 记录 exact commit、Node/PostgreSQL 版本、命令、结果和必要计数。
3. 完成 README 配置、开发、迁移、API、重试和安全说明。
4. 在同一提交把 LP-01 状态更新为 `Ready for Acceptance`，同步项目管理入口。
5. 更新本 design/plan 的 implementation record 和 Changelog runtime entry。
6. 检查 LP-02–LP-05 文档/状态未被提前改变。

Verification:

- §6 的完整门禁
- `git diff --check`
- target file 和范围审阅
- 验收证据不含 token、cookie、连接串或真实数据

Commit boundary: verification/docs/status only；发现产品行为缺陷时回到对应业务 slice 修复，
不得在证据提交中隐藏代码修复。

Rollback: 以补偿提交把状态恢复到事实值；不删除历史证据。

## 5. API And Data Migration Order

1. 安装精确依赖并构建 packages。
2. 对目标数据库执行 `0001_lp01_core.sql`。
3. migration 创建表、约束、audit trigger 和固定 workspace。
4. 配置合法后启动 listener；此时 live/OpenAPI 可用，ready 和业务 route 可为 503。
5. migration 成功且 checksum/ID 与应用一致后，readiness 返回 200，下一次共享 probe
   自动开放所有 `/api/v1` route。

本期没有旧数据回填或兼容窗口。migration 必须在事务中运行；失败时 PostgreSQL 回滚，
readiness 保持 503。应用进程不在请求路径自动执行 migration。

## 6. Standard Commands

根 `package.json` 提供以下稳定命令：

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:acceptance
npm run openapi:check
npm run verify
npm run test:db:up
npm run test:db:down
npm run db:migrate
npm run dev
```

README 的 clean-checkout 路径为：

```bash
npm ci
cp .env.example .env
npm run test:db:up
npm run db:migrate
npm run verify
```

`.env.example` 只包含本地占位值和非生产 URL；CI 从服务容器注入测试 URL。测试脚本
生成独立数据库名并在成功或失败后清理，拒绝 host/database 不符合测试护栏的 reset。

## 7. Test Matrix

| Requirement / AC | Automated evidence |
| --- | --- |
| LP1-REQ-001 / AC-001 | CI clean `npm ci` + `npm run verify` |
| LP1-REQ-002–005 / AC-002 | exact-column migration + incomplete create integration test |
| LP1-REQ-005–006 / AC-003 | clarification history/correction test |
| LP1-REQ-007–010 / AC-004–005 | promotion policy + API integration |
| LP1-REQ-011–012 / AC-006 | success/rejection replay、digest conflict、concurrent first request |
| LP1-REQ-013 / AC-007 | stale expectedVersion concurrency test |
| LP1-REQ-002,014 / AC-008 | PostgreSQL fault injection and rollback assertions |
| LP1-REQ-016–017 / AC-009 | Idea/project list/detail，双 focus discriminated Schema 和 authority equivalence tests |
| LP1-REQ-015–016 / AC-010 | Design §9.4 TypeBox/OpenAPI/data/error matrix contract tests |
| LP1-REQ-018–019 / AC-011 | auth boundary and Pino redaction tests |
| LP1-REQ-020 / AC-012 | single report Schema path + Ajv fixtures + no routes |
| LP1-REQ-022 / AC-013 | listener/live/ready/business-gate startup and runtime matrix |
| LP1-REQ-002–022 / AC-014 | `scripts/lp01-acceptance.ts` objective flow |

测试 fixture 只使用少量、可读、虚构的 Idea。mutation harness、future-state simulator 和
GitHub/lifecycle fixture 明确不属于验证范围。

## 8. Security And Failure Verification

必须独立验证：

- 无 Authorization、错误 scheme、错误 token 和带空白变体均返回 401；
- 认证失败发生在 idempotency lookup 前；
- public GET 不注册 mutation handler；
- error、Pino output、audit payload 和 OpenAPI example 不含 secret；
- `additionalProperties=false`、字符串长度、数组数量和 cursor 边界生效；
- 连接池错误和未知异常只暴露稳定错误，不回显 SQL/stack/URL；
- concurrent create/promote 不绕过 unique/version/idempotency 约束；
- audit trigger 拒绝 update/delete；
- readiness 不把数据库可连接但 migration 缺失误报为 ready。
- route DTO/SQL/config snapshot tests 覆盖 design §7.2、§9.4 和 §11.1；特别断言
  Actor optional/null、project focus union 和 idempotency payload/envelope 边界。

不把声明 Actor 与 token 绑定成人类身份，不写“已认证提出者”之类结论。

## 9. Documentation And Changelog

F4 文档变化：

- README：运行环境、标准命令、env、migration、API、幂等恢复、公开读/AI 写边界。
- OpenAPI：从代码 Schema 生成并提交。
- structured report protocol：只更新 canonical Schema 相对链接。
- LP-01 plan/project management：只按事实同步状态、阻塞、下一步和证据。
- verification：记录 exact-head 结果，不复制秘密或整段日志。
- Changelog：F3 先记录 LP-01 技术设计；F4 再记录真实运行时能力。

不创建 release note、生产 runbook 或 v0.1 发布声明。

## 10. Rollout, Rollback And Recovery

### Rollout

1. Technical Plan Review PASS 后创建 F4 Goal。
2. 按 LP1-S1 至 LP1-S6 顺序实现，每个 slice 保持独立可审阅提交。
3. 对每个数据库相关 slice 使用隔离 PostgreSQL 17.10 验证。
4. 完整验证通过后推送 exact head、创建/更新 PR 并请求 Code Review。
5. Review APPROVE 后等待外部 merge owner；Main 不自行越权合并。
6. 合并并完成 LP-01 验收后，才允许 LP-02 进入自己的 Requirements。

### Rollback

- 合并前：用补偿提交修复或撤销相应 slice，不重写远端历史。
- 应用回滚：部署上一兼容提交；LP-01 初始表保留。
- migration 失败：依靠事务回滚，修复 migration 后重试。
- 已写业务事实：不通过回滚删除；使用后续可追踪纠正。
- 测试数据库：只有名称/host 护栏通过时允许显式 reset。
- 不在共享环境自动 drop table、truncate 或删除 audit history。

## 11. Risks And Controls

| Risk | Control |
| --- | --- |
| 从 docs-only 一次引入过多基础设施 | 六个结果型 slice，禁止空 Web/后续模块 |
| TypeScript 工具链不兼容 | 固定 TS 6.0.3；`npm ci`/typecheck 作为首个 gate |
| 幂等和业务事务分离 | 同一 PostgreSQL 事务保存事实、audit 与成功或确定性拒绝响应 |
| 并发创建第二项目 | Idea row lock + expected version + DB unique constraint |
| 自由文本被当作事实 | 回答只应用显式分类字段，不做自动语义推断 |
| Actor 被误认为身份 | `declaredActor` 命名、凭据/身份边界测试和文档 |
| 公开读取泄露真实数据 | 无生产部署；虚构 fixture；README 明示演示数据限制 |
| Schema 形成双规范源 | 文件 move + 旧路径不存在断言 + 单一 Ajv test |
| readiness 误报或无法观察 | listener 始终存在；同一 probe 同时检查连接、migration table 和 expected ID；业务 preHandler 503 |
| 状态文档先于事实 | LP1-S6 最后同提交同步，并引用 exact evidence |
| 范围膨胀到 LP-02–LP-05 | route/table/file allowlist 和 PR diff 人工核对 |

## 12. Commit And Review Plan

1. F2 design authority 修订已单独提交并推送：
   `51c186be9834bfbd9e979f76dff0d8bda7e348a3`。
2. F3 plan 与 truthful Changelog Docs entry 单独提交并推送。
3. 用包含 exact requirements/design/plan 的 F3 commit 生成
   `TechnicalPlanReviewRequest`。
4. Review PASS 后才创建 GoalRun 并开始 LP1-S1。
5. 每个 F4 slice 提交后运行与其风险相称的 gate；最终 head 运行完整 §6–8。
6. PR request 携带 exact head、base、验证命令和 artifact digest；Review 在精确 head
   审查完整 diff。
7. Code Review finding 只在当前 feature 内修复并重新请求 exact-head Review。

## 13. Open Decisions

无阻塞性开放决定。实现若遇到 registry 撤回、PostgreSQL 17.10 镜像不可用或设计中的
并发协议无法按可观察契约实现，属于计划变更而不是可静默替代项，必须返回 F2/F3。

## 14. Implementation And Verification Record

尚未开始 F4。Cycle 1 Technical Plan Review
`c39f003d1754a10633a9aa7c4c890422dc6049c4f497367819814f585d84b21a`
对 exact commit `905f858201de...` 返回 FAIL；TPR-001 至 TPR-004 已按本 plan 的
Cycle 1 remediation 表修订。Cycle 2 result
`f481d8b00a5cfaf9d9d3ab07adb9a0fcaefffd32a2e43f289e70c929968428bc`
确认 TPR-002 至 TPR-004 已关闭，并要求补齐项目 focus 与三项局部一致性；这些内容已按
Cycle 2 remediation 表修订，等待新 exact snapshot 复审。Technical Plan Review PASS、
GoalRun、实现提交、验证命令、PR 和验收证据仍为空，不得在实际发生前预填。
