import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InMemoryRateLimiter, parsePublicWebOrigins, PublicApiError, PublicApiService, publicCorsHeaders, publicPreflightResponse } from "@barrel/public-api";

function serviceHarness() {
  const corridor = {
    sourceCurrency: "USD", targetCurrency: "CAD", enabled: true,
    minSourceAmountMinor: 10_000n, maxSourceAmountMinor: 1_000_000n,
  };
  const prisma = {
    corridorConfig: {
      findMany: vi.fn(async () => [corridor]),
      findUnique: vi.fn(async () => corridor),
    },
  } as unknown as PrismaClient;
  const quotes = {
    createIndicativeQuote: vi.fn(async () => ({
      id: "quote-public-1", quoteReference: "BARREL-Q-PUBLIC-1",
      sourceCurrency: "USD", targetCurrency: "CAD",
      sourceAmount: "$2,000.00", targetAmount: "C$1,900.00",
      customerRate: "1.0526315789", customerQuoteExpiresAt: "2026-08-12T20:25:00.000Z",
      disclaimer: "Final rate is confirmed by our trading desk before your trade is accepted.",
    })),
  };
  const intent = {
    id: "intent-web-1", publicReference: "BRL-WEB12345", tradeIntentReference: "BARREL-TI-WEB-1", quoteId: "quote-public-1",
    customerId: null, customerType: null, sourceCurrency: "USD", targetCurrency: "CAD",
    sourceAmountMinor: 200_000n, indicativeTargetAmountMinor: 190_000n,
    purposeOfPayment: "SUPPLIER_VENDOR" as const, purposeOfPaymentDetail: null,
    contactWhatsAppNumber: "+14035550101", contactName: null,
    status: "READY_FOR_HANDOFF", originatingChannel: "WEB" as const,
  };
  const tradeIntents = {
    createFromQuote: vi.fn(), setPaymentPurpose: vi.fn(), createWebsiteRequest: vi.fn(async () => intent),
  };
  const handoffs = { requestHumanHandoff: vi.fn(async () => ({ publicReference: intent.publicReference, tradeRequestReference: intent.tradeIntentReference })) };
  const notifications = { dispatchTradeIntentNotifications: vi.fn(async () => ({ tradeIntentId: intent.id, sentCount: 1, failedCount: 0, skippedCount: 0 })) };
  return { api: new PublicApiService(prisma, quotes as never, tradeIntents as never, handoffs as never, notifications), prisma, quotes, tradeIntents, handoffs, notifications };
}

describe("website public API contracts", () => {
  it("returns only enabled directional customer-safe corridor fields", async () => {
    const h = serviceHarness();
    const result = await h.api.listCorridors();
    expect(result).toEqual([{
      sourceCurrency: "USD", targetCurrency: "CAD", sourceLabel: "US Dollar", targetLabel: "Canadian Dollar",
      minSourceAmount: "100.00", maxSourceAmount: "10000.00",
    }]);
    expect(JSON.stringify(result)).not.toMatch(/provider|spread|margin|fee/i);
  });

  it("returns an anonymous indicative quote with a 15-minute request timestamp and no provider leakage", async () => {
    const h = serviceHarness();
    const quote = await h.api.createQuote({ sourceCurrency: "USD", targetCurrency: "CAD", sourceAmount: "2000" });
    expect(quote).toMatchObject({ id: "quote-public-1", indicative: true, requestExpiresAt: "2026-08-12T20:25:00.000Z" });
    expect(JSON.stringify(quote)).not.toMatch(/Juicyway|providerRate|providerQuoteId|providerExpiresAt|spread|margin|fee/i);
    expect(h.quotes.createIndicativeQuote).toHaveBeenCalledWith({ sourceCurrency: "USD", targetCurrency: "CAD", sourceAmount: "2000", sourceAmountMinor: 200_000n });
  });

  it("rejects limits before calling QuoteService/provider", async () => {
    const h = serviceHarness();
    await expect(h.api.createQuote({ sourceCurrency: "USD", targetCurrency: "CAD", sourceAmount: "1" })).rejects.toMatchObject({ code: "AMOUNT_BELOW_MINIMUM" });
    await expect(h.api.createQuote({ sourceCurrency: "USD", targetCurrency: "CAD", sourceAmount: "20000" })).rejects.toMatchObject({ code: "AMOUNT_ABOVE_MAXIMUM" });
    expect(h.quotes.createIndicativeQuote).not.toHaveBeenCalled();
  });

  it("creates a WEB handoff with normalized contact and a customer-safe response", async () => {
    const h = serviceHarness();
    const result = await h.api.createTradeRequest({
      quoteId: "quote-public-1", purposeOfPayment: "SUPPLIER_VENDOR", whatsappNumber: "+1 (403) 555-0101",
    }, "website-request-key-123456789");
    expect(h.tradeIntents.createWebsiteRequest).toHaveBeenCalledWith(expect.objectContaining({ whatsappNumber: "+14035550101", idempotencyKey: "website-request-key-123456789" }));
    expect(h.handoffs.requestHumanHandoff).toHaveBeenCalledWith({ tradeIntentId: "intent-web-1", originatingChannel: "WEB" });
    expect(result).toEqual(expect.objectContaining({ reference: "BRL-WEB12345", status: "RECEIVED" }));
    expect(JSON.stringify(result)).not.toMatch(/admin|provider|notification|margin/i);
  });
});

describe("public HTTP boundary", () => {
  it("allows only configured CORS origins and handles preflight", () => {
    const allowed = parsePublicWebOrigins("http://localhost:3000,https://www.example.com");
    expect(publicCorsHeaders("https://www.example.com", allowed).get("access-control-allow-origin")).toBe("https://www.example.com");
    expect(() => publicCorsHeaders("https://evil.example", allowed)).toThrowError(PublicApiError);
    const response = publicPreflightResponse(new Request("https://api.example.com", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }), ["POST"], allowed);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
  });

  it("returns RATE_LIMITED at the configured boundary", () => {
    const limiter = new InMemoryRateLimiter(1, 60_000, () => 1000);
    limiter.check("client");
    expect(() => limiter.check("client")).toThrowError(expect.objectContaining({ code: "RATE_LIMITED" }));
  });
});
