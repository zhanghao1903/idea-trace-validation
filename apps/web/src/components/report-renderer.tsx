import type {
  HydratedAttentionRefDto,
  HydratedEvidenceRefDto,
  ReportCurrentDto,
  ReportRenderSlotDto,
  SafeReportRenderModelDto,
} from "@idea/contracts";
import { Component, type ReactNode } from "react";

type ReportBlock =
  SafeReportRenderModelDto["sections"][number]["blocks"][number];

const valueText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return "—";
};

interface InlineToken {
  type: string;
  value?: string;
  href?: string;
  children?: unknown[];
}

const InlineTokens = ({ tokens }: { tokens: readonly unknown[] }) => (
  <>
    {tokens.map((raw, index) => {
      const token = raw as InlineToken;
      switch (token.type) {
        case "text":
          return <span key={index}>{token.value}</span>;
        case "strong":
          return (
            <strong key={index}>
              <InlineTokens tokens={token.children ?? []} />
            </strong>
          );
        case "emphasis":
          return (
            <em key={index}>
              <InlineTokens tokens={token.children ?? []} />
            </em>
          );
        case "inline_code":
          return <code key={index}>{token.value}</code>;
        case "link":
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InlineTokens tokens={token.children ?? []} />
            </a>
          );
        case "break":
          return <br key={index} />;
        default:
          throw new Error("REPORT_RENDER_TOKEN_UNSUPPORTED");
      }
    })}
  </>
);

interface MarkdownToken {
  type: string;
  ordered?: boolean;
  children?: unknown[];
  items?: unknown[][];
}

const MarkdownBlocks = ({ blocks }: { blocks: readonly unknown[] }) => (
  <>
    {blocks.map((raw, index) => {
      const block = raw as MarkdownToken;
      if (block.type === "paragraph")
        return (
          <p key={index}>
            <InlineTokens tokens={block.children ?? []} />
          </p>
        );
      if (block.type === "list") {
        const Tag = block.ordered === true ? "ol" : "ul";
        return (
          <Tag key={index}>
            {(block.items ?? []).map((item, itemIndex) => (
              <li key={itemIndex}>
                <MarkdownBlocks blocks={item} />
              </li>
            ))}
          </Tag>
        );
      }
      throw new Error("REPORT_RENDER_MARKDOWN_UNSUPPORTED");
    })}
  </>
);

const RecordFields = ({
  value,
}: {
  value: Readonly<Record<string, unknown>>;
}) => (
  <>
    {Object.entries(value).map(([key, entry]) => (
      <span key={key}>
        <small>{key}</small>
        {valueText(entry)}
      </span>
    ))}
  </>
);

const ReferenceCard = ({
  reference,
}: {
  reference: HydratedEvidenceRefDto | HydratedAttentionRefDto;
}) => (
  <li className="reference-card">
    <div>
      <span className="mono">{reference.id}</span>
      <strong>{reference.title}</strong>
    </div>
    <span>
      {"kind" in reference
        ? `${reference.kind} · ${reference.state}`
        : `${reference.type} · ${reference.status}`}
    </span>
    <a href={reference.detailPath}>查看权威记录</a>
  </li>
);

