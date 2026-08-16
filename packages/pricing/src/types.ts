export type SpreadMode = "FIXED" | "PERCENTAGE" | "HYBRID";

export type PricingInput = {
  sourceAmountMinor: bigint;
  providerRate: string;
  spreadMode: SpreadMode;
  fixedSpread: string;
  percentageSpread: string;
  explicitSourceFeeMinor: bigint;
  providerFeeEstimateMinor: bigint;
  payoutFeeEstimateMinor?: bigint;
  sourcePrecision?: number;
  targetPrecision: number;
};

export type PricingResult = {
  sourceAmountMinor: bigint;
  netSourceAmountMinor: bigint;
  providerRate: string;
  customerRate: string;
  targetAmountMinor: bigint;
  fixedSpreadSnapshot: string;
  percentageSpreadSnapshot: string;
  explicitFeeMinor: bigint;
  providerFeeEstimateMinor: bigint;
  payoutFeeEstimateMinor: bigint;
  expectedMarginMinor: bigint;
  sourcePrecision: number;
  targetPrecision: number;
};
