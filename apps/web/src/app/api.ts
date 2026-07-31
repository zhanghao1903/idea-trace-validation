export interface ApiFailureShape {
  code: string;
  message: string;
  retryable: boolean;
}

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiFailureShape,
  ) {
    super(payload.message);
    this.name = "ApiFailure";
  }
}

interface ReadEnvelope<T> {
  ok: true;
  data: T;
  meta: { requestId: string };
}

const readEnvelope = async <T>(response: Response): Promise<T> => {
  const value = (await response.json()) as
    ReadEnvelope<T> | { ok: false; error: ApiFailureShape };
  if (!response.ok || !value.ok) {
    const error = value.ok
      ? { code: "HTTP_ERROR", message: "请求未成功。", retryable: true }
      : value.error;
    throw new ApiFailure(response.status, error);
  }
  return value.data;
};

export const apiGet = async <T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> =>
  readEnvelope<T>(
    await fetch(path, {
      ...(signal === undefined ? {} : { signal }),
      credentials: "same-origin",
      headers: { accept: "application/json" },
    }),
  );

export const apiPost = async <T>(
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<T> =>
  readEnvelope<T>(
    await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": `web-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
    }),
  );
