# Idea Trace Validation

LP-01 提供第一个可运行的纵向切片：登记 Idea、显式回答澄清问题、由提议者意图推进为唯一验证项目，并从 proposer 或 executor 视角读取同一份 PostgreSQL 权威数据。

当前范围只包含 API、共享契约、数据库迁移和自动化验证。项目执行、结构化汇报 Web、AI
Skill、生产部署分别属于 LP-02～LP-05。

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

`DATABASE_URL` 和 `AI_API_TOKEN`
是必填配置。token 去除首尾空白后至少 32 字符。完整字段、默认值和边界见
[.env.example](./.env.example)。

配置合法后，API 会立即监听，不等待数据库：

- `GET /health/live`：进程可响应。
- `GET /health/ready`：数据库可达且 migration ID/checksum 正确。
- `GET /openapi.json`：机器可读 OpenAPI。
- 数据库未 ready 时，所有 `/api/v1` 路由返回 `503 SERVICE_NOT_READY`。

## API

写路由要求：

```text
Authorization: Bearer <AI_API_TOKEN>
Idempotency-Key: <caller UUID or ULID>
Content-Type: application/json
```

| Method | Path                                                       | Access      |
| ------ | ---------------------------------------------------------- | ----------- |
| `POST` | `/api/v1/ideas`                                            | AI write    |
| `POST` | `/api/v1/ideas/:ideaId/clarifications/:questionId/answers` | AI write    |
| `POST` | `/api/v1/ideas/:ideaId/promotions`                         | AI write    |
| `GET`  | `/api/v1/ideas`、`/api/v1/ideas/:ideaId`                   | Public read |
| `GET`  | `/api/v1/projects`、`/api/v1/projects/:projectId`          | Public read |

完整请求、响应、稳定错误与 `proposer|executor` 投影以
[OpenAPI artifact](./openapi/lp01.v1.json) 为准。

写入 token 只证明调用来源可以写入；body 中的 `actor`、`proposer` 和 `role`
是声明归属，不是已认证用户身份。公开演示环境不得保存真实秘密、个人数据或商业机密。

## 验证

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run openapi:check
npm run test:unit
npm run test:contract
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:integration
TEST_DATABASE_URL=postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation_test npm run test:acceptance
```

`npm run verify`
顺序执行全部门禁。数据库测试只应指向隔离测试数据库；不要对共享环境执行 reset、drop 或自动回滚 DDL。

## 数据与失败语义

- 每个 Idea 是并发边界，澄清和推进使用 row lock 与 `expectedVersion`。
- 每个 Idea 最多一个 `PLANNING/QUEUED` 项目。
- 幂等键在固定 workspace 内全局唯一；相同意图重放原结果，不同意图返回冲突。
- 确定性 404/409/422 会绑定幂等键；基础设施失败回滚整个事务，可用同一键重试。
- 每个成功命令原子追加脱敏 audit event；数据库触发器拒绝更新或删除历史。

实现和客观证据见
[LP-01 verification](./docs/feature/lp-01-core-idea-flow/verification.md)。
