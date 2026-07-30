# Technical Design: LP-01 核心基础与 Idea 流程

- Status: F2 Technical Design
- FeatureId: `lp-01-core-idea-flow-7a4c1e9d2b60`
- Branch: `codex/lp-01-core-idea-flow`
- Requirements: [requirements.md](./requirements.md)
- RequirementsCommit: `42078fa3e2b20cb599ef795a88ee37377897c5ab`
- BaselineCommit: `30aa27129f21efe6e4ef2bfc17ffa0e1a7282682`

## 1. Background

LP-01 把当前纯文档仓库变成第一个可运行、可验证的业务切片。它负责建立工程工作区、
共享契约、PostgreSQL 持久化、版本化 API，以及 Idea 创建、澄清、显式推进和基础
读取能力。

本设计保持一个单工作空间、无用户系统的模块化单体。AI 写入凭据只证明调用来源有权
写入；`actor`、`proposer` 和 `role` 始终是声明归属，不是已认证用户身份。

## 2. Goals

- 从干净检出可重复安装、检查、测试和构建。
- 使用一个 PostgreSQL 权威源保存 Idea、澄清、项目、幂等结果和追加式历史。
- 分离已知陈述、待验证假设和待澄清问题，不补写缺失事实。
- 信息完整与进入执行解耦；只有明确推进命令才创建项目。
- 每个 Idea 最多创建一个首要验证项目。
- 对所有写入提供幂等、乐观并发、事务原子性和稳定错误语义。
- 提供公共只读、受凭据保护的 AI 写入、机器可读 OpenAPI 和准确健康状态。
- 保留结构化汇报 Schema 作为唯一共享契约，但不实现汇报业务。

## 3. Non-goals

- 不实现 LP-02 的执行进展、证据、结论、阻塞或高影响确认。
- 不实现 LP-03 的汇报提交、汇报渲染器或 Web 应用。
- 不实现 LP-04 的 Skill、演示数据或完整演示脚本。
- 不实现 LP-05 的生产部署、域名、TLS、备份或发布候选。
- 不实现注册、登录、多租户、用户身份或权限组。
- 不实现 Web 控制会话；LP-01 没有 Web 写入界面，因此本期必要控制面为空。
- 不实现消息队列、WebSocket、MCP、对象存储或微服务。
- 不引入 authorization engine、lifecycle simulator、GitHub authority checker 或
  大规模 mutation harness。

## 4. Runtime And Dependency Baseline

以下版本于 2026-07-30 通过官方 Node.js/PostgreSQL 发布页和 npm registry 核验。
实现使用精确版本、提交 `package-lock.json`，并以 `npm ci` 证明解析结果可重复。

| Component | Selected version | Decision |
| --- | --- | --- |
| Node.js | `24.18.0` LTS | 当前 LTS；根目录 `.nvmrc` 和 `engines` 固定 24.x |
| npm | `11.16.0` | 随选定 Node.js 发布，使用 package-lock v3 |
| PostgreSQL | `17.10` | 延续已确认架构的 17 主版本并采用当前安全补丁 |
| TypeScript | `6.0.3` | `typescript-eslint@8.65.0` 支持 `<6.1.0`；不采用不兼容的 7.x |
| Fastify | `5.11.0` | 版本化 HTTP API |
| TypeBox / provider | `1.3.8` / `6.1.0` | 请求、响应和 OpenAPI 的类型化 JSON Schema |
| `@fastify/swagger` | `9.8.1` | 从路由 Schema 生成 OpenAPI；不提供 Swagger UI |
| `@fastify/helmet` | `13.1.0` | 基础 HTTP 安全头 |
| Drizzle ORM / Kit | `0.45.2` / `0.31.10` | 类型化查询和可审阅 SQL migration |
| `pg` | `8.22.0` | PostgreSQL 驱动 |
| Ajv / formats | `8.20.0` / `3.0.1` | 共享 Schema 契约检查 |
| Pino | `10.3.1` | Fastify 结构化日志，使用字段脱敏 |
| Vitest | `4.1.10` | 单元、契约和集成测试 |
| ESLint / typescript-eslint | `10.8.0` / `8.65.0` | 静态检查 |
| Prettier | `3.9.6` | 格式检查 |
| tsx / ulid | `4.23.1` / `3.0.2` | TS 工具脚本和稳定、可排序 ID |
| `@types/node` | `24.13.3` | 与 Node.js 24 运行时主版本对齐 |

