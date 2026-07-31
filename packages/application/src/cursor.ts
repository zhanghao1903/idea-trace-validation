export interface Cursor {
  v: 1;
  updatedAt: string;
  id: string;
}

export type CursorEntity = "idea" | "project";
export type HistoryCursorEntity =
  | "progress"
  | "attention"
  | "evidence"
  | "conclusion"
  | "report"
  | "projectHistory";

export interface HistoryCursor {
  v: 1;
  resultingProjectVersion: number;
  id: string;
}

export const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeCursor = (value: string, entity: CursorEntity): Cursor => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const idPattern =
    entity === "idea"
      ? /^idea_[0-9A-HJKMNP-TV-Z]{26}$/
      : /^proj_[0-9A-HJKMNP-TV-Z]{26}$/;
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Object.keys(parsed).sort().join(",") !== "id,updatedAt,v" ||
    (parsed as { v?: unknown }).v !== 1 ||
    typeof (parsed as { updatedAt?: unknown }).updatedAt !== "string" ||
    typeof (parsed as { id?: unknown }).id !== "string" ||
    !timestampPattern.test((parsed as { updatedAt: string }).updatedAt) ||
    Number.isNaN(Date.parse((parsed as { updatedAt: string }).updatedAt)) ||
    !idPattern.test((parsed as { id: string }).id)
  ) {
    throw new Error("INVALID_CURSOR");
  }
  return parsed as Cursor;
};

const historyPattern: Record<HistoryCursorEntity, RegExp> = {
  progress: /^prog_[0-9A-HJKMNP-TV-Z]{26}$/,
  attention: /^attn_[0-9A-HJKMNP-TV-Z]{26}$/,
  evidence: /^evd_[0-9A-HJKMNP-TV-Z]{26}$/,
  conclusion: /^conc_[0-9A-HJKMNP-TV-Z]{26}$/,
  report: /^rpt_[0-9A-HJKMNP-TV-Z]{26}$/,
  projectHistory: /^(?:trn|evt)_[0-9A-HJKMNP-TV-Z]{26}$/,
};

export const encodeHistoryCursor = (cursor: HistoryCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeHistoryCursor = (
  value: string,
  entity: HistoryCursorEntity,
): HistoryCursor => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const minimumVersion = entity === "projectHistory" ? 1 : 2;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Object.keys(parsed).sort().join(",") !== "id,resultingProjectVersion,v" ||
    (parsed as { v?: unknown }).v !== 1 ||
    !Number.isInteger(
      (parsed as { resultingProjectVersion?: unknown }).resultingProjectVersion,
    ) ||
    Number(
      (parsed as { resultingProjectVersion: number }).resultingProjectVersion,
    ) < minimumVersion ||
    typeof (parsed as { id?: unknown }).id !== "string" ||
    !historyPattern[entity].test((parsed as { id: string }).id)
  ) {
    throw new Error("INVALID_CURSOR");
  }
  return parsed as HistoryCursor;
};