const ReportBlockView = ({
  block,
  slot,
}: {
  block: ReportBlock;
  slot: ReportRenderSlotDto;
}) => {
  switch (block.type) {
    case "text":
      return (
        <div className="report-text">
          <MarkdownBlocks blocks={block.content} />
        </div>
      );
    case "metrics":
      return (
        <div className="metric-grid">
          {block.items.map((item, index) => (
            <div className="metric" key={index}>
              <RecordFields value={item} />
            </div>
          ))}
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="report-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <RecordFields value={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table": {
      const columnKeys = block.columns.map((column) => valueText(column.key));
      return (
        <div className="table-scroll">
          <table>
            <caption>结构化报告表格</caption>
            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={columnKeys[index] || index}>
                    {valueText(column.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => {
                const cells =
                  typeof row.cells === "object" && row.cells !== null
                    ? (row.cells as Readonly<Record<string, unknown>>)
                    : {};
                return (
                  <tr key={valueText(row.id) || rowIndex}>
                    {columnKeys.map((key) => (
                      <td key={key}>{valueText(cells[key])}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    case "timeline":
      return (
        <ol className="timeline">
          {block.items.map((item, index) => (
            <li key={index}>
              <RecordFields value={item} />
            </li>
          ))}
        </ol>
      );
    case "evidence_refs": {
      const selected = block.evidenceIds
        .map((id) => slot.hydratedRefs.evidence.find((item) => item.id === id))
        .filter((item): item is HydratedEvidenceRefDto => item !== undefined);
      return (
        <ul className="reference-list">
          {selected.map((item) => (
            <ReferenceCard key={item.id} reference={item} />
          ))}
        </ul>
      );
    }
    case "action_refs": {
      const selected = block.attentionItemIds
        .map((id) =>
          slot.hydratedRefs.attentionItems.find((item) => item.id === id),
        )
        .filter((item): item is HydratedAttentionRefDto => item !== undefined);
      return (
        <ul className="reference-list">
          {selected.map((item) => (
            <ReferenceCard key={item.id} reference={item} />
          ))}
        </ul>
      );
    }
    default:
      throw new Error("REPORT_RENDER_BLOCK_UNSUPPORTED");
  }
};

export const ReportSlot = ({ slot }: { slot: ReportRenderSlotDto }) => (
  <article className="report-document" lang={slot.renderModel.locale}>
    <header>
      <p className="kicker">AI STRUCTURED REPORT</p>
      <h2>{slot.renderModel.title}</h2>
      {slot.renderModel.summary !== null && <p>{slot.renderModel.summary}</p>}
    </header>
    {slot.renderModel.sections.map((section) => (
      <section
        key={section.id}
        className="report-section"
        aria-labelledby={`section-${section.id}`}
      >
        <h3 id={`section-${section.id}`}>{section.title}</h3>
        {section.description !== null && (
          <p className="muted">{section.description}</p>
        )}
        {section.blocks.map((block) => (
          <div
            key={block.id}
            className={`report-block report-block--${block.type}`}
          >
            <ReportBlockView block={block} slot={slot} />
          </div>
        ))}
      </section>
    ))}
  </article>
);

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

class DynamicBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    // Fixed UI code only. Report source and credentials must never reach diagnostics.
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const RuntimeFailure = ({
  fallback,
}: {
  fallback: ReportRenderSlotDto | null;
}) => (
  <div className="runtime-fallback" role="alert">
    <h2>REPORT_RENDER_RUNTIME_FAILED</h2>
    <p>最新动态汇报无法显示。权威项目事实仍可正常使用。</p>
    {fallback === null ? (
      <p>没有可安全显示的历史汇报。</p>
    ) : (
      <>
        <p>正在显示独立补全的回退 revision {fallback.revision}。</p>
        <ReportSlot slot={fallback} />
      </>
    )}
  </div>
);

export const ReportDynamicRegion = ({
  report,
}: {
  report: ReportCurrentDto;
}) => {
  if (report.displayMode === "EMPTY")
    return (
      <section className="report-region">
        <h2>AI 结构化汇报</h2>
        <p>尚无汇报。项目权威数据不受影响。</p>
      </section>
    );
  if (report.primary === null)
    return (
      <section className="report-region">
        <h2>AI 结构化汇报</h2>
        <p>REPORT_RENDER_UNAVAILABLE：没有受支持的可渲染版本。</p>
      </section>
    );
  return (
    <section className="report-region" aria-labelledby="report-heading">
      <div className="report-region__heading">
        <div>
          <p className="kicker">DYNAMIC REGION</p>
          <h2 id="report-heading">AI 结构化汇报</h2>
        </div>
        <div className="revision-labels">
          <span>accepted r{report.accepted?.revision ?? "—"}</span>
          <span>rendered r{report.primary.revision}</span>
        </div>
      </div>
      {report.displayMode !== "CURRENT" && (
        <p className="compatibility-notice">
          {report.compatibilityCode ?? "REPORT_RENDER_UNAVAILABLE"}
          ：当前显示兼容版本 r{report.primary.revision}。
        </p>
      )}
      <DynamicBoundary
        fallback={<RuntimeFailure fallback={report.runtimeFallback} />}
      >
        <ReportSlot slot={report.primary} />
      </DynamicBoundary>
    </section>
  );
};
