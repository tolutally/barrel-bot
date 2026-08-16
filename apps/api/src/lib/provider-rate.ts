import "server-only";
import Decimal from "decimal.js";
import { createJuicywayProvider } from "./quote-service";

const SUPPORTED_FIAT_OR_STABLECOINS = new Set([
  "NGN", "USD", "CAD", "GBP", "EUR", "GHS", "KES", "XAF", "XOF", "USDT", "USDC",
]);
const CURRENCY_DECIMALS: Record<string, number> = { USDT: 6, USDC: 6 };

function sampleAmountMinor(currency: string): bigint {
  return 100n * 10n ** BigInt(CURRENCY_DECIMALS[currency] ?? 2);
}

function formatMarketAmount(value: string, currency: string): string {
  const decimalPlaces = CURRENCY_DECIMALS[currency] ?? 2;
  const amount = new Decimal(value);
  const fixed = amount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toFixed(decimalPlaces);
  const [whole, fraction] = fixed.split(".");
  const rendered = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
  const trimmed = rendered.includes(".") ? rendered.replace(/0+$/, "").replace(/\.$/, "") : rendered;
  return `${currency} ${trimmed}`;
}

export type InternalProviderRate = {
  provider: "JUICYWAY";
  sourceCurrency: string;
  targetCurrency: string;
  targetPerSourceRate: string;
  sourcePerTargetRate: string;
  displayRate: string;
  rawSymbol: string | null;
  indicative: true;
  expiresAt: string;
  fetchedAt: string;
};

export async function getProviderRate(sourceCurrencyInput: string, targetCurrencyInput: string): Promise<InternalProviderRate | null> {
  const sourceCurrency = sourceCurrencyInput.toUpperCase();
  const targetCurrency = targetCurrencyInput.toUpperCase();
  if (!SUPPORTED_FIAT_OR_STABLECOINS.has(sourceCurrency) || !SUPPORTED_FIAT_OR_STABLECOINS.has(targetCurrency)) return null;

  const provider = createJuicywayProvider();
  const supported = await provider.listSupportedCorridors();
  if (!supported.some((item) => item.sourceCurrency === sourceCurrency && item.targetCurrency === targetCurrency)) return null;

  const quote = await provider.getIndicativeQuote({
    sourceCurrency,
    targetCurrency,
    sourceAmountMinor: sampleAmountMinor(sourceCurrency),
  });
  const targetPerSourceRate = new Decimal(1).div(quote.normalizedSourcePerTargetRate).toSignificantDigits(12).toString();

  return {
    provider: "JUICYWAY",
    sourceCurrency,
    targetCurrency,
    targetPerSourceRate,
    sourcePerTargetRate: quote.normalizedSourcePerTargetRate,
    // Quote on the destination's unit so NGN → CAD reads naturally as
    // "1 CAD = NGN 1,042" rather than a long sub-unit decimal.
    displayRate: `1 ${targetCurrency} = ${formatMarketAmount(quote.normalizedSourcePerTargetRate, sourceCurrency)}`,
    rawSymbol: quote.rawSymbol,
    indicative: true,
    expiresAt: quote.expiresAt.toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}
