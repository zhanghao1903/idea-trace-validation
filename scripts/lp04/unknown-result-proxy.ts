import { createServer, type IncomingHttpHeaders, type Server } from "node:http";

import { sha256 } from "./request-identity.js";

export interface UnknownResultFaultPlan {
  method: "POST";
  path: string;
  idempotencyKeySha256: string;
  action: "DROP_AFTER_UPSTREAM_RESPONSE";
  remainingFaults: number;
}

const boundedBody = async (request: AsyncIterable<Buffer>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 300_000) throw new Error("PROXY_REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const forwardHeaders = (headers: IncomingHttpHeaders): Headers => {
  const forwarded = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      name.toLowerCase() === "host" ||
      name.toLowerCase() === "content-length"
    )
      continue;
    if (Array.isArray(value))
      for (const item of value) forwarded.append(name, item);
    else forwarded.set(name, value);
  }
  return forwarded;
};

export class UnknownResultProxy {
  readonly upstreamOrigin: string;
  readonly plan: UnknownResultFaultPlan;
  readonly triggered: Promise<{ status: number }>;
  private readonly server: Server;
  private resolveTriggered!: (value: { status: number }) => void;
  private releaseFault!: () => void;
  private readonly faultReleased: Promise<void>;
  origin = "";

  constructor(upstreamOrigin: string, plan: UnknownResultFaultPlan) {
    this.upstreamOrigin = upstreamOrigin;
    this.plan = plan;
    this.triggered = new Promise((resolve) => {
      this.resolveTriggered = resolve;
    });
    this.faultReleased = new Promise((resolve) => {
      this.releaseFault = resolve;
    });
    this.server = createServer(async (request, response) => {
      try {
        const body = await boundedBody(request);
        const pathname = new URL(request.url ?? "/", "http://loopback")
          .pathname;
        const key = request.headers["idempotency-key"];
        const matches =
          request.method === plan.method &&
          pathname === plan.path &&
          typeof key === "string" &&
          sha256(key) === plan.idempotencyKeySha256 &&
          plan.remainingFaults > 0;
        const method = request.method ?? "GET";
        const hasBody = method !== "GET" && method !== "HEAD";
        const upstream = await fetch(
          new URL(request.url ?? "/", this.upstreamOrigin),
          {
            method,
            headers: forwardHeaders(request.headers),
            ...(hasBody ? { body: body.toString("utf8") } : {}),
            redirect: "error",
          },
        );
        const upstreamBody = Buffer.from(await upstream.arrayBuffer());
        if (matches) {
          plan.remainingFaults -= 1;
          this.resolveTriggered({ status: upstream.status });
          await this.faultReleased;
          request.socket.destroy();
          return;
        }
        response.statusCode = upstream.status;
        for (const [name, value] of upstream.headers.entries()) {
          if (
            ![
              "connection",
              "content-encoding",
              "content-length",
              "transfer-encoding",
            ].includes(name.toLowerCase())
          )
            response.setHeader(name, value);
        }
        response.setHeader("content-length", String(upstreamBody.length));
        response.end(upstreamBody);
      } catch {
        if (!response.headersSent) response.statusCode = 502;
        response.end();
      }
    });
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (address === null || typeof address === "string")
      throw new Error("PROXY_ADDRESS_INVALID");
    this.origin = `http://127.0.0.1:${address.port}`;
    return this.origin;
  }

  release(): void {
    this.releaseFault();
  }

  async close(): Promise<void> {
    this.release();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
}
