import type { PrismaClient } from "@prisma/client";
import { displayToMinorUnits, getCurrencyMetadata, minorToDecimal } from "@barrel/pricing";
import type { QuoteService } from "@barrel/quotes";
import type { TradeIntentApplicationService } from "@barrel/trade-intents";
import type { AdminNotificationDispatcher, TradeHandoffApplicationService } from "@barrel/handoffs";
import {
  normalizePublicWhatsAppNumber, PublicApiError, publicQuoteRequestSchema, publicTradeRequestSchema,
  type PublicCorridorDTO, type PublicQuoteDTO, type PublicTradeRequestDTO,
} from "./contracts";

function currencyLabel(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code; } catch { return code; }
}

function currencyPrecision(code: string): number {
  try { return getCurrencyMetadata(code).minorUnitPrecision; } catch {
    try { return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
  }
}

export class PublicApiService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly quotes: QuoteService,
    private readonly tradeIntents: TradeIntentApplicationService,
    private readonly handoffs: TradeHandoffApplicationService,
    private readonly notifications: AdminNotificationDispatcher,
  ) {}

  async listCorridors(): Promise<PublicCorridorDTO[]> {
    const rows = await this.prisma.corridorConfig.findMany({ where: { enabled: true }, orderBy: [{ sourceCurrency: "asc" }, { targetCurrency: "asc" }] });
    return rows.map((row) => {
      const precision = currencyPrecision(row.sourceCurrency);
      return {
        sourceCurrency: row.sourceCurrency,
        targetCurrency: row.targetCurrency,
        sourceLabel: currencyLabel(row.sourceCurrency),
        targetLabel: currencyLabel(row.targetCurrency),
        minSourceAmount: minorToDecimal(row.minSourceAmountMinor, precision).toFixed(precision),
        maxSourceAmount: minorToDecimal(row.maxSourceAmountMinor, precision).toFixed(precision),
      };
    });
  }

  async createQuote(raw: unknown): Promise<PublicQuoteDTO> {
    const parsed = publicQuoteRequestSchema.safeParse(raw);
    if (!parsed.success) throw new PublicApiError("INVALID_REQUEST", "Check the currencies and amount supplied.", 400);
    let sourceAmountMinor: bigint;
    try {
      const precision = currencyPrecision(parsed.data.sourceCurrency);
      sourceAmountMinor = displayToMinorUnits(parsed.data.sourceAmount, precision);
      if (sourceAmountMinor <= 0n) throw new Error("non-positive");
    } catch {
      throw new PublicApiError("INVALID_REQUEST", "Enter a valid positive source amount.", 400);
    }
    const corridor = await this.prisma.corridorConfig.findUnique({
      where: { sourceCurrency_targetCurrency: { sourceCurrency: parsed.data.sourceCurrency, targetCurrency: parsed.data.targetCurrency } },
    });
    if (!corridor) throw new PublicApiError("UNSUPPORTED_CORRIDOR", "This currency direction is not available.", 422);
    if (!corridor.enabled) throw new PublicApiError("CORRIDOR_UNAVAILABLE", "This currency direction is temporarily unavailable.", 422);
    if (sourceAmountMinor < corridor.minSourceAmountMinor) throw new PublicApiError("AMOUNT_BELOW_MINIMUM", "The amount is below this corridor’s minimum.", 422);
    if (sourceAmountMinor > corridor.maxSourceAmountMinor) throw new PublicApiError("AMOUNT_ABOVE_MAXIMUM", "The amount is above this corridor’s maximum.", 422);
    try {
      const quote = await this.quotes.createIndicativeQuote({ ...parsed.data, sourceAmountMinor });
      return {
        id: quote.id,
        reference: quote.quoteReference,
        sourceCurrency: quote.sourceCurrency,
        targetCurrency: quote.targetCurrency,
        sourceAmount: quote.sourceAmount,
        targetAmount: quote.targetAmount,
        customerRate: quote.customerRate,
        requestExpiresAt: quote.customerQuoteExpiresAt,
        indicative: true,
        disclaimer: quote.disclaimer,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "UNSUPPORTED_CORRIDOR") throw new PublicApiError("UNSUPPORTED_CORRIDOR", "This currency direction is not available.", 422);
      if (code === "CORRIDOR_DISABLED") throw new PublicApiError("CORRIDOR_UNAVAILABLE", "This currency direction is temporarily unavailable.", 422);
      if (code === "AMOUNT_OUT_OF_RANGE") throw new PublicApiError("INVALID_REQUEST", "The amount is outside this corridor’s limits.", 422);
      throw new PublicApiError("RATE_UNAVAILABLE", "A rate is temporarily unavailable. Please try again.", 503);
    }
  }

  async createTradeRequest(raw: unknown, idempotencyKey: string | null): Promise<PublicTradeRequestDTO> {
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new PublicApiError("INVALID_REQUEST", "A valid Idempotency-Key header is required.", 400);
    }
    const parsed = publicTradeRequestSchema.safeParse(raw);
    if (!parsed.success) throw new PublicApiError("INVALID_REQUEST", "Check the trade-request information supplied.", 400);
    const whatsappNumber = normalizePublicWhatsAppNumber(parsed.data.whatsappNumber);
    try {
      const intent = await this.tradeIntents.createWebsiteRequest({
        ...parsed.data,
        whatsappNumber,
        idempotencyKey,
      });
      await this.handoffs.requestHumanHandoff({ tradeIntentId: intent.id, originatingChannel: "WEB" });
      await this.notifications.dispatchTradeIntentNotifications(intent.id);
      return {
        reference: intent.publicReference,
        status: "RECEIVED",
        message: "Your trade request has been sent to our trading desk. A Barrel specialist will contact you on WhatsApp to confirm the live rate and next steps.",
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : "";
      if (code === "P2025") throw new PublicApiError("QUOTE_NOT_FOUND", "Quote not found.", 404);
      if (code === "QUOTE_EXPIRED") throw new PublicApiError("QUOTE_EXPIRED", "This quote has expired. Please get a fresh rate.", 409);
      if (message === "IDEMPOTENCY_KEY_CONFLICT" || message === "TRADE_REQUEST_ALREADY_SUBMITTED") {
        throw new PublicApiError("TRADE_REQUEST_ALREADY_SUBMITTED", "This trade request was already submitted.", 409);
      }
      throw error instanceof PublicApiError ? error : new PublicApiError("INTERNAL_ERROR", "We could not submit the request. Please try again.", 500);
    }
  }
}
