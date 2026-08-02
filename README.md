# Idea Trace Validation

LP-01～LP-03 组成当前已验收的可运行纵向切片：登记和澄清 Idea、显式推进为唯一验证项目，记录执行转换与决策历史，再通过不可变结构化汇报和 proposer/executor
Web 读取同一份 PostgreSQL 权威数据。汇报只负责展示，不能覆盖项目状态、确认或审计事实。

LP-04 正在增加仓库版本化 AI
Skill、只使用合成数据的确定性真实 HTTP 演示、崩溃恢复证据和真实数据浏览器故事。实际 Codex/Claude 客户端证据已通过加强后的 transcript、公开审计和资源读回验证；LP-04 当前为
`Ready for Acceptance`，但 Cycle 7 缩小后的 Codex response-reader
jq 输入角色 finding 正在为 Cycle
8 复审闭环；合并和正式验收尚未完成。生产部署属于 LP-05，不在当前实现范围。

## 运行要求

- Node.js `24.18.0`（见 `.nvmrc`）
- npm `11.16.0`
- Docker（本地 PostgreSQL `17.10-alpine`）

依赖和 install script 均为精确版本。npm 11 的 `strict-allow-scripts`
已开启，只允许锁定版本的 `esbuild` 与 macOS 可选依赖 `fsevents` 执行安装脚本。

## 本地启动

```bash
nvm use
npm ci
npm run test:db:up
cp .env.example .env
set -a
source .env
set +a
npm run db:migrate
npm run dev
```

Web 开发服务器单独运行：

```bash
npm run dev --workspace @idea/web
```

生产式同源托管先执行 `npm run build`，再把 `WEB_DIST_DIR` 指向 `apps/web/dist`
后启动 API。未配置该变量时 API 不托管静态页面。

`DATABASE_URL`、`AI_API_TOKEN` 和 `HUMAN_CONTROL_TOKEN` 是必填配置。AI
token 去除首尾空白后至少 32 字符；human-control
token 必须是 32 字节 base64url（43 字符）且与 AI token 不同。LP-03 可选配置
`AI_WRITE_DISPLAY_NAME`、`AI_WRITE_CLIENT` 和 `WEB_DIST_DIR`
不包含凭据。完整字段、默认值和边界见 [.env.example](./.env.example)。

配置合法后，API 会立即监听，不等待数据库：

- `GET /health/live`：进程可响应。
- `GET /health/ready`：数据库可达且 migration ID/checksum 正确。
- `GET /openapi.json`：机器可读 OpenAPI。
- 数据库未 ready 时，所有 `/api/v1` 路由返回 `503 SERVICE_NOT_READY`。

## API

普通 AI 写路由要求：

```text
Authorization: Bearer <AI_API_TOKEN>
Idempotency-Key: <caller UUID or ULID>
Content-Type: application/json
```

| Method | Path                                                                                          | Access                         |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `POST` | `/api/v1/ideas`                                                                               | AI write                       |
| `POST` | `/api/v1/ideas/:ideaId/clarifications/:questionId/answers`                                    | AI write                       |
| `POST` | `/api/v1/ideas/:ideaId/promotions`                                                            | AI write                       |
| `POST` | `/api/v1/projects/:projectId/transitions`                                                     | AI write                       |
| `POST` | `/api/v1/projects/:projectId/progress-updates`                                                | AI write                       |
| `POST` | `/api/v1/projects/:projectId/attention-items`                                                 | AI write                       |
| `POST` | `/api/v1/projects/:projectId/attention-items/:itemId/events`                                  | AI write                       |
| `POST` | `/api/v1/projects/:projectId/evidence`                                                        | AI write                       |
| `POST` | `/api/v1/projects/:projectId/evidence/:evidenceId/corrections`                                | AI write                       |
| `POST` | `/api/v1/projects/:projectId/conclusions`                                                     | AI write                       |
| `POST` | `/api/v1/projects/:projectId/human-confirmations`                                             | Human control                  |
| `POST` | `/api/v1/human-confirmations/:confirmationId/decisions`                                       | Scoped cookie                  |
| `GET`  | `/api/v1/ideas`、`/api/v1/ideas/:ideaId`                                                      | Public read                    |
| `GET`  | `/api/v1/projects`、`/api/v1/projects/:projectId`                                             | Public read                    |
| `GET`  | `/api/v1/projects/:projectId/{progress-updates,attention-items,evidence,conclusions,history}` | Public read                    |
| `GET`  | `/api/v1/human-confirmations/:confirmationId`                                                 | Human control or scoped cookie |
| `POST` | `/api/v1/projects/:projectId/reports`                                                         | AI write                       |
| `GET`  | `/api/v1/projects/:projectId/reports`、`/reports/current`、`/reports/:revision`               | Public read                    |
| `GET`  | `/api/v1/experience/proposer/ideas`、`/experience/executor/projects`                          | Public read                    |
| `GET`  | `/api/v1/experience/projects/:projectId?view=proposer\|executor`                              | Public read                    |

