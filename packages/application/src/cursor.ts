export interface Cursor {
  v: 1;
  updatedAt: string;
  id: string;
}

export type CursorEntity = "idea" | "project";

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
