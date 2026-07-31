const labels: Record<string, string> = {
  IDEA: "普通想法",
  NEEDS_CLARIFICATION: "待澄清",
  AWAITING_EXECUTION: "等待执行",
  QUEUED: "排队中",
  IN_PROGRESS: "执行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  OPEN: "未完成",
  PLANNING: "规划",
  BUILDING: "构建",
  VALIDATING: "验证",
  CONCLUDING: "收尾",
};

export const StatusChip = ({ value }: { value: string }) => (
  <span className={`status-chip status-chip--${value.toLowerCase()}`}>
    <span aria-hidden="true" className="status-chip__dot" />
    {labels[value] ?? value}
  </span>
);
