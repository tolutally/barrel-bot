import "server-only";

export type OperatorIdentity = { operatorId: string; authUserId: string; email: string; displayName?: string; role: "ADMIN" | "OPERATOR" };
export type ConversationListItem = {
  conversationId: string;
  customer: { whatsappNumber: string | null; displayName: string | null };
  automationMode: "BOT" | "HANDOFF_PENDING" | "HUMAN";
  latestMessagePreview: string | null;
  latestMessageAt: string | null;
  latestMessageSenderType: "CUSTOMER" | "BOT" | "OPERATOR" | "SYSTEM" | null;
  publicReference: string | null;
  sourceCurrency: string | null;
  targetCurrency: string | null;
  handoffRequestedAt: string | null;
};
export type ConversationListResponse = { conversations: ConversationListItem[]; summary: { total: number; automation: number; waitingForTeam: number; humanHandling: number }; page: { number: number; limit: number; total: number; hasMore: boolean } };
export type ConversationDetailResponse = {
  conversation: {
    conversationId: string;
    automationMode: "BOT" | "HANDOFF_PENDING" | "HUMAN";
    customer: { whatsappNumber: string | null; displayName: string | null };
    handoff: { publicReference: string; state: string; tradeRequestStatus: string; requestedAt: string | null; handedOffAt: string | null; closedAt: string | null } | null;
    quote: { publicReference: string | null; sourceCurrency: string; targetCurrency: string; sourceAmount: string; indicativeTargetAmount: string; indicativeCustomerRate: string; quoteCreatedAt: string; customerRequestExpiresAt: string; indicative: true } | null;
  };
  messages: Array<{ senderType: "CUSTOMER" | "BOT" | "OPERATOR" | "SYSTEM"; contentType: string; textBody: string | null; createdAt: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null }>;
  messagePage: { limit: number; hasMore: boolean; nextBefore: string | null };
};
export type SendMessageResponse = { status: "sent"; idempotent: boolean; sentAt: string };
export type ProviderCorridorsResponse = {
  asOf: string;
  providers: Array<{ id: string; name: string; status: "AVAILABLE" | "UNAVAILABLE" }>;
  corridors: Array<{ sourceCurrency: string; targetCurrency: string; providers: Record<string, { available: boolean }> }>;
};
export type ProviderRateResponse = {
  provider: "JUICYWAY";
  sourceCurrency: string;
  targetCurrency: string;
  targetPerSourceRate: string;
  sourcePerTargetRate: string;
  displayRate: string;
  rawSymbol: string | null;
  indicative: true;
  expiresAt: string;
  fetchedAt: string;
};

function apiUrl(path: string): URL {
  const base = process.env.BARREL_API_URL;
  if (!base) throw new Error("BARREL_API_URL is required");
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

export class BarrelInternalApiClient {
  constructor(private readonly accessToken: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async me(): Promise<OperatorIdentity> { return this.request<{ operator: OperatorIdentity }>("/api/internal/me").then((value) => value.operator); }
  listConversations(input: { page?: number; limit?: number; order?: "priority" | "activity"; mode?: ConversationListItem["automationMode"] } = {}): Promise<ConversationListResponse> {
    const query = new URLSearchParams();
    if (input.page) query.set("page", String(input.page));
    if (input.limit) query.set("limit", String(input.limit));
    if (input.order === "activity") query.set("order", "activity");
    if (input.mode) query.set("mode", input.mode);
    return this.request(`/api/internal/conversations${query.size ? `?${query}` : ""}`);
  }
  getConversation(conversationId: string): Promise<ConversationDetailResponse> { return this.request(`/api/internal/conversations/${encodeURIComponent(conversationId)}`); }
  listProviderCorridors(): Promise<ProviderCorridorsResponse> { return this.request("/api/internal/providers/corridors"); }
  getProviderRate(sourceCurrency: string, targetCurrency: string): Promise<ProviderRateResponse> {
    return this.request(`/api/internal/providers/corridors/${encodeURIComponent(sourceCurrency)}/${encodeURIComponent(targetCurrency)}/rate`);
  }
  sendMessage(conversationId: string, text: string, idempotencyKey: string): Promise<SendMessageResponse> {
    return this.request(`/api/internal/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ text }) });
  }
  finishConversation(conversationId: string): Promise<{ status: "finished" }> { return this.request(`/api/internal/conversations/${encodeURIComponent(conversationId)}/finish`, { method: "POST" }); }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(apiUrl(path), {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      cache: "no-store",
    });
    if (!response.ok) throw new InternalApiError(response.status);
    return response.json() as Promise<T>;
  }
}

export class InternalApiError extends Error {
  constructor(readonly status: number) { super(`Barrel API request failed with ${status}`); }
}
