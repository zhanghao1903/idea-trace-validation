export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const collectCursorPages = async <T>(input: {
  readPage: (cursor: string | undefined) => Promise<CursorPage<T>>;
  identity: (item: T) => string;
  maximumPages?: number;
}): Promise<T[]> => {
  const maximumPages = input.maximumPages ?? 100;
  if (
    !Number.isSafeInteger(maximumPages) ||
    maximumPages < 1 ||
    maximumPages > 100
  )
    throw new Error("CURSOR_PAGE_LIMIT");
  const cursors = new Set<string>();
  const identities = new Set<string>();
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maximumPages; page += 1) {
    const result = await input.readPage(cursor);
    for (const item of result.items) {
      const identity = input.identity(item);
      if (identity.length === 0 || identities.has(identity))
        throw new Error("CURSOR_DUPLICATE_ITEM");
      identities.add(identity);
      items.push(item);
    }
    if (result.nextCursor === null) return items;
    if (result.nextCursor.length === 0 || cursors.has(result.nextCursor))
      throw new Error("CURSOR_DUPLICATE");
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error("CURSOR_PAGE_LIMIT");
};
