import { customerCurrencyMetadata, formatCurrencyMinor, formatCustomerRate } from "@barrel/pricing";
import type { CustomerQuote } from "@barrel/domain";
import type { PaymentPurpose } from "@prisma/client";

export { customerCurrencyMetadata, formatCustomerRate } from "@barrel/pricing";

export const PURPOSE_OPTIONS: ReadonlyArray<{ id: PaymentPurpose; label: string }> = [
  { id: "SUPPLIER_VENDOR", label: "Supplier / vendor" },
  { id: "GOODS_INVENTORY", label: "Goods / inventory" },
  { id: "SERVICES_CONTRACTOR", label: "Services / contractor" },
  { id: "INVESTMENT", label: "Investment" },
  { id: "PERSONAL_TRANSFER", label: "Personal transfer" },
  { id: "OTHER", label: "Other" },
];

export function currencyOptionLabel(currency: string): string {
  const metadata = customerCurrencyMetadata(currency);
  return `${metadata.code} — ${metadata.name}`;
}

export function parseCurrencySelection(input: string, available: readonly string[]): string | null {
  const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();
  return available.find((currency) => {
    const metadata = customerCurrencyMetadata(currency);
    return normalized === metadata.code || normalized === metadata.name.toUpperCase() || normalized === currencyOptionLabel(currency).toUpperCase();
  }) ?? null;
}

export function formatCustomerMoneyMinor(amountMinor: bigint, currency: string, compact = false): string {
  let formatted = formatCurrencyMinor(amountMinor, currency);
  if (currency.toUpperCase() === "USD") formatted = formatted.replace(/^\$/, "US$");
  return compact ? formatted.replace(/\.00$/, "") : formatted;
}

function normalizeQuotedMoney(value: string, currency: string): string {
  return currency.toUpperCase() === "USD" ? value.replace(/^\$/, "US$") : value;
}

export function formatCustomerQuoteMessage(quote: CustomerQuote): string {
  return `Your Barrel rate\n\nYou send\n${normalizeQuotedMoney(quote.sourceAmount, quote.sourceCurrency)} ${quote.sourceCurrency}\n\nYou receive approx.\n${normalizeQuotedMoney(quote.targetAmount, quote.targetCurrency)} ${quote.targetCurrency}\n\nIndicative rate\n${formatCustomerRate(quote.sourceCurrency, quote.targetCurrency, quote.customerRate)}\n\nValid for 15 minutes.\n\nFinal rate is confirmed before your transaction is accepted.`;
}

export function formatAmountPrompt(input: {
  sourceCurrency: string;
  targetCurrency: string;
  minSourceAmountMinor: bigint;
  maxSourceAmountMinor?: bigint | null;
}): string {
  const minimum = formatCustomerMoneyMinor(input.minSourceAmountMinor, input.sourceCurrency, true);
  const exampleMinor = input.sourceCurrency === "NGN" ? 2_000_000_00n : 2_000_00n;
  const example = formatCustomerMoneyMinor(exampleMinor, input.sourceCurrency, true);
  const range = input.maxSourceAmountMinor != null
    ? `Current range: ${minimum} – ${formatCustomerMoneyMinor(input.maxSourceAmountMinor, input.sourceCurrency, true)}`
    : `Minimum: ${minimum}`;
  return `How much ${input.sourceCurrency} are you sending?\n\n${range}\n\ne.g. ${example}`;
}

export function purposeLabel(purpose: PaymentPurpose): string {
  return PURPOSE_OPTIONS.find((option) => option.id === purpose)?.label ?? purpose;
}

export function parsePurposeSelection(input: string): PaymentPurpose | null {
  const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();
  return PURPOSE_OPTIONS.find((option) => option.id === normalized || option.label.toUpperCase() === normalized)?.id ?? null;
}

export function formatCustomerWhatsAppId(value: string | null): string {
  if (!value) return "Contact unavailable";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return value.startsWith("+") ? value : `+${value}`;
}

export function formatOperationalTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}
