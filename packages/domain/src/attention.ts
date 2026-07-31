import { DomainError } from "./errors.js";

export type AttentionStatus = "OPEN" | "NEEDS_INFO" | "RESOLVED" | "CLOSED";
export type AttentionEventKind =
  | "COMMENT"
  | "REQUEST_INFO"
  | "PROVIDE_INFO"
  | "RESOLVE"
  | "CLOSE"
  | "CORRECT_RESPONSE";

export const nextAttentionStatus = (
  itemId: string,
  current: AttentionStatus,
  kind: AttentionEventKind,
): AttentionStatus => {
  const allowed: Record<AttentionEventKind, AttentionStatus[]> = {
    COMMENT: ["OPEN", "NEEDS_INFO", "RESOLVED", "CLOSED"],
    REQUEST_INFO: ["OPEN", "RESOLVED"],
    PROVIDE_INFO: ["NEEDS_INFO", "RESOLVED"],
    RESOLVE: ["OPEN", "NEEDS_INFO"],
    CLOSE: ["OPEN", "NEEDS_INFO", "RESOLVED"],
    CORRECT_RESPONSE: ["OPEN", "NEEDS_INFO", "RESOLVED", "CLOSED"],
  };
  if (!allowed[kind].includes(current)) {
    throw new DomainError(
      "ATTENTION_STATE_CONFLICT",
      "The attention event is not allowed from the current status.",
      {
        attentionItemId: itemId,
        currentStatus: current,
        allowedEvents: Object.entries(allowed)
          .filter(([, statuses]) => statuses.includes(current))
          .map(([event]) => event),
        recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
      },
    );
  }
  switch (kind) {
    case "REQUEST_INFO":
      return "NEEDS_INFO";
    case "PROVIDE_INFO":
      return "OPEN";
    case "RESOLVE":
      return "RESOLVED";
    case "CLOSE":
      return "CLOSED";
    case "COMMENT":
    case "CORRECT_RESPONSE":
      return current;
  }
};
