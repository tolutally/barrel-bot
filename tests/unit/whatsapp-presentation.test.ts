import { describe, expect, it } from "vitest";
import {
  currencyOptionLabel,
  formatCustomerRate,
  parseCurrencySelection,
  parsePurposeSelection,
  purposeLabel,
} from "@barrel/whatsapp";

describe("WhatsApp customer presentation", () => {
  it("uses friendly currency names while accepting codes or names", () => {
    expect(currencyOptionLabel("NGN")).toBe("NGN — Nigerian Naira");
    expect(parseCurrencySelection("Canadian Dollar", ["NGN", "CAD"])).toBe("CAD");
    expect(parseCurrencySelection("cad", ["NGN", "CAD"])).toBe("CAD");
  });

  it("renders rates in the natural customer orientation", () => {
    expect(formatCustomerRate("NGN", "CAD", "1045.45")).toBe("C$1 = ₦1,045.45");
    expect(formatCustomerRate("CAD", "USD", "1.36986")).toBe("US$1 = C$1.37");
    expect(formatCustomerRate("NGN", "USD", "1520")).toBe("US$1 = ₦1,520");
    expect(formatCustomerRate("USD", "CAD", "0.73")).toBe("C$1 = US$0.73");
    expect(formatCustomerRate("CAD", "USDT", "1.37")).toBe("1 USDT = C$1.37");
    expect(formatCustomerRate("USDT", "CAD", "0.7299")).toBe("C$1 = 0.73 USDT");
  });

  it("keeps payment-purpose enum identifiers out of customer labels", () => {
    expect(purposeLabel("SUPPLIER_VENDOR")).toBe("Supplier / vendor");
    expect(parsePurposeSelection("Supplier / vendor")).toBe("SUPPLIER_VENDOR");
    expect(purposeLabel("SERVICES_CONTRACTOR")).not.toContain("_");
  });
});
