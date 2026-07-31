import type {
  ExecutorProjectCardDto,
  ProposerIdeaCardDto,
} from "@idea/contracts";
import { Link, useSearchParams } from "react-router-dom";

import { apiGet } from "../app/api.js";
import { useResource } from "../app/use-resource.js";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleNotice,
} from "../components/states.js";
import { StatusChip } from "../components/status-chip.js";

interface Page<T> {
  items: T[];
  page: { limit: number; nextCursor: string | null };
}

const proposerFilters = [
  ["", "全部"],
  ["IDEA", "普通想法"],
  ["NEEDS_CLARIFICATION", "待澄清"],
  ["AWAITING_EXECUTION", "等待执行"],
  ["IN_PROGRESS", "执行中"],
  ["PAUSED", "已暂停"],
  ["COMPLETED", "已完成"],
] as const;
const executorFilters = [
  ["OPEN", "未完成"],
  ["COMPLETED", "已完成"],
] as const;

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const ProposerCard = ({ item }: { item: ProposerIdeaCardDto }) => (
  <article className="work-card">
    <div className="work-card__eyebrow">
      <StatusChip value={item.category} />
      <span>Idea v{item.ideaVersion}</span>
    </div>
    <h2>{item.intentSummary}</h2>
    {item.project === null ? (
      <p className="muted">
        尚未进入执行；当前 intake 状态为 {item.intakeStatus}。
      </p>
    ) : (
      <>
        <div className="fact-row">
          <StatusChip value={item.project.status} />
          <StatusChip value={item.project.phase} />
          <span>项目 v{item.project.version}</span>
        </div>
        <dl className="card-facts">
          <div>
            <dt>最新进展</dt>
            <dd>{item.latestProgress?.summary ?? "尚无进展记录"}</dd>
          </div>
          <div>
            <dt>下一步</dt>
            <dd>{item.currentNextStep ?? "尚未设定"}</dd>
          </div>
          <div>
            <dt>等待你</dt>
            <dd>
              {item.waitingForProposer.length > 0
                ? `${item.waitingForProposer.length} 项`
                : "无"}
            </dd>
          </div>
          <div>
            <dt>已确认结论</dt>
            <dd>{item.latestConfirmedConclusion?.summary ?? "尚无结论"}</dd>
          </div>
        </dl>
        <Link
          className="text-link"
          to={`/proposer/projects/${item.project.id}`}
        >
          查看项目详情 <span aria-hidden="true">→</span>
        </Link>
      </>
    )}
    <time dateTime={item.updatedAt}>更新于 {dateLabel(item.updatedAt)}</time>
  </article>
);

const ExecutorCard = ({ item }: { item: ExecutorProjectCardDto }) => (
  <article className="work-card work-card--executor">
    <div className="work-card__eyebrow">
      <StatusChip value={item.status} />
      <StatusChip value={item.phase} />
      <span>v{item.version}</span>
    </div>
    <h2>{item.goal}</h2>
    <div className="next-step">
      <span>当前下一步</span>
      <strong>{item.currentNextStep ?? "尚未设定"}</strong>
    </div>
    <div className="signal-grid" aria-label="项目关注摘要">
      <span>
        <strong>{item.blockers.length}</strong> 阻塞
      </span>
      <span>
        <strong>{item.pendingConfirmations}</strong> 待确认
      </span>
      <span>
        <strong>{item.supportRequests.length}</strong> 支持请求
      </span>
    </div>
    <p className="muted">
      {item.latestConclusion?.summary ??
        item.latestProgress?.summary ??
        "尚无执行记录"}
    </p>
    <Link className="text-link" to={`/executor/projects/${item.projectId}`}>
      进入执行详情 <span aria-hidden="true">→</span>
    </Link>
    <time dateTime={item.updatedAt}>更新于 {dateLabel(item.updatedAt)}</time>
  </article>
);

export const OverviewPage = ({ role }: { role: "proposer" | "executor" }) => {
  const [search, setSearch] = useSearchParams();
  const filterName = role === "proposer" ? "category" : "group";
  const defaultFilter = role === "executor" ? "OPEN" : "";
  const filter = search.get(filterName) ?? defaultFilter;
  const cursor = search.get("cursor") ?? "";
  const query = new URLSearchParams({ limit: "12" });
  if (filter !== "") query.set(filterName, filter);
  if (cursor !== "") query.set("cursor", cursor);
  const path = `/api/v1/experience/${role}/${role === "proposer" ? "ideas" : "projects"}?${query}`;
  const resource = useResource(
    (signal) =>
      apiGet<Page<ProposerIdeaCardDto | ExecutorProjectCardDto>>(path, signal),
    path,
  );
  const filters = role === "proposer" ? proposerFilters : executorFilters;

  const chooseFilter = (value: string) => {
    const next = new URLSearchParams();
    if (value !== "") next.set(filterName, value);
    setSearch(next);
  };

  return (
    <div className="page-wrap">
      <header className="page-heading">
        <div>
          <p className="kicker">
            {role === "proposer" ? "PROPOSER VIEW" : "EXECUTOR VIEW"}
          </p>
          <h1>
            {role === "proposer" ? "从想法到结论，一眼看清" : "今日执行态势"}
          </h1>
          <p>
            {role === "proposer"
              ? "按权威状态跟踪每个想法，优先处理等待你的事项。"
              : "聚焦下一步、阻塞与待确认，不遗漏需要行动的项目。"}
          </p>
        </div>
        {resource.data !== null && (
          <span className="count-badge">
            本页 {resource.data.items.length} 项
          </span>
        )}
      </header>

      <div className="filter-bar" role="group" aria-label="筛选项目">
        {filters.map(([value, label]) => (
          <button
            type="button"
            key={value || "all"}
            className={filter === value ? "is-active" : ""}
            aria-pressed={filter === value}
            onClick={() => chooseFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {resource.stale && <StaleNotice onRetry={resource.retry} />}
      {resource.initialLoading && <LoadingState />}
      {resource.data === null && resource.error !== null && (
        <ErrorState
          {...(resource.error.message.includes("not found")
            ? { title: "页面不存在" }
            : {})}
          detail="服务暂时不可用或尚未就绪；这不是空列表。"
          onRetry={resource.retry}
        />
      )}
      {resource.data?.items.length === 0 && (
        <EmptyState
          title="这个筛选下还没有内容"
          detail="换一个状态筛选，或稍后在数据进入后重试。"
        />
      )}
      {resource.data !== null && resource.data.items.length > 0 && (
        <section
          className="card-grid"
          aria-label={role === "proposer" ? "想法列表" : "项目列表"}
        >
          {resource.data.items.map((item) =>
            role === "proposer" ? (
              <ProposerCard
                key={(item as ProposerIdeaCardDto).ideaId}
                item={item as ProposerIdeaCardDto}
              />
            ) : (
              <ExecutorCard
                key={(item as ExecutorProjectCardDto).projectId}
                item={item as ExecutorProjectCardDto}
              />
            ),
          )}
        </section>
      )}
      {resource.data?.page.nextCursor !== null &&
        resource.data?.page.nextCursor !== undefined && (
          <div className="pagination">
            <button
              type="button"
              className="button button--primary"
              disabled={resource.refreshing}
              onClick={() => {
                const next = new URLSearchParams(search);
                next.set("cursor", resource.data?.page.nextCursor ?? "");
                setSearch(next);
              }}
            >
              {resource.refreshing ? "正在加载…" : "下一页"}
            </button>
          </div>
        )}
    </div>
  );
};
