import { describe, expect, it } from "vitest";
import { generateTradePublicReference } from "@barrel/trade-intents";

describe("customer-facing trade references", () => {
  it("uses a short nonsequential, unambiguous reference", () => {
    const first = generateTradePublicReference();
    const second = generateTradePublicReference();
    expect(first).toMatch(/^BRL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(second).toMatch(/^BRL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(second).not.toBe(first);
  });
});
