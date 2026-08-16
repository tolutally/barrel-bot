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

export interface RateProvider {
  getIndicativeQuote(request: RateRequest): Promise<ProviderQuote>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
