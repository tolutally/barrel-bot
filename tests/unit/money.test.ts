import { describe, expect, it } from "vitest";
import {
  displayToMinorUnits,
  floorToPrecision,
  formatCurrencyMinor,
  formatCAD,
  formatNGN,
  minorToDecimal,
} from "@barrel/pricing";
import { currencyCodeSchema } from "@barrel/shared";
import Decimal from "decimal.js";

describe("money utilities", () => {
  it("accepts ISO fiat and supported stablecoin currency codes", () => {
    expect(currencyCodeSchema.parse("cad")).toBe("CAD");
    expect(currencyCodeSchema.parse("usdt")).toBe("USDT");
  });

  it("converts between display amounts and minor units exactly", () => {
    expect(displayToMinorUnits("2000000.25")).toBe(200_000_025n);
    expect(minorToDecimal(200_000_025n).toString()).toBe("2000000.25");
  });

  it("rejects display amounts with excess minor-unit precision", () => {
    expect(() => displayToMinorUnits("1.001")).toThrow("more than 2 decimal places");
  });

  it("floors rather than ordinarily rounding", () => {
    expect(floorToPrecision(new Decimal("1904.769"), 2).toString()).toBe("1904.76");
  });

  it("formats NGN and CAD without converting bigint values to floating point", () => {
    expect(formatNGN(200_000_000n)).toBe("₦2,000,000.00");
    expect(formatCAD(190_476n)).toBe("C$1,904.76");
  });

  it("formats configured currencies without source/target assumptions", () => {
    expect(formatCurrencyMinor(123_45n, "USD")).toBe("$123.45");
    expect(formatCurrencyMinor(123_45n, "USDT")).toBe("USDT 123.45");
  });
});
