import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { normalizeToSourcePerTarget, RateNormalizationError } from "@barrel/providers";

describe("normalizeToSourcePerTarget", () => {
  it("normalizes a direct NGN to CAD provider pair", () => {
    expect(
      normalizeToSourcePerTarget({
        rawRate: "1030",
        rawBase: "CAD",
        rawQuote: "NGN",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
      }),
    ).toBe("1030");
  });

  it("inverts an inverse NGN to CAD provider pair", () => {
    expect(
      normalizeToSourcePerTarget({
        rawRate: "0.0009708737864077669902912621359223301",
        rawBase: "NGN",
        rawQuote: "CAD",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
      }),
    ).toBe("1030");
  });

  it("uses the same algorithm for the reversed CAD to NGN direction", () => {
    const normalized = normalizeToSourcePerTarget({
        rawRate: "1050",
        rawBase: "CAD",
        rawQuote: "NGN",
        sourceCurrency: "CAD",
        targetCurrency: "NGN",
      });
    expect(new Decimal(normalized).minus(new Decimal(1).div(1050)).abs().lt("1e-22")).toBe(true);
  });

  it("has no NGN-specific assumption for a synthetic USD to CAD request", () => {
    const normalized = normalizeToSourcePerTarget({
        rawRate: "1.36",
        rawBase: "USD",
        rawQuote: "CAD",
        sourceCurrency: "USD",
        targetCurrency: "CAD",
      });
    expect(new Decimal(normalized).minus(new Decimal(1).div("1.36")).abs().lt("1e-19")).toBe(true);
  });

  it("fails closed when the provider pair does not match the request", () => {
    expect(() =>
      normalizeToSourcePerTarget({
        rawRate: "1",
        rawBase: "EUR",
        rawQuote: "USD",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
      }),
    ).toThrow(RateNormalizationError);
  });

  it("returns a typed failure for a malformed provider rate", () => {
    expect(() =>
      normalizeToSourcePerTarget({
        rawRate: "not-a-rate",
        rawBase: "CAD",
        rawQuote: "NGN",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
      }),
    ).toThrow(RateNormalizationError);
  });
});
