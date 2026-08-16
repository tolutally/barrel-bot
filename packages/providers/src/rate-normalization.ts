import Decimal from "decimal.js";

export class RateNormalizationError extends Error {
  readonly code = "RATE_ORIENTATION_MISMATCH";

  constructor(message: string) {
    super(message);
    this.name = "RateNormalizationError";
  }
}

export type RateNormalizationInput = {
  rawRate: string;
  rawBase: string;
  rawQuote: string;
  sourceCurrency: string;
  targetCurrency: string;
};

export function normalizeToSourcePerTarget(input: RateNormalizationInput): string {
  let rawRate: Decimal;
  try {
    rawRate = new Decimal(input.rawRate);
  } catch {
    throw new RateNormalizationError("provider rate must be a positive finite decimal");
  }
  if (!rawRate.isFinite() || rawRate.lte(0)) {
    throw new RateNormalizationError("provider rate must be a positive finite decimal");
  }

  const rawBase = input.rawBase.toUpperCase();
  const rawQuote = input.rawQuote.toUpperCase();
  const source = input.sourceCurrency.toUpperCase();
  const target = input.targetCurrency.toUpperCase();

  if (rawBase === target && rawQuote === source) return rawRate.toString();
  if (rawBase === source && rawQuote === target) return new Decimal(1).div(rawRate).toString();

  throw new RateNormalizationError(
    `provider pair ${rawBase}-${rawQuote} does not match requested direction ${source}->${target}`,
  );
}
