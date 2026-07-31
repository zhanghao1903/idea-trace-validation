import type { HumanConfirmationSummaryDto } from "@idea/contracts";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiFailure, apiGet, apiPost } from "../app/api.js";
import { useResource } from "../app/use-resource.js";
import { ErrorState, LoadingState } from "../components/states.js";
import { StatusChip } from "../components/status-chip.js";

interface ConfirmationRead {
  confirmation: HumanConfirmationSummaryDto;
}

export const ConfirmationPage = () => {
  const { confirmationId = "" } = useParams();
  const path = `/api/v1/human-confirmations/${confirmationId}`;
  const resource = useResource(
    (signal) => apiGet<ConfirmationRead>(path, signal),
    path,
  );
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"APPROVE" | "REJECT" | null>(
    null,
  );
  const [result, setResult] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  if (resource.initialLoading)
    return (
      <div className="page-wrap">
        <LoadingState label="正在验证单次确认访问" />
      </div>
    );
  if (resource.data === null && resource.error !== null)
    return (
      <div className="page-wrap">
        <ErrorState
          title="无法访问该确认"
          detail="此浏览器没有对应的有效 scoped capability，或确认已失效。"
          onRetry={resource.retry}
        />
      </div>
    );
  if (resource.data === null) return null;
  const confirmation = resource.data.confirmation;
  const active =
    confirmation.usability === "ACTIVE" && confirmation.decision === "PENDING";

  const decide = async (decision: "APPROVE" | "REJECT") => {
    setSubmitting(decision);
    setResult(null);
    try {
      await apiPost(
        `/api/v1/human-confirmations/${confirmation.id}/decisions`,
        {
          expectedVersion: confirmation.expectedProjectVersion,
          decision,
          decisionNote: note,
          actor: { actorType: "HUMAN", role: "PROPOSER", displayName },
          reason: "Scoped confirmation decision from LP-03 Web",
        },
      );
      setResult({
        kind: "success",
        message: decision === "APPROVE" ? "已批准该确认。" : "已拒绝该确认。",
      });
      resource.retry();
    } catch (error) {
      setResult({
        kind: "error",
        message:
          error instanceof ApiFailure
            ? `${error.payload.code}：决定未生效。`
            : "决定未生效，请安全重试。",
      });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="page-wrap confirmation-page">
      <Link className="back-link" to="/proposer">
        ← 返回公开视图
      </Link>
      <header className="page-heading">
        <div>
          <p className="kicker">SCOPED HUMAN CONFIRMATION</p>
          <h1>一次性确认</h1>
          <p>本页仅能处理下列精确摘要，不包含任何其他写操作。</p>
        </div>
        <StatusChip value={confirmation.usability} />
      </header>
      <section
        className="confirmation-summary"
        aria-labelledby="confirmation-heading"
      >
        <h2 id="confirmation-heading">{confirmation.operation}</h2>
        <dl>
          <div>
            <dt>项目</dt>
            <dd className="mono">{confirmation.projectId}</dd>
          </div>
          <div>
            <dt>预期版本</dt>
            <dd>v{confirmation.expectedProjectVersion}</dd>
          </div>
          <div>
            <dt>到期时间</dt>
            <dd>{new Date(confirmation.expiresAt).toLocaleString("zh-CN")}</dd>
          </div>
          <div>
            <dt>当前决定</dt>
            <dd>{confirmation.decision}</dd>
          </div>
        </dl>
        <details>
          <summary>查看服务端固定摘要</summary>
          <pre>{JSON.stringify(confirmation.payloadSummary, null, 2)}</pre>
        </details>
      </section>
      {active ? (
        <form
          className="confirmation-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            你的显示名称
            <input
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            决定说明
            <textarea
              required
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              disabled={
                submitting !== null ||
                displayName.trim() === "" ||
                note.trim() === ""
              }
              onClick={() => void decide("APPROVE")}
            >
              批准
            </button>
            <button
              className="button button--danger"
              type="button"
              disabled={
                submitting !== null ||
                displayName.trim() === "" ||
                note.trim() === ""
              }
              onClick={() => void decide("REJECT")}
            >
              拒绝
            </button>
          </div>
        </form>
      ) : (
        <p className="compatibility-notice">
          该 capability 当前为 {confirmation.usability}，不能再提交决定。
        </p>
      )}
      {result !== null && (
        <p
          role={result.kind === "error" ? "alert" : "status"}
          className={`result result--${result.kind}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
};
