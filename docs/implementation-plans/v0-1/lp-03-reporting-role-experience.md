# LP-03 结构化汇报与双角色体验

- Plan ID: `LP-03`
- Source slices: Slice 5–6
- Primary requirements: REQ-014–018、REQ-021–025
- Primary acceptance criteria: AC-004、AC-006、AC-013、AC-016、AC-017、AC-018

## 1. Goal

让想法提出者和执行者在无需登录的两类网页视图中读取同一权威事实，并让不同项目通过
经校验的声明式数据安全呈现不同汇报结构。

## 2. Scope

- 实现结构化汇报的 schema、语义、安全、引用、幂等和并发校验。
- 保存不可变汇报 revision，并维护最近有效与可渲染版本。
- 实现文本、指标、列表、表格、时间线、证据引用和行动项引用七类固定块。
- 实现想法提出者视图、执行者视图、角色切换和项目详情。
- 提供权威项目头、动态汇报区、历史及渲染失败回退。

## 3. Out of scope

- 任意 HTML、JavaScript、CSS、模板或 AI 生成的可执行页面。
- 完整手工新增/编辑表单、注册、登录或权限系统。
- Idea 与执行事实的底层 API；这些分别由 LP-01 和 LP-02 交付。
- AI Skill、演示数据、生产部署和企业级可观测性。

## 4. Dependencies

- Acceptance dependency: `LP-02`
- LP-01/LP-02 必须已提供权威项目、事项、证据、结论和角色化查询。
- Planning inputs:
  [structured report protocol](../../feature/v0-1-project-plan/structured-report-protocol.md),
  [schema](../../../packages/contracts/schemas/structured-report.v1.schema.json) 与
  [technical architecture](../../feature/v0-1-project-plan/technical-architecture.md).

## 5. Main deliverables

- 结构化汇报校验、版本化存储和提交 API。
- 七类受控汇报块、受限 Markdown 与安全引用补全。
- 无需登录的角色切换、想法提出者视图和执行者视图。
- 项目详情的权威头、动态汇报、历史和错误回退。
- 协议、集成、组件和浏览器端到端测试。

## 6. Implementation stages

1. 按 Slice 5 实现汇报校验、版本和提交 API。
2. 实现固定块渲染、受限 Markdown、权威引用和错误边界。
3. 按 Slice 6 实现两个角色视图、切换、筛选和项目详情。
4. 补齐空、加载、失败、旧数据、键盘和移动端基本体验。

## 7. Acceptance checklist

- [x] 两个结构与顺序不同的有效项目汇报无需项目专用页面即可正确渲染。
- [x] 无效、不支持或危险内容被拒绝且不创建 revision。
- [x] 渲染异常显示安全提示并回退上一份可渲染汇报。
- [x] 汇报不能覆盖项目状态、确认结果、操作者或审计历史。
- [x] 想法提出者视图展示全部 Idea、状态、执行进度及待其处理事项。
- [x] 执行者视图区分未完成/已完成并突出下一步、阻塞、待确认和支持请求。
- [x] 角色切换无需登录，刷新或直接 URL 后仍读取同一权威事实。

至少一个客观验收场景：为两个项目提交章节和块顺序完全不同的有效汇报，两者由同一
通用渲染器正确显示；随后提交危险或无效汇报得到可定位错误，且原有效汇报与权威状态
保持不变。

Acceptance record:

- Result: `ACCEPTED_NO_PUBLISH`
- Merge commit: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Acceptance ID: `7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8b`
- Closure ID: `25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`
- Release targets: `[]`
- Evidence:
  [LP-03 verification](../../feature/lp-03-reporting-role-experience/verification.md)

## 8. Risks and blockers

- Risk: 动态汇报变成任意页面平台；块类型冻结为已确认协议，不加入可执行内容。
- Risk: 角色视图维护平行客户端状态；所有页面从同一服务端投影读取。
- Blocker: `None`

## 9. Status

`Accepted`

结构化汇报、不可变 persistence、API、权威体验投影、Web 与比例化自动化证据已在精确
merge commit 上通过 acceptance-only/no-publish 验收关闭。没有 tag、Release、package、
部署或其他发布产物。

## 10. Next step

保留不可变验收和无发布记录。LP-04 已进入独立实现阶段；LP-03 不授予 LP-04 合并、验收或
发布权限。