版本来源：

- [Node.js v24 archive](https://nodejs.org/en/download/archive/v24)
- [Node.js release policy](https://nodejs.org/en/about/previous-releases)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [PostgreSQL 17.10 release notes](https://www.postgresql.org/docs/release/17.10/)

若实现时任一精确版本已撤回或无法形成兼容 lockfile，必须停在 F4 前修订本设计并重新
审查，不得静默换版本。

## 5. Repository And Module Boundaries

```text
apps/
  api/                    Fastify composition root, HTTP adapters, configuration
packages/
  contracts/              TypeBox API schemas, response/error types, OpenAPI generation
  domain/                 Framework-free entities, value objects and lifecycle policies
  application/            Commands, queries, ports, transaction orchestration
  db/                     Drizzle schema, repositories, PostgreSQL migrations
docs/
  feature/lp-01-core-idea-flow/
  feature/v0-1-project-plan/
```

依赖方向固定为：

```text
apps/api -> contracts + application + db
application -> domain + contracts
db -> application ports + domain
domain -> no framework, HTTP or database dependency
```

根 npm workspace 只注册 `apps/api` 和四个 packages。本期不创建 `apps/web` 空壳，
避免暗示 LP-03 Web 已开始。API composition root 负责配置、日志、认证、数据库连接、
路由和关闭顺序；业务规则不得写在路由 handler 或 SQL adapter 中。

## 6. Domain Model

### 6.1 Controlled values

| Type | LP-01 values |
| --- | --- |
| `IdeaIntakeStatus` | `IDEA`, `NEEDS_CLARIFICATION` |
| `StatementKind` | `FACT`, `HYPOTHESIS` |
| `ClarificationStatus` | `OPEN`, `ANSWERED` |
| `ProjectPhase` | `PLANNING` |
| `ProjectStatus` | `QUEUED` |
| `DeclaredActorRole` | `PROPOSER`, `EXECUTOR`, `AI` |
| `View` | `proposer`, `executor` |

后续 LP 可增加值，但 LP-01 不接受、持久化或返回未实现的未来状态。

### 6.2 Idea aggregate

`Idea` 是创建、澄清和推进的并发边界：

| Field | Rule |
| --- | --- |
| `id` | 服务端 ULID，不接受客户端值 |
| `workspaceId` | 固定为 `workspace_default` |
| `rawIntent` | 必填，去首尾空白后 1–4000 字符；保留原始含义 |
| `declaredProposer` | 必填的声明名称，1–120 字符 |
| `expectedOutcome` | 可空，1–2000 字符；空时需要澄清 |
| `intakeStatus` | 由当前缺失项和开放问题确定 |
| `version` | 创建为 1；每次成功澄清或推进加 1 |
| `projectId` | 可空；成功推进后一次性指向唯一项目 |
| `createdAt` / `updatedAt` | 服务端 UTC 时间 |

已知陈述和假设保存在 `idea_statements` 中。每条记录包含 `kind`、内容、来源、
创建时间和可空的 `supersedesStatementId`。纠正通过追加新记录并指向旧记录完成；
旧记录不删除。当前投影选择未被后续记录取代的陈述。

创建请求可以显式提供问题。对于缺少 `expectedOutcome` 或没有当前假设的请求，领域层
还会生成稳定的字段型问题，例如“期望验证的结果是什么？”；问题本身不是业务事实，
不会把答案或假设补写为已知信息。

### 6.3 Clarification history

问题和回答分表保存：

- `clarification_questions` 保存问题、目标字段、状态和当前回答 ID；
- `clarification_answers` 追加保存回答正文、声明 Actor、原因、时间，以及可空的
  `supersedesAnswerId`；
- 回答命令可以同时提交显式分类的新增事实、假设或期望结果修订；
- 服务端只应用请求明确声明的字段，不从自由文本推断事实；
- 回答后重新计算开放问题和必要字段；条件完整时状态变为 `IDEA`，但不创建项目。

一个已回答问题需要纠正时，客户端再次提交回答并引用当前回答版本；系统追加回答，
更新当前回答指针并保留原回答。

### 6.4 Validation project

推进创建 `ValidationProject`：

| Field | Rule |
| --- | --- |
| `id` | 服务端 ULID |
| `ideaId` | 唯一外键；数据库唯一约束保证每个 Idea 最多一个项目 |
| `workspaceId` | 固定工作空间 |
| `goal` | 从 Idea 当前 `expectedOutcome` 快照复制 |
| `phase` | 固定 `PLANNING` |
| `status` | 固定 `QUEUED`，含义为等待 LP-02 执行 |
| `version` | 初始为 1 |
| `createdAt` / `updatedAt` | 服务端 UTC 时间 |

`project_hypotheses` 在推进事务中复制 Idea 的当前假设，保留来源 statement ID。
后续对 Idea 的澄清不静默改写已创建项目；该变更属于后续显式项目流程。

推进前置条件全部满足才可提交：

1. Idea 存在且 `projectId` 为空；
2. `expectedVersion` 等于 Idea 当前版本；
3. 当前 `expectedOutcome` 非空；
4. 至少有一个当前 `HYPOTHESIS`；
5. 请求 `explicitIntent` 精确为 `PROMOTE`；
6. 声明 Actor 角色为 `PROPOSER`，或角色为 `AI` 且
   `onBehalfOfRole=PROPOSER`；
7. `reason` 非空。

重复推进不会创建第二个项目。相同幂等请求返回首个响应；使用新幂等键对已推进 Idea
再推进时返回 `ALREADY_PROMOTED`，并提供现有 `projectId`。

## 7. Persistence Design

初始 migration 只创建 LP-01 所需表：

| Table | Purpose and key constraints |
| --- | --- |
| `workspaces` | 预置 `workspace_default` |
| `ideas` | Idea 当前投影；`version >= 1`；`project_id` 可空且唯一 |
| `idea_statements` | 追加式事实/假设；自引用 supersedes 外键 |
| `clarification_questions` | 问题当前状态和当前回答指针 |
| `clarification_answers` | 追加式回答；自引用 supersedes 外键 |
| `validation_projects` | `idea_id UNIQUE NOT NULL`；LP-01 phase/status check |
| `project_hypotheses` | 项目假设快照；来源 statement 外键 |
| `idempotency_records` | `(workspace_id, idempotency_key)` 唯一；保存 `IN_PROGRESS`、`SUCCEEDED` 或 `REJECTED` 终态 |
| `audit_events` | 追加式成功业务历史 |
| `schema_migrations` | readiness 使用的 migration 版本记录 |

所有业务表使用外键和必要的 `CHECK`/唯一约束作为最后防线。应用事务隔离级别使用
`READ COMMITTED`，对更新 Idea 的命令执行 `SELECT ... FOR UPDATE` 后比较版本。
项目唯一性同时由领域规则和 `validation_projects.idea_id` 唯一约束保护。

`audit_events` 不提供更新或删除 repository 方法，并由数据库 trigger 拒绝
`UPDATE`/`DELETE`。历史纠正使用新的 `CORRECTION_RECORDED` 事件。

## 8. Command, Idempotency And Transaction Protocol

### 8.1 Common write envelope

所有写路由要求：

- `Authorization: Bearer <AI_WRITE_TOKEN>`
- `Idempotency-Key: <caller-generated UUID or ULID>`
- 可选 `X-Request-Id`；缺省时服务端生成 ULID
- JSON body 中的 `actor` 和 `reason`
- 修改 Idea 的澄清和推进 body 还要求整数 `expectedVersion`

认证在查询幂等结果之前执行，避免无凭据调用方探测历史响应。

### 8.2 Idempotency algorithm

幂等 scope 是固定工作空间下的全局 `Idempotency-Key`。服务端计算：

```text
SHA-256(method + route-template + canonical-path-ids + canonical-json-body)
```

Authorization、Cookie、`X-Request-Id` 和日志上下文不进入 digest。canonical JSON
递归排序对象键，保留数组顺序，使用验证后的值。

认证、JSON Schema 和通用 envelope 校验在事务前完成；这些请求尚未形成有效业务意图，
不会占用 key。通过上述校验后，每个命令在一个数据库事务中：

1. 尝试以 `IN_PROGRESS` 插入 idempotency key、request digest 和业务操作名；
2. 唯一冲突时读取现有记录：
   - digest 相同且为 `SUCCEEDED` 或 `REJECTED`：返回原 HTTP 状态和响应体，标记
     replay；
   - digest 不同：返回 `IDEMPOTENCY_CONFLICT`；
   - 首事务仍占用唯一键超过 2 秒：返回可重试的
     `IDEMPOTENCY_IN_PROGRESS`；
3. 在任何业务 mutation 前完成存在性、版本和 lifecycle 前置校验；
4. 对 404/409/422 等确定性业务拒绝，不写业务事实或 audit，把稳定错误响应保存为
   `REJECTED` 并提交；
5. 对合法命令执行业务写入并插入同事务 audit event；
6. 保存成功 HTTP 状态和响应 JSON，把记录更新为 `SUCCEEDED`；
7. 提交后才向客户端返回终态响应。

一旦有效业务意图绑定 key，相同 key 携带不同 digest 始终冲突，包括首次结果为确定性
业务拒绝的情况。调用方修正意图必须使用新 key；未知结果重试必须复用原 key。
数据库断连、事务提交失败或其他非确定性基础设施错误会回滚包括幂等记录在内的整个
事务，同 key 可安全重试。`IDEMPOTENCY_IN_PROGRESS` 也不改变首次事务。

### 8.3 Optimistic concurrency

澄清和推进先锁定 Idea，再比较 `expectedVersion`。不一致时事务无业务写入并返回
`VERSION_CONFLICT`，details 包含 `resourceId`、`expectedVersion`、
`currentVersion` 和 `recovery=REFETCH_AND_RETRY`。服务端不自动合并过期意图。

## 9. Public API Contract

API base path 为 `/api/v1`。写入受 bearer token 保护；读取和健康检查公开。

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /api/v1/ideas` | AI write | 创建完整或不完整 Idea |
| `POST /api/v1/ideas/:ideaId/clarifications/:questionId/answers` | AI write | 追加回答和显式修订 |
| `POST /api/v1/ideas/:ideaId/promotions` | AI write | 显式推进并创建唯一项目 |
| `GET /api/v1/ideas` | Public read | 游标分页 Idea 列表 |
| `GET /api/v1/ideas/:ideaId` | Public read | Idea、澄清和历史详情 |
| `GET /api/v1/projects` | Public read | 游标分页基础项目列表 |
| `GET /api/v1/projects/:projectId` | Public read | 项目目标、假设和来源详情 |
| `GET /health/live` | Public | 进程存活 |
| `GET /health/ready` | Public | 数据库和 migration readiness |
| `GET /openapi.json` | Public | 机器可读 OpenAPI 3.1 |

### 9.1 Write requests

创建请求核心字段：

```json
{
  "rawIntent": "string",
  "declaredProposer": "string",
  "expectedOutcome": "optional string",
  "facts": [{"text": "string"}],
  "hypotheses": [{"text": "string"}],
  "clarificationQuestions": [
    {"prompt": "string", "targetField": "EXPECTED_OUTCOME|HYPOTHESIS|OTHER"}
  ],
  "actor": {"role": "PROPOSER|EXECUTOR|AI", "displayName": "string"},
  "reason": "string"
}
```

回答请求除 `expectedVersion`、`answerText`、`actor`、`reason` 外，可以显式提交
`expectedOutcomeRevision`、`newFacts`、`newHypotheses`、`supersedesAnswerId` 和
statement correction；所有可选变更分别校验并追加。

推进请求：

```json
{
  "expectedVersion": 3,
  "explicitIntent": "PROMOTE",
  "actor": {
    "role": "PROPOSER|AI",
    "displayName": "string",
    "onBehalfOfRole": "optional PROPOSER"
  },
  "reason": "string"
}
```

### 9.2 Success and error envelopes

成功：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "01...",
    "idempotentReplay": false
  }
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Idea changed since the supplied version.",
    "retryable": false,
    "details": {
      "field": "expectedVersion",
      "currentVersion": 4,
      "recovery": "REFETCH_AND_RETRY"
    }
  },
  "meta": {"requestId": "01..."}
}
```

稳定错误映射：

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | JSON、字段、大小或格式错误 |
| 401 | `WRITE_CREDENTIAL_REQUIRED` | 写入凭据缺失或无效 |
| 404 | `IDEA_NOT_FOUND`, `QUESTION_NOT_FOUND`, `PROJECT_NOT_FOUND` | 资源不存在 |
| 409 | `VERSION_CONFLICT` | 预期版本过期 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同 key 不同意图 |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | 并发首次请求仍未确定，可重试 |
| 409 | `ALREADY_PROMOTED` | 使用新 key 重复推进 |
| 422 | `PROMOTION_PRECONDITION_FAILED` | 目标、假设或明确意图不足 |
| 503 | `SERVICE_NOT_READY` | 数据库或 migration 未就绪 |
| 500 | `INTERNAL_ERROR` | 已脱敏的意外错误 |

### 9.3 Reads and projections

列表使用 `limit`（默认 20，最大 100）和服务端生成的不透明 cursor；排序键为
`updatedAt DESC, id DESC`。非法 cursor 返回 `VALIDATION_FAILED`。

`view=proposer|executor` 只改变字段组织：

- proposer 投影优先显示原始意图、已知陈述、开放问题和推进历史；
- executor 投影优先显示期望结果、假设、澄清完整度和项目等待状态；
- 两者必须使用相同 `id`、状态、版本、项目关联和数据库查询源；
- view 不是权限检查，也不创建、缓存或修改另一份业务状态。

Idea detail 返回当前陈述、全部问题和回答历史、项目摘要以及 LP-01 audit history。
Project detail 返回目标、假设快照、来源 Idea 和当前排队状态，不包含 LP-02 进展字段。

## 10. Contract Ownership

TypeBox 路由 Schema 是 LP-01 API 请求、响应和 OpenAPI 的唯一规范源。CI 从同一 Schema
生成 `openapi.json` 并执行 drift check，不手写第二份 OpenAPI。

现有
`docs/feature/v0-1-project-plan/schemas/structured-report.v1.schema.json`
在实现时移动到
`packages/contracts/schemas/structured-report.v1.schema.json`，并同步更新协议文档链接。
只保留移动后的文件作为结构化汇报唯一 Schema；Ajv 契约测试验证其自身和代表性合法/
非法样例。LP-01 不注册报告路由，不导入报告到领域或数据库层。

## 11. Access, Privacy And Logging

- `AI_WRITE_TOKEN` 和 `DATABASE_URL` 仅从环境读取，启动时只报告配置是否存在。
- bearer token 先做 SHA-256 再用恒定时间比较，不记录原 token、摘要或 header。
- Pino 对 `authorization`、`cookie`、`set-cookie`、数据库 URL 和请求 body 默认脱敏；
  日志只记录 request ID、route、status、latency、entity ID 和稳定错误码。
- audit history 保存声明 Actor、reason 和字段级摘要，不保存 token、连接串或完整正文。
- 所有字符串有长度上限，数组有数量上限，额外 JSON 字段被拒绝。
- 公共读取契约和 README 明确演示环境不得保存真实秘密、个人数据或商业机密。
- 写入 token 不把声明 Actor 提升为认证人；响应使用 `declaredActor` 命名避免误解。

## 12. Health, Observability And Operations

`/health/live` 只证明事件循环可响应，不访问数据库。

`/health/ready` 在短超时内同时验证：

1. PostgreSQL `SELECT 1` 成功；
2. `schema_migrations` 存在；
3. 当前 migration ID 等于应用期望 ID。

任一失败返回 503 和稳定、非秘密 reason code；业务路由在 readiness 未建立时不启动
监听，运行期数据库故障由命令/查询返回 `SERVICE_NOT_READY`。

应用处理 `SIGTERM`/`SIGINT`：停止接收新请求、等待在途请求的有限宽限期、关闭连接池。
本期只提供结构化日志和 health，不引入指标后端或分布式追踪服务。

## 13. Failure And Recovery

| Failure | Behavior | Recovery |
| --- | --- | --- |
| 输入不完整但可保存 | 创建 `NEEDS_CLARIFICATION` Idea | 回答开放问题 |
| JSON/大小非法 | 400，无业务写入 | 修正请求 |
| 相同 key、相同 digest | 返回原成功响应 | 无需恢复 |
| 相同 key、不同 digest | 409，保留首次结果 | 读取原结果或使用新 key |
| 版本过期 | 409，无覆盖 | 重新读取并提交新意图 |
| 推进条件不足 | 422，Idea 不变；原 key 绑定拒绝结果 | 补齐后使用新 key 明确推进 |
| 并发重复推进 | 一个提交；另一个 replay 或确定性冲突 | 使用返回的现有项目 |
| 事实或 audit 写入失败 | 整个事务回滚，不报告成功 | 同 key 重试未知结果 |
| 数据库不可达 | readiness 503；业务失败脱敏 | 恢复数据库后重试 |
| migration 不匹配 | readiness 503 | 执行仓库 migration |

初始 migration 是从无数据库状态向前创建。应用回滚通过部署上一提交完成，已创建的
LP-01 表保持兼容且不自动删除；只有一次性本地测试数据库可使用明确的 reset 命令。
任何共享环境回滚都不得执行自动 drop。

## 14. Verification Strategy

### 14.1 Static and build gates

- `npm ci`
- format check
- ESLint
- TypeScript project references check
- workspace build
- OpenAPI generation and drift check
- report JSON Schema contract check

### 14.2 Automated behavior

- domain unit tests：状态计算、缺失字段、推进条件、纠正链；
- contract tests：所有路由成功/错误 envelope、OpenAPI、report Schema；
- repository integration tests：约束、排序、投影和 migration；
- API integration tests：创建、澄清、保持不推进、推进、基础读取；
- concurrency tests：幂等 replay/conflict/in-progress、版本冲突、唯一项目；
- fault-injection tests：业务写入后 audit 失败、连接中断、migration 不匹配；
- security tests：无效 token、公开读取、日志脱敏、额外字段和大小边界；
- clean-checkout test：只依赖提交文件和隔离 PostgreSQL 17.10。

不以 mock 持久化证明事务、唯一约束或并发验收；这些场景必须使用真实隔离 PostgreSQL。

### 14.3 Objective acceptance scenario

LP1-AC-014 由一个可重复集成测试执行：

1. 用同一 idempotency key 两次创建同一个不完整 Idea；
2. 断言只有一个 Idea、状态待澄清、无项目；
3. 回答问题并断言问题和回答历史保留；
4. 读取并证明没有推进命令时仍无项目；
5. 以当前版本和明确提出者意图推进；
6. 以新 key 再次推进并断言确定性拒绝；
7. 断言最终只有一个项目，版本、状态和 audit 序列准确。

测试输出保存命令、提交 SHA、通过/失败和必要摘要；不提交运行时 token、数据库 URL 或
完整敏感请求。

## 15. Traceability

| Requirement / AC | Design coverage |
| --- | --- |
| LP1-REQ-001, LP1-AC-001 | §4–5、§14.1 |
| LP1-REQ-002–006, LP1-AC-002–003 | §6–7、§8.3 |
| LP1-REQ-007–010, LP1-AC-004–005 | §6.4、§9.1 |
| LP1-REQ-011–014, LP1-AC-006–008 | §7–8 |
| LP1-REQ-015–017, LP1-AC-009–010 | §9 |
| LP1-REQ-018–019, LP1-AC-011 | §11 |
| LP1-REQ-020, LP1-AC-012 | §10 |
| LP1-REQ-021, LP1-AC-014 | §14 |
| LP1-REQ-022, LP1-AC-013 | §12 |

## 16. Compatibility, Release And Open Decisions

LP-01 创建首个运行时公共契约，没有旧客户端或数据库需要迁移。后续 LP 必须兼容本期
ID、版本、错误、幂等、Actor 和读取约定；破坏性变更需要新需求和迁移说明。

LP-01 验收不等于 v0.1 发布，不部署生产环境、不配置真实凭据、不创建版本标签。验收后
只更新 LP-01 计划状态和证据，并解除 LP-02 的需求规划依赖。

无阻塞性开放决定。精确字段、状态、路由、表、并发协议和版本基线由本设计锁定；
技术计划 Review 可以要求纠正与已确认需求不一致之处，但不得把明确排除的后续能力或
自研治理系统加入 LP-01。
