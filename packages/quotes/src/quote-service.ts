import { type CustomerQuote } from "@barrel/domain";
import { calculatePricing, formatCurrencyMinor, getCurrencyMetadata } from "@barrel/pricing";
import { ProviderRegistry, type ProviderQuote } from "@barrel/providers";
import { currencyCodeSchema, positiveMinorAmountSchema } from "@barrel/shared";
import { z } from "zod";

export type DirectionalCorridorConfig = {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  provider: string;
  enabled: boolean;
  spreadMode: "FIXED" | "PERCENTAGE" | "HYBRID";
  fixedSpread: string;
  percentageSpread: string;
  minSourceAmountMinor: bigint;
  maxSourceAmountMinor: bigint;
  explicitSourceFeeMinor: bigint;
  providerFeeEstimateMinor: bigint;
  payoutFeeEstimateMinor: bigint;
  quoteTtlSeconds: number;
  targetPrecision: number;
  customerDisclaimer: string;
};

export interface CorridorConfigRepository {
  findDirectional(sourceCurrency: string, targetCurrency: string): Promise<DirectionalCorridorConfig | null>;
}

export type QuoteSnapshotInput = {
  providerQuote: ProviderQuote;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
  targetAmountMinor: bigint;
  providerRate: string;
  customerRate: string;
  fixedSpreadSnapshot: string;
  percentageSpreadSnapshot: string;
  explicitFeeMinor: bigint;
  providerFeeEstimateMinor: bigint;
  payoutFeeEstimateMinor: bigint;
  expectedMarginMinor: bigint;
  providerExpiresAt: Date;
  customerQuoteExpiresAt: Date;
  conversationId?: string;
};

export interface QuoteSnapshotRepository {
  create(input: QuoteSnapshotInput): Promise<{ id: string; quoteReference: string }>;
}

export type CreateIndicativeQuoteInput = {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
  conversationId?: string;
};

export class QuoteServiceError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_CORRIDOR"
      | "CORRIDOR_DISABLED"
      | "AMOUNT_OUT_OF_RANGE"
      | "PROVIDER_CURRENCY_MISMATCH"
      | "PROVIDER_QUOTE_EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "QuoteServiceError";
  }
}

const createQuoteInputSchema = z.object({
  sourceCurrency: currencyCodeSchema,
  targetCurrency: currencyCodeSchema,
  sourceAmountMinor: positiveMinorAmountSchema,
  conversationId: z.string().trim().min(1).optional(),
});

export class QuoteService {
  constructor(
    private readonly corridors: CorridorConfigRepository,
    private readonly providers: ProviderRegistry,
    private readonly quotes: QuoteSnapshotRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static readonly CUSTOMER_QUOTE_WINDOW_SECONDS = 900;

  async createIndicativeQuote(rawInput: CreateIndicativeQuoteInput): Promise<CustomerQuote> {
    const input = createQuoteInputSchema.parse(rawInput);
    const corridor = await this.corridors.findDirectional(input.sourceCurrency, input.targetCurrency);
    if (!corridor) {
      throw new QuoteServiceError(
        "UNSUPPORTED_CORRIDOR",
        `corridor is not configured: ${input.sourceCurrency}->${input.targetCurrency}`,
      );
    }
    if (!corridor.enabled) throw new QuoteServiceError("CORRIDOR_DISABLED", "corridor is disabled");
    if (
      input.sourceAmountMinor < corridor.minSourceAmountMinor ||
      input.sourceAmountMinor > corridor.maxSourceAmountMinor
    ) {
      throw new QuoteServiceError("AMOUNT_OUT_OF_RANGE", "source amount is outside corridor limits");
    }

    const provider = this.providers.resolve(corridor.provider);
    const providerQuote = await provider.getIndicativeQuote(input);
    if (providerQuote.expiresAt.getTime() <= this.now().getTime()) {
      throw new QuoteServiceError("PROVIDER_QUOTE_EXPIRED", "provider quote is already expired");
    }
    if (
      providerQuote.sourceCurrency.toUpperCase() !== input.sourceCurrency ||
      providerQuote.targetCurrency.toUpperCase() !== input.targetCurrency
    ) {
      throw new QuoteServiceError("PROVIDER_CURRENCY_MISMATCH", "provider returned a different corridor");
    }

    const sourcePrecision = getCurrencyMetadata(input.sourceCurrency).minorUnitPrecision;
    const pricing = calculatePricing({
      sourceAmountMinor: input.sourceAmountMinor,
      providerRate: providerQuote.normalizedSourcePerTargetRate,
      spreadMode: corridor.spreadMode,
      fixedSpread: corridor.fixedSpread,
      percentageSpread: corridor.percentageSpread,
      explicitSourceFeeMinor: corridor.explicitSourceFeeMinor,
      providerFeeEstimateMinor: corridor.providerFeeEstimateMinor,
      payoutFeeEstimateMinor: corridor.payoutFeeEstimateMinor,
      sourcePrecision,
      targetPrecision: corridor.targetPrecision,
    });

    const customerQuoteExpiresAt = new Date(
      this.now().getTime() + QuoteService.CUSTOMER_QUOTE_WINDOW_SECONDS * 1000,
    );
    const saved = await this.quotes.create({
      providerQuote,
      sourceCurrency: input.sourceCurrency,
      targetCurrency: input.targetCurrency,
      sourceAmountMinor: pricing.sourceAmountMinor,
      targetAmountMinor: pricing.targetAmountMinor,
      providerRate: pricing.providerRate,
      customerRate: pricing.customerRate,
      fixedSpreadSnapshot: pricing.fixedSpreadSnapshot,
      percentageSpreadSnapshot: pricing.percentageSpreadSnapshot,
      explicitFeeMinor: pricing.explicitFeeMinor,
      providerFeeEstimateMinor: pricing.providerFeeEstimateMinor,
      payoutFeeEstimateMinor: pricing.payoutFeeEstimateMinor,
      expectedMarginMinor: pricing.expectedMarginMinor,
      providerExpiresAt: providerQuote.expiresAt,
      customerQuoteExpiresAt,
      conversationId: input.conversationId,
    });

    return {
      id: saved.id,
      quoteReference: saved.quoteReference,
      sourceCurrency: input.sourceCurrency,
      targetCurrency: input.targetCurrency,
      sourceAmount: formatCurrencyMinor(pricing.sourceAmountMinor, input.sourceCurrency),
      targetAmount: formatCurrencyMinor(pricing.targetAmountMinor, input.targetCurrency),
      customerRate: pricing.customerRate,
      customerQuoteExpiresAt: customerQuoteExpiresAt.toISOString(),
      disclaimer: corridor.customerDisclaimer,
    };
  }
}
