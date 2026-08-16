export type RateRequest = {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
};

export type ProviderQuote = {
  provider: string;
  providerQuoteId: string | null;
  sourceCurrency: string;
  targetCurrency: string;
  normalizedSourcePerTargetRate: string;
  rawRate: string;
  rawSymbol: string | null;
  rawType: "buy" | "sell" | null;
  locked: boolean;
  expiresAt: Date;
  rawResponse: unknown;
};

/** A direction as the provider publishes it: source currency -> target currency. */
export type ProviderCorridor = {
  provider: string;
  sourceCurrency: string;
  targetCurrency: string;
};

export interface RateProvider {
  getIndicativeQuote(request: RateRequest): Promise<ProviderQuote>;
  /**
   * Lists the provider's currently supported directions. This deliberately does
   * not include a price: corridor discovery must not be mistaken for a quote.
   */
  listSupportedCorridors(): Promise<ProviderCorridor[]>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
