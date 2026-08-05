const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const normalizeBaseUrl = (
  input: string,
  allowLoopbackHttp = false,
): string => {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("BASE_URL_INVALID");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== "/"
  )
    throw new Error("BASE_URL_INVALID");
  const allowedHttp =
    allowLoopbackHttp &&
    parsed.protocol === "http:" &&
    loopbackHosts.has(parsed.hostname === "::1" ? "[::1]" : parsed.hostname);
  if (parsed.protocol !== "https:" && !allowedHttp)
    throw new Error("BASE_URL_HTTPS_REQUIRED");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("BASE_URL_INVALID");
  return parsed.origin;
};

export const endpoint = (baseUrl: string, pathname: string): URL => {
  if (!pathname.startsWith("/") || pathname.startsWith("//"))
    throw new Error("ENDPOINT_INVALID");
  const base = new URL(baseUrl);
  const result = new URL(pathname, `${base.origin}/`);
  if (result.origin !== base.origin) throw new Error("ORIGIN_MISMATCH");
  return result;
};

export const assertOpenapiUrl = (baseUrl: string, openapiUrl: string): void => {
  if (endpoint(baseUrl, "/openapi.json").toString() !== openapiUrl)
    throw new Error("OPENAPI_URL_INVALID");
};

export const isLoopbackBaseUrl = (baseUrl: string): boolean => {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname === "::1" ? "[::1]" : parsed.hostname;
  return parsed.protocol === "http:" && loopbackHosts.has(host);
};
