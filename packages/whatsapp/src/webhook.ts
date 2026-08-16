import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type InboundWhatsAppMessage = {
  id: string;
  from: string;
  text: string;
  type: "text" | "interactive";
  commandText?: string;
  metadata?: Record<string, unknown>;
  contextMessageId?: string;
};

export type InboundWhatsAppStatus = {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: Date;
  failureCode?: string;
  failureMessage?: string;
};

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function webhookPayloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyWebhookChallenge(
  params: URLSearchParams,
  configuredVerifyToken: string,
): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  return mode === "subscribe" && token === configuredVerifyToken && challenge ? challenge : null;
}

export function extractInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];
  const result: InboundWhatsAppMessage[] = [];
  for (const entry of entries) {
    const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown }).changes : undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change && typeof change === "object" ? (change as { value?: unknown }).value : undefined;
      const messages = value && typeof value === "object" ? (value as { messages?: unknown }).messages : undefined;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const item = message as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.from !== "string") continue;
        const contextId = (item.context as { id?: unknown } | undefined)?.id;
        const contextMessageId = typeof contextId === "string" ? contextId : undefined;
        if (item.type === "text") {
          const text = (item.text as { body?: unknown } | undefined)?.body;
          if (typeof text === "string") {
            result.push({ id: item.id, from: item.from, text, type: "text", ...(contextMessageId ? { contextMessageId } : {}) });
          }
        } else if (item.type === "interactive") {
          const interactive = item.interactive as
            | { button_reply?: { id?: unknown; title?: unknown }; list_reply?: { id?: unknown; title?: unknown; description?: unknown } }
            | undefined;
          const button = interactive?.button_reply;
          const list = interactive?.list_reply;
          const selection = button?.id ?? list?.id;
          if (typeof selection === "string") {
            const title = button?.title ?? list?.title;
            result.push({
              id: item.id,
              from: item.from,
              text: typeof title === "string" ? title : selection,
              commandText: selection,
              type: "interactive",
              metadata: {
                interactiveId: selection,
                ...(typeof title === "string" ? { interactiveTitle: title } : {}),
                ...(typeof list?.description === "string" ? { interactiveDescription: list.description } : {}),
              },
              ...(contextMessageId ? { contextMessageId } : {}),
            });
          }
        }
      }
    }
  }
  return result;
}

export function extractInboundStatuses(payload: unknown): InboundWhatsAppStatus[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];
  const result: InboundWhatsAppStatus[] = [];
  for (const entry of entries) {
    const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown }).changes : undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change && typeof change === "object" ? (change as { value?: unknown }).value : undefined;
      const statuses = value && typeof value === "object" ? (value as { statuses?: unknown }).statuses : undefined;
      if (!Array.isArray(statuses)) continue;
      for (const rawStatus of statuses) {
        if (!rawStatus || typeof rawStatus !== "object") continue;
        const item = rawStatus as Record<string, unknown>;
        if (typeof item.id !== "string" || !["sent", "delivered", "read", "failed"].includes(String(item.status))) continue;
        const timestamp = typeof item.timestamp === "string" ? Number(item.timestamp) : Number.NaN;
        const error = Array.isArray(item.errors) && item.errors[0] && typeof item.errors[0] === "object"
          ? item.errors[0] as { code?: unknown; title?: unknown; message?: unknown; error_data?: { details?: unknown } }
          : undefined;
        const failureCode = typeof error?.code === "number" || typeof error?.code === "string"
          ? `META_${String(error.code)}`
          : undefined;
        const rawFailureMessage = error?.error_data?.details ?? error?.message ?? error?.title;
        const failureMessage = typeof rawFailureMessage === "string" ? rawFailureMessage : undefined;
        result.push({
          messageId: item.id,
          status: item.status as InboundWhatsAppStatus["status"],
          occurredAt: Number.isFinite(timestamp) ? new Date(timestamp * 1_000) : new Date(),
          ...(failureCode ? { failureCode } : {}),
          ...(failureMessage ? { failureMessage } : {}),
        });
      }
    }
  }
  return result;
}

export interface WebhookEventRepository {
  reserve(input: { provider: "META_WHATSAPP"; externalId: string; eventType: string; payloadHash: string }): Promise<boolean>;
  markProcessed(provider: "META_WHATSAPP", externalId: string, at: Date): Promise<void>;
}

export async function reserveInboundMessages(
  repository: WebhookEventRepository,
  messages: InboundWhatsAppMessage[],
  payloadHash: string,
): Promise<InboundWhatsAppMessage[]> {
  const accepted: InboundWhatsAppMessage[] = [];
  for (const message of messages) {
    const reserved = await repository.reserve({
      provider: "META_WHATSAPP",
      externalId: message.id,
      eventType: `MESSAGE_${message.type.toUpperCase()}`,
      payloadHash,
    });
    if (reserved) accepted.push(message);
  }
  return accepted;
}
