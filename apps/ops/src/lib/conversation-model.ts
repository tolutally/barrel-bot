import type { ConversationDetailResponse } from "./api-client";

export function messageLabel(sender: ConversationDetailResponse["messages"][number]["senderType"]): string {
  return sender === "OPERATOR" ? "Staff" : sender === "BOT" ? "Bot" : sender === "SYSTEM" ? "System" : "Customer";
}

export function messageStatus(message: ConversationDetailResponse["messages"][number]): string | null {
  if (message.senderType !== "BOT" && message.senderType !== "OPERATOR") return null;
  return message.failedAt ? "Failed" : message.readAt ? "Read" : message.deliveredAt ? "Delivered" : message.sentAt ? "Sent" : null;
}

export function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function rateLabel(quote: NonNullable<ConversationDetailResponse["conversation"]["quote"]>): string {
  const symbols: Record<string, string> = { NGN: "₦", CAD: "C$", USD: "US$", GBP: "£", EUR: "€", USDT: "USDT " };
  const numericRate = Number(quote.indicativeCustomerRate);
  const rate = Number.isFinite(numericRate)
    ? new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(numericRate)
    : quote.indicativeCustomerRate;
  return `${symbols[quote.targetCurrency] ?? `${quote.targetCurrency} `}1 = ${symbols[quote.sourceCurrency] ?? `${quote.sourceCurrency} `}${rate}`;
}
