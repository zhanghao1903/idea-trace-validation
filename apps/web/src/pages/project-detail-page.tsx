import type {
  ExperienceProjectDetailDto,
  ReportCurrentDto,
} from "@idea/contracts";
import { Link, useParams } from "react-router-dom";

import { apiGet } from "../app/api.js";
import { useResource } from "../app/use-resource.js";
import { ReportDynamicRegion } from "../components/report-renderer.js";
import { ErrorState, LoadingState, StaleNotice } from "../components/states.js";
import { StatusChip } from "../components/status-chip.js";

export const ProjectDetailPage = ({
  role,
}: {
  role: "proposer" | "executor";
}) => {
  const { projectId = "" } = useParams();
  const view = role.toUpperCase();
  const detailPath = `/api/v1/experience/projects/${projectId}?view=${view}`;
  const reportPath = `/api/v1/projects/${projectId}/reports/current`;
  const detail = useResource(
    (signal) => apiGet<ExperienceProjectDetailDto>(detailPath, signal),
    detailPath,
  );
  const report = useResource(
    (signal) => apiGet<ReportCurrentDto>(reportPath, signal),
    reportPath,
  );

  if (detail.initialLoading)
    return (
      <div className="page-wrap">
        <LoadingState label="正在读取项目权威事实" />
      </div>
    );
  if (detail.data === null && detail.error !== null)
    return (
      <div className="page-wrap">
        <ErrorState
          title="项目无法打开"
          detail="项目不存在、服务尚未就绪，或读取暂时失败。"
          onRetry={detail.retry}
        />
      </div>
    );
  if (detail.data === null) return null;

  const project = detail.data;
  const paths = Object.entries(project.collectionPaths);
  return (
    <div className="page-wrap project-page">
      {detail.stale && <StaleNotice onRetry={detail.retry} />}
      <Link className="back-link" to={`/${role}`}>
        <span aria-hidden="true">←</span> 返回
        {role === "proposer" ? "想法总览" : "执行工作台"}
      </Link>
      <header className="authority-header">
        <div>
          <p className="kicker">
            AUTHORITATIVE PROJECT · {project.authority.id}
          </p>
          <h1>{project.authority.goal}</h1>
          <div className="fact-row">
            <StatusChip value={project.authority.status} />
            <StatusChip value={project.authority.phase} />
            <span>权威版本 v{project.authority.version}</span>
          </div>
        </div>
        <div className="authority-version">
          <small>来源 Idea</small>
          <strong>{project.authority.ideaId}</strong>
          <span>source v{project.authority.sourceIdeaVersion}</span>
        </div>
      </header>

      <section className="role-summary" aria-labelledby="role-summary-heading">
        <div>
          <p className="kicker">{project.view} PRIORITY</p>
          <h2 id="role-summary-heading">{project.roleSummary.headline}</h2>
        </div>
        <dl>
          <div>
            <dt>下一行动</dt>
            <dd>{project.roleSummary.nextAction ?? "尚未设定"}</dd>
          </div>
          <div>
            <dt>关注</dt>
            <dd>{project.roleSummary.attentionLabel}</dd>
          </div>
        </dl>
      </section>

      <section className="authority-grid" aria-labelledby="facts-heading">
        <div className="section-heading">
          <div>
            <p className="kicker">FIXED AUTHORITY</p>
            <h2 id="facts-heading">执行事实</h2>
          </div>
          <span>动态汇报异常不会影响本区域</span>
        </div>
        <article className="fact-card fact-card--wide">
          <h3>最新进展</h3>
          <p>{project.latestProgress?.summary ?? "尚无进展记录"}</p>
          <strong>
            下一步：
            {project.latestProgress?.nextStep ??
              project.authority.currentNextStep ??
              "尚未设定"}
          </strong>
        </article>
        <article className="fact-card">
          <h3>当前关注</h3>
          <strong className="large-number">
            {project.previewCounts.attentionItems}
          </strong>
          <p>
            {project.attentionPreview.length > 0
              ? project.attentionPreview.map((item) => item.title).join(" · ")
              : "没有开放关注事项"}
          </p>
        </article>
        <article className="fact-card">
          <h3>最新结论</h3>
          <p>{project.latestConclusion?.summary ?? "尚无已确认结论"}</p>
          {project.latestConclusion !== null && (
            <strong>{project.latestConclusion.recommendation}</strong>
          )}
        </article>
        <article className="fact-card fact-card--wide">
          <h3>完整集合</h3>
          <nav className="collection-links" aria-label="项目完整集合">
            {paths.map(([name, path]) => (
              <a key={name} href={path}>
                {name}{" "}
                <span>
                  {project.previewCounts[
                    name as keyof typeof project.previewCounts
                  ] ?? ""}
                </span>
              </a>
            ))}
          </nav>
        </article>
      </section>

      {report.stale && <StaleNotice onRetry={report.retry} />}
      {report.initialLoading && <LoadingState label="正在读取 AI 结构化汇报" />}
      {report.data === null && report.error !== null && (
        <ErrorState
          title="汇报读取失败"
          detail="项目权威事实仍然可用；可单独重试动态汇报。"
          onRetry={report.retry}
        />
      )}
      {report.data !== null && <ReportDynamicRegion report={report.data} />}
    </div>
  );
};
