import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  assertCustomerRateIsSafe,
  calculatePricing,
  PricingError,
  type PricingInput,
} from "@barrel/pricing";

const baseInput: PricingInput = {
  sourceAmountMinor: 200_000_000n,
  providerRate: "1030",
  spreadMode: "FIXED",
  fixedSpread: "20",
  percentageSpread: "0",
  explicitSourceFeeMinor: 0n,
  providerFeeEstimateMinor: 0n,
  targetPrecision: 2,
};

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("expected pricing to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PricingError);
    expect((error as PricingError).code).toBe(code);
  }
}

describe("calculatePricing", () => {
  it("calculates the fixed-spread acceptance example", () => {
    const result = calculatePricing(baseInput);
    expect(result.customerRate).toBe("1050");
    expect(result.targetAmountMinor).toBe(190_476n);
    expect(result.expectedMarginMinor).toBe(3_809_720n);
  });

  it("calculates a percentage spread", () => {
    const result = calculatePricing({
      ...baseInput,
      spreadMode: "PERCENTAGE",
      fixedSpread: "0",
      percentageSpread: "0.02",
    });
    expect(result.customerRate).toBe("1050.6");
    expect(result.targetAmountMinor).toBe(190_367n);
  });

  it("calculates a zero spread", () => {
    const result = calculatePricing({
      ...baseInput,
      sourceAmountMinor: 1_000_000n,
      fixedSpread: "0",
    });
    expect(result.customerRate).toBe("1030");
    expect(result.targetAmountMinor).toBe(970n);
  });

  it("calculates a hybrid spread", () => {
    const result = calculatePricing({ ...baseInput, spreadMode: "HYBRID", percentageSpread: "0.01" });
    expect(result.customerRate).toBe("1060.3");
    expect(result.targetAmountMinor).toBe(188_625n);
  });

  it("preserves decimal rates and floors target output", () => {
    const result = calculatePricing({ ...baseInput, providerRate: "1030.123456", fixedSpread: "20.876544" });
    expect(result.customerRate).toBe("1051");
    expect(result.targetAmountMinor).toBe(190_294n);
  });

  it("supports very large source amounts using bigint and Decimal", () => {
    const result = calculatePricing({ ...baseInput, sourceAmountMinor: 9_000_000_000_000_000_000n });
    expect(result.targetAmountMinor).toBe(8_571_428_571_428_571n);
  });

  it.each([0n, -1n])("rejects invalid source amount %s", (sourceAmountMinor) => {
    expectCode(() => calculatePricing({ ...baseInput, sourceAmountMinor }), "INVALID_SOURCE_AMOUNT");
  });

  it("rejects a negative spread", () => {
    expectCode(() => calculatePricing({ ...baseInput, fixedSpread: "-1" }), "INVALID_SPREAD");
  });

  it.each(["0", "-1", "not-a-rate"])("rejects invalid provider rate %s", (providerRate) => {
    expectCode(() => calculatePricing({ ...baseInput, providerRate }), "INVALID_PROVIDER_RATE");
  });

  it("rejects a customer rate below its provider rate", () => {
    expectCode(() => assertCustomerRateIsSafe(new Decimal("1029"), new Decimal("1030")), "UNSAFE_CUSTOMER_RATE");
  });

  it("fails closed when provider fees make margin negative", () => {
    expectCode(
      () => calculatePricing({ ...baseInput, providerFeeEstimateMinor: 4_000_000n }),
      "NEGATIVE_MARGIN",
    );
  });

  it("deducts an explicit source fee before calculating recipient amount", () => {
    const result = calculatePricing({ ...baseInput, explicitSourceFeeMinor: 10_000n });
    expect(result.netSourceAmountMinor).toBe(199_990_000n);
    expect(result.targetAmountMinor).toBe(190_466n);
  });

  it("subtracts provider and payout fees from expected margin", () => {
    const result = calculatePricing({
      ...baseInput,
      providerFeeEstimateMinor: 1_000n,
      payoutFeeEstimateMinor: 2_000n,
    });
    expect(result.expectedMarginMinor).toBe(3_806_720n);
  });

  it("returns the immutable configuration values needed for a quote snapshot", () => {
    const result = calculatePricing({ ...baseInput, spreadMode: "HYBRID", percentageSpread: "0.0125" });
    expect(result).toMatchObject({
      providerRate: "1030",
      customerRate: "1062.875",
      fixedSpreadSnapshot: "20",
      percentageSpreadSnapshot: "0.0125",
      explicitFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      payoutFeeEstimateMinor: 0n,
    });
  });
});
