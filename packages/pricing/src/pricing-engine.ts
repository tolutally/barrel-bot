import Decimal from "decimal.js";
import { PricingError } from "./errors";
import { decimalToMinorUnitsFloor, minorToDecimal, parseDecimal } from "./money";
import type { PricingInput, PricingResult } from "./types";

export function assertCustomerRateIsSafe(customerRate: Decimal, providerRate: Decimal): void {
  if (customerRate.lt(providerRate)) {
    throw new PricingError("UNSAFE_CUSTOMER_RATE", "customer rate cannot be better than provider rate");
  }
}

export function calculatePricing(input: PricingInput): PricingResult {
  if (input.sourceAmountMinor <= 0n) {
    throw new PricingError("INVALID_SOURCE_AMOUNT", "source amount must be greater than zero");
  }
  const sourcePrecision = input.sourcePrecision ?? 2;
  if (
    !Number.isInteger(sourcePrecision) ||
    sourcePrecision < 0 ||
    sourcePrecision > 8 ||
    !Number.isInteger(input.targetPrecision) ||
    input.targetPrecision < 0 ||
    input.targetPrecision > 8
  ) {
    throw new PricingError("INVALID_PRECISION", "source and target precision must be integers from 0 to 8");
  }
  if (input.explicitSourceFeeMinor < 0n || input.providerFeeEstimateMinor < 0n || (input.payoutFeeEstimateMinor ?? 0n) < 0n) {
    throw new PricingError("INVALID_FEE", "fees cannot be negative");
  }

  const providerRate = parseDecimal(input.providerRate, "provider rate");
  const configuredFixedSpread = parseDecimal(input.fixedSpread, "fixed spread");
  const configuredPercentageSpread = parseDecimal(input.percentageSpread, "percentage spread");
  if (providerRate.lte(0)) throw new PricingError("INVALID_PROVIDER_RATE", "provider rate must be greater than zero");
  if (configuredFixedSpread.lt(0) || configuredPercentageSpread.lt(0)) {
    throw new PricingError("INVALID_SPREAD", "spreads cannot be negative");
  }

  const fixedSpread = input.spreadMode === "PERCENTAGE" ? new Decimal(0) : configuredFixedSpread;
  const percentageSpread = input.spreadMode === "FIXED" ? new Decimal(0) : configuredPercentageSpread;
  const customerRate = providerRate.mul(percentageSpread.plus(1)).plus(fixedSpread);
  assertCustomerRateIsSafe(customerRate, providerRate);

  const netSourceAmountMinor = input.sourceAmountMinor - input.explicitSourceFeeMinor;
  if (netSourceAmountMinor <= 0n) {
    throw new PricingError("INVALID_SOURCE_AMOUNT", "source amount must exceed the explicit source fee");
  }

  const rawTargetAmount = minorToDecimal(netSourceAmountMinor, sourcePrecision).div(customerRate);
  const targetAmountMinor = decimalToMinorUnitsFloor(rawTargetAmount, input.targetPrecision);
  const targetAmount = minorToDecimal(targetAmountMinor, input.targetPrecision);
  const providerSourceCostMinor = targetAmount.mul(providerRate).mul(new Decimal(10).pow(sourcePrecision)).ceil();
  const payoutFeeEstimateMinor = input.payoutFeeEstimateMinor ?? 0n;
  const expectedMarginMinorDecimal = new Decimal(input.sourceAmountMinor.toString())
    .minus(providerSourceCostMinor)
    .minus(input.providerFeeEstimateMinor.toString())
    .minus(payoutFeeEstimateMinor.toString());

  if (expectedMarginMinorDecimal.lt(0)) {
    throw new PricingError("NEGATIVE_MARGIN", "pricing would produce a negative expected margin");
  }

  return {
    sourceAmountMinor: input.sourceAmountMinor,
    netSourceAmountMinor,
    providerRate: providerRate.toString(),
    customerRate: customerRate.toString(),
    targetAmountMinor,
    fixedSpreadSnapshot: fixedSpread.toString(),
    percentageSpreadSnapshot: percentageSpread.toString(),
    explicitFeeMinor: input.explicitSourceFeeMinor,
    providerFeeEstimateMinor: input.providerFeeEstimateMinor,
    payoutFeeEstimateMinor,
    expectedMarginMinor: BigInt(expectedMarginMinorDecimal.toFixed(0)),
    sourcePrecision,
    targetPrecision: input.targetPrecision,
  };
}
