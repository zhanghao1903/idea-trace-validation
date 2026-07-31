export const LoadingState = ({
  label = "正在读取权威数据",
}: {
  label?: string;
}) => (
  <section className="state-panel" aria-live="polite" aria-busy="true">
    <span className="loader" aria-hidden="true" />
    <h2>{label}</h2>
    <p>数据就绪后会自动显示。</p>
  </section>
);

export const EmptyState = ({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) => (
  <section className="state-panel state-panel--empty">
    <span className="state-symbol" aria-hidden="true">
      ○
    </span>
    <h2>{title}</h2>
    <p>{detail}</p>
  </section>
);

export const ErrorState = ({
  title = "暂时无法读取数据",
  detail,
  onRetry,
}: {
  title?: string;
  detail: string;
  onRetry: () => void;
}) => (
  <section className="state-panel state-panel--error" role="alert">
    <span className="state-symbol" aria-hidden="true">
      !
    </span>
    <h2>{title}</h2>
    <p>{detail}</p>
    <button type="button" className="button button--primary" onClick={onRetry}>
      重试
    </button>
  </section>
);

export const StaleNotice = ({ onRetry }: { onRetry: () => void }) => (
  <div className="stale-notice" role="status">
    <span>当前显示的是上次成功读取的数据，刷新失败。</span>
    <button type="button" onClick={onRetry}>
      重新读取
    </button>
  </div>
);
