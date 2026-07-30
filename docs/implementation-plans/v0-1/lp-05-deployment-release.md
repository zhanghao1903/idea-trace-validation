# LP-05 部署与发布就绪

- Plan ID: `LP-05`
- Source slices: Slice 8–9
- Primary requirements: REQ-026
- Primary acceptance criteria: AC-019

## 1. Goal

把已验收的 v0.1 能力部署到用户可访问的个人域名和服务器，证明服务可启动、可恢复、
可重复演示，并形成有证据和已知限制的真实发布就绪结论。

## 2. Scope

- 建立应用与数据库的生产容器、网络、健康检查和重启策略。
- 配置个人域名、HTTPS、CSP、安全头与请求大小边界。
- 提供迁移、备份、恢复和部署 smoke。
- 运行全部 required checks、核心演示脚本和生产候选验证。
- 记录实际部署、镜像、迁移、备份恢复、smoke 和已知限制证据。

## 3. Out of scope

- 企业级高可用、水平扩展、多区域容灾、复杂监控或合规认证。
- 新增未经 LP-01 至 LP-04 验收的产品能力。
- 把真实凭据、数据库 URL、业务私密数据或服务器配置提交到仓库。
- 在缺少用户部署授权时操作生产服务器、域名或 DNS。

## 4. Dependencies

- Acceptance dependency: `LP-04`
- LP-01 至 LP-04 必须提供可部署构建、完整核心故事、演示数据和可重复脚本。
- 外部输入：服务器访问方式、域名/DNS 控制、80/443 端口、持久化与备份空间、
  密钥生成和交付方式、演示数据公开策略、明确生产部署授权。

## 5. Main deliverables

- 多阶段应用镜像及生产 Compose/Caddy 配置。
- 环境变量、密钥轮换、迁移、故障处理和恢复文档。
- 可执行的备份、恢复和部署 smoke。
- 个人域名 HTTPS 部署及健康检查。
- 发布候选验证记录、演示证据、已知限制和发布建议。

## 6. Implementation stages

1. 按 Slice 8 完成容器、网络、HTTPS、安全边界与运维文档。
2. 实现并验证数据库迁移、备份、临时恢复和部署 smoke。
3. 按 Slice 9 运行完整 CI、浏览器 E2E、契约、迁移和演示脚本。
4. 获得明确授权后部署候选，记录实际证据并提交验收。

## 7. Acceptance checklist

- [ ] 空服务器可按文档启动，应用和数据库健康检查顺序正确。
- [ ] 个人域名通过 HTTPS 可访问，安全头和请求大小限制生效。
- [ ] 备份可恢复到隔离数据库，并能读取完整演示数据。
- [ ] required checks、核心浏览器故事和生产部署 smoke 全部通过。
- [ ] 按演示脚本可展示 Idea 池、执行项目、双视图、进展、问题、支持、动态汇报和完成归档。
- [ ] 日志、仓库和验收证据不包含 token、cookie、数据库 URL 或私密正文。
- [ ] 仍未证明的外部条件明确记录为限制，不被表述为已完成。

至少一个客观验收场景：从生产备份恢复到隔离环境，使用恢复后的演示数据完成核心
演示脚本；随后在个人域名上运行部署 smoke，所有检查通过且日志扫描未发现凭据。

Acceptance record:

- Result: `None`
- Accepted by: `None`
- Accepted at (UTC): `None`
- Evidence: `None`

## 8. Risks and blockers

- Risk: 服务器或 DNS 输入过晚；先完成本地可部署与恢复证据，并把外部条件明确标为阻塞。
- Risk: 凭据进入日志或文档；使用秘密注入、日志脱敏和演示数据，不复制真实值。
- Blocker: `None`

## 9. Status

`Not Started`

缺少生产部署授权或任一外部输入时，应改为 `Blocked` 并记录解除条件，而不是推断
REQ-026 已满足。

## 10. Next step

为 LP-05 启动独立 Engineering Lifecycle Requirements 阶段，并重新确认服务器、
域名、密钥交付、演示数据公开和生产部署授权。
