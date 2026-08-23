import Decimal from "decimal.js";

export type CustomerCurrencyMetadata = { code: string; name: string; symbol: string };

const CURRENCIES: Readonly<Record<string, CustomerCurrencyMetadata>> = {
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  USD: { code: "USD", name: "US Dollar", symbol: "US$" },
  USDT: { code: "USDT", name: "Tether", symbol: "USDT" },
};

export function customerCurrencyMetadata(currency: string): CustomerCurrencyMetadata {
  const code = currency.toUpperCase();
  return CURRENCIES[code] ?? { code, name: code, symbol: code };
}

function formatDecimal(value: Decimal, maximumPlaces = 4): string {
  const fixed = value.toDecimalPlaces(maximumPlaces, Decimal.ROUND_HALF_UP).toFixed(maximumPlaces).replace(/\.?0+$/, "");
  const [whole, fraction] = fixed.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** Formats a normalized source-per-target rate using the more readable one-unit side. */
export function formatCustomerRate(sourceCurrency: string, targetCurrency: string, normalizedSourcePerTargetRate: string): string {
  const rate = new Decimal(normalizedSourcePerTargetRate);
  if (!rate.isFinite() || rate.lte(0)) throw new Error("customer rate must be positive");
  const source = customerCurrencyMetadata(sourceCurrency);
  const target = customerCurrencyMetadata(targetCurrency);
  const unit = (currency: CustomerCurrencyMetadata) => currency.code === "USDT" ? `1 ${currency.code}` : `${currency.symbol}1`;
  const amount = (currency: CustomerCurrencyMetadata, value: Decimal) => currency.code === "USDT"
    ? `${formatDecimal(value, 2)} ${currency.code}`
    : `${currency.symbol}${formatDecimal(value, 2)}`;
  if (rate.gte(1)) return `${unit(target)} = ${amount(source, rate)}`;
  return `${unit(source)} = ${amount(target, new Decimal(1).div(rate))}`;
}
