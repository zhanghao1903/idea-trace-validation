export interface WritePrincipal {
  readonly actorType: "AI";
  readonly role: "EXECUTOR";
  readonly displayName: string;
  readonly client: string | null;
  readonly onBehalfOfRole: null;
}

export interface ReportWriteContext {
  readonly principal: Readonly<WritePrincipal>;
  readonly requestId: string;
  readonly idempotencyKey: string;
}
