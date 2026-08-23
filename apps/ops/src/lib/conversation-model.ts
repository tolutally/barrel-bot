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
  const currencies: Record<string, { symbol: string; suffix?: boolean }> = {
    NGN: { symbol: "₦" }, CAD: { symbol: "C$" }, USD: { symbol: "US$" }, GBP: { symbol: "£" }, EUR: { symbol: "€" }, USDT: { symbol: "USDT", suffix: true },
  };
  const source = currencies[quote.sourceCurrency] ?? { symbol: quote.sourceCurrency, suffix: true };
  const target = currencies[quote.targetCurrency] ?? { symbol: quote.targetCurrency, suffix: true };
  const raw = Number(quote.indicativeCustomerRate);
  if (!Number.isFinite(raw) || raw <= 0) return quote.indicativeCustomerRate;
  const unit = (currency: { symbol: string; suffix?: boolean }) => currency.suffix ? `1 ${currency.symbol}` : `${currency.symbol}1`;
  const amount = (currency: { symbol: string; suffix?: boolean }, value: number) => {
    const formatted = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
    return currency.suffix ? `${formatted} ${currency.symbol}` : `${currency.symbol}${formatted}`;
  };
  return raw >= 1 ? `${unit(target)} = ${amount(source, raw)}` : `${unit(source)} = ${amount(target, 1 / raw)}`;
}
