import type { ConversationListItem } from "./api-client";

export function statusLabel(mode: ConversationListItem["automationMode"]): string {
  return mode === "HUMAN" ? "Human handling" : mode === "HANDOFF_PENDING" ? "Waiting for team" : "Automation on";
}

export function maskWhatsApp(value: string | null): string {
  if (!value) return "WhatsApp contact";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return value;
  const prefix = value.startsWith("+") ? "+" : "";
  const country = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  const local = digits.slice(-10);
  return `${prefix}${country ? `${country} ` : ""}${local.slice(0, 3)} *** ${local.slice(-4)}`;
}

export function customerLabel(item: ConversationListItem): string {
  return item.customer.displayName ?? maskWhatsApp(item.customer.whatsappNumber);
}

export function activityLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  return new Intl.DateTimeFormat("en-CA", sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}

export function corridorLabel(item: ConversationListItem): string | null {
  if (!item.sourceCurrency || !item.targetCurrency) return item.publicReference ?? null;
  return `${item.sourceCurrency} → ${item.targetCurrency}${item.publicReference ? ` · ${item.publicReference}` : ""}`;
}

export function conversationHref(conversationId: string): string {
  return `/inbox/${encodeURIComponent(conversationId)}`;
}
