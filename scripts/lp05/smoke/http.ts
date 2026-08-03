export interface HttpObservation {
  status: number;
  headers: Record<string, string>;
  requestId: string | null;
}

export const observe = async (
  origin: string,
  path: string,
  init: RequestInit = {},
): Promise<HttpObservation> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL(path, origin), {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      requestId: response.headers.get("x-request-id"),
    };
  } finally {
    clearTimeout(timer);
  }
};
