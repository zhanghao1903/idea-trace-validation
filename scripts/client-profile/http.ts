import { endpoint } from "./url.js";

export interface JsonResponse {
  status: number;
  headers: Headers;
  value: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const requestJson = async (
  baseUrl: string,
  pathname: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JsonResponse> => {
  const target = endpoint(baseUrl, pathname);
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(target, {
      ...init,
      redirect: "manual",
      signal,
      headers: { accept: "application/json", ...init.headers },
    });
  } catch {
    throw new Error("CONNECTION_FAILED");
  }
  if (response.status >= 300 && response.status < 400)
    throw new Error("REDIRECT_REJECTED");
  if (new URL(response.url).origin !== target.origin)
    throw new Error("ORIGIN_MISMATCH");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json"))
    throw new Error("RESPONSE_INVALID");
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("RESPONSE_INVALID");
  }
  return { status: response.status, headers: response.headers, value };
};