人类确认创建使用 `X-Human-Control-Token`；成功后只通过
`HttpOnly; Secure; SameSite=Strict`
且绑定单一确认路径的 cookie 返回短期 capability。capability 原文不会进入响应正文或数据库。完整请求、响应、稳定错误与 LP-03 当前契约以
[LP-03 OpenAPI](./openapi/lp03.v1.json) 为准；冻结的
[LP-01 OpenAPI](./openapi/lp01.v1.json) 与
[LP-02 OpenAPI](./openapi/lp02.v1.json) 仍由漂移门禁保护。

Web 入口为 `/proposer`、`/executor`、对应的项目详情路径和
`/confirmations/:confirmationId`。角色只改变信息组织，不代表认证身份或附加权限。

写入 token 只证明调用来源可以写入；body 中的 `actor`、`proposer` 和 `role`
是声明归属，不是已认证用户身份。公开演示环境不得保存真实秘密、个人数据或商业机密。

## LP-04 Skill 与本地演示

客户端中立 Skill 位于
[`skills/idea-validation-workflow/`](./skills/idea-validation-workflow/SKILL.md)。它只映射现有 LP-03
API，不保存第二份业务状态，也不会让 AI 获取或转交 human-control token/cookie。

静态与真实 HTTP 门禁：

```bash
npm run skill:check
npm run demo:lp04 -- \
  --base-url http://127.0.0.1:3000 \
  --run-id <synthetic-run-id> \
  --skill-commit <40-character-skill-commit>
npm run demo:lp04:verify -- \
  --base-url http://127.0.0.1:3000 \
  --run-id <synthetic-run-id> \
  --skill-commit <40-character-skill-commit>
```

AI
bearer 只通过环境注入；命令参数和证据不包含真实值。实际客户端、独立人工交接、失败恢复、Web 验收和精确清理见
[LP-04 本地演示指南](./docs/demo/lp04.md)。

## 验证

```bash
npm run format:check
npm run lint
npm run skill:check
npm run typecheck
npm run build
npm run openapi:check
npm run test:unit
npm run test:contract
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:integration
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:acceptance:lp01
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:acceptance:lp02
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:acceptance:lp03
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:acceptance:lp04
npm run test:web:component
npx playwright install chromium
npm run test:browser
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:browser:lp04
```

`npm run verify`
顺序执行全部门禁。数据库测试只应指向隔离测试数据库；不要对共享环境执行 reset、drop 或自动回滚 DDL。

## 数据与失败语义

- 每个 Idea 是并发边界，澄清和推进使用 row lock 与 `expectedVersion`。
- 每个 ValidationProject 是 LP-02 并发边界；每个成功命令只递增一次版本。
- 每个 Idea 最多一个 `PLANNING/QUEUED` 项目。
- 幂等键在固定 workspace 内全局唯一；相同意图重放原结果，不同意图返回冲突。
- 确定性 404/409/422 会绑定幂等键；基础设施失败回滚整个事务，可用同一键重试。
- 每个成功命令原子追加脱敏 audit event；数据库触发器拒绝更新或删除历史。
- 进展、事项、Evidence 和结论不隐式改变项目状态；纠正、撤回、回应和取代均为追加式。
- 高影响操作摘要绑定项目版本和结论/终态事实；过期、失效或已消费的确认不能生效。
- 汇报以 `workspace + project + clientRequestId`
  幂等，revision 只追加；校验、保存、accepted 指针和脱敏审计在同一事务中完成。
- 页面只渲染七类受控块和安全 Markdown
  token；协议/编译器不兼容或运行时渲染失败时使用明确兼容状态或上一份安全候选，固定权威区域保持可用。

升级与恢复边界见 [migration notes](./docs/migration-notes.md)。实现和客观证据见
[LP-01 verification](./docs/feature/lp-01-core-idea-flow/verification.md)、
[LP-02 verification](./docs/feature/lp-02-execution-decisions/verification.md)
与
[LP-03 verification](./docs/feature/lp-03-reporting-role-experience/verification.md)。LP-04 的进行中证据见
[LP-04 verification](./docs/feature/lp-04-ai-skill-demo/verification.md)；其中明确区分客户端证据通过、Engineering
Review 批准、合并与正式验收。
