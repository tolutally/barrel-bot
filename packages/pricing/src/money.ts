import Decimal from "decimal.js";
import { PricingError } from "./errors";

export const DEFAULT_MINOR_PRECISION = 2;

export type CurrencyMetadata = {
  code: string;
  minorUnitPrecision: number;
  symbol: string;
};

const CURRENCY_METADATA: Readonly<Record<string, CurrencyMetadata>> = {
  NGN: { code: "NGN", minorUnitPrecision: 2, symbol: "₦" },
  CAD: { code: "CAD", minorUnitPrecision: 2, symbol: "C$" },
  USD: { code: "USD", minorUnitPrecision: 2, symbol: "$" },
  USDT: { code: "USDT", minorUnitPrecision: 2, symbol: "USDT " },
};

export function getCurrencyMetadata(currency: string): CurrencyMetadata {
  const metadata = CURRENCY_METADATA[currency.toUpperCase()];
  if (!metadata) throw new Error(`currency metadata is not configured: ${currency.toUpperCase()}`);
  return metadata;
}

export function parseDecimal(value: string, fieldName = "decimal"): Decimal {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) throw new Error("not finite");
    return parsed;
  } catch {
    throw new PricingError("INVALID_PROVIDER_RATE", `${fieldName} must be a finite decimal`);
  }
}

export function minorToDecimal(amountMinor: bigint, precision = DEFAULT_MINOR_PRECISION): Decimal {
  return new Decimal(amountMinor.toString()).div(new Decimal(10).pow(precision));
}

export function displayToMinorUnits(value: string, precision = DEFAULT_MINOR_PRECISION): bigint {
  const scaled = parseDecimal(value, "amount").mul(new Decimal(10).pow(precision));
  if (!scaled.isInteger()) {
    throw new PricingError("INVALID_SOURCE_AMOUNT", `amount has more than ${precision} decimal places`);
  }
  return BigInt(scaled.toFixed(0));
}

export function floorToPrecision(value: Decimal, precision: number): Decimal {
  return value.toDecimalPlaces(precision, Decimal.ROUND_FLOOR);
}

export function decimalToMinorUnitsFloor(value: Decimal, precision: number): bigint {
  const scaled = floorToPrecision(value, precision).mul(new Decimal(10).pow(precision));
  return BigInt(scaled.toFixed(0));
}

export function formatMinorAmount(amountMinor: bigint, metadata: CurrencyMetadata): string {
  const { minorUnitPrecision: precision, symbol } = metadata;
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const digits = absolute.toString().padStart(precision + 1, "0");
  const wholeDigits = precision > 0 ? digits.slice(0, -precision) : digits;
  const whole = wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = precision > 0 ? `.${digits.slice(-precision)}` : "";
  return `${negative ? "-" : ""}${symbol}${whole}${fraction}`;
}

export function formatCurrencyMinor(amountMinor: bigint, currency: string): string {
  return formatMinorAmount(amountMinor, getCurrencyMetadata(currency));
}

export const formatNGN = (amountMinor: bigint): string => formatCurrencyMinor(amountMinor, "NGN");
export const formatCAD = (amountMinor: bigint): string => formatCurrencyMinor(amountMinor, "CAD");
