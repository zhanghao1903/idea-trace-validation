export const trimJsonStrings = (value: unknown): unknown => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(trimJsonStrings);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        trimJsonStrings(child),
      ]),
    );
  }
  return value;
};
