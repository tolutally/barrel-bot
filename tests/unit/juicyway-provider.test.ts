import { describe, expect, it, vi } from "vitest";
import { JuicywayProvider, JuicywayProviderError } from "@barrel/providers";

const quoteBody = {
  data: {
    id: "c65305fb-f1ad-753b-a3b0-3b4d87b3adac",
    locked: false,
    rate: 103000,
    symbol: "CAD-NGN",
    time_to_convert: 30,
    time_to_lock: 30,
    type: "sell",
  },
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("JuicywayProvider", () => {
  it("requests a generic unlocked quote and normalizes it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(quoteBody));
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" },
      { fetch: fetchMock, now: () => new Date("2026-08-10T00:00:00.000Z") },
    );

    const quote = await provider.getIndicativeQuote({
      sourceCurrency: "ngn",
      targetCurrency: "cad",
      sourceAmountMinor: 200_000_000n,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://api-sandbox.spendjuice.com/exchange/quote?source_currency=NGN&target_currency=CAD&lock=false",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe("test-secret");
    expect(quote).toMatchObject({
      provider: "JUICYWAY",
      providerQuoteId: "c65305fb-f1ad-753b-a3b0-3b4d87b3adac",
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      normalizedSourcePerTargetRate: "1030",
      rawRate: "103000",
      rawSymbol: "CAD-NGN",
      rawType: "sell",
      locked: false,
      expiresAt: new Date("2026-08-10T00:00:30.000Z"),
    });
  });

  it("normalizes an inverse provider symbol using requested currencies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ...quoteBody, data: { ...quoteBody.data, rate: "0.097087378640776699", symbol: "NGN-CAD" } }),
    );
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" },
      { fetch: fetchMock },
    );
    const quote = await provider.getIndicativeQuote({
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 1n,
    });
    expect(quote.normalizedSourcePerTargetRate).toBe("1030.0000000000000003");
  });

  it("decodes verified USD/USDT pair rates using provider minor units", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { ...quoteBody.data, rate: 100, symbol: "USD-USDT", type: "buy" },
    }));
    const provider = new JuicywayProvider({ baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" }, { fetch: fetchMock });
    const quote = await provider.getIndicativeQuote({ sourceCurrency: "USD", targetCurrency: "USDT", sourceAmountMinor: 10_000n });
    expect(quote.normalizedSourcePerTargetRate).toBe("1");
  });

  it("retries one HTTP 429 using Retry-After", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "limited" }, 429, { "retry-after": "1" }))
      .mockResolvedValueOnce(jsonResponse(quoteBody));
    const sleep = vi.fn(async () => undefined);
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" },
      { fetch: fetchMock, sleep },
    );
    await provider.getIndicativeQuote({ sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmountMinor: 1n });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("fails safely on a changed response schema", async () => {
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" },
      { fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { unexpected: true } })) },
    );
    await expect(
      provider.getIndicativeQuote({ sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmountMinor: 1n }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" } satisfies Partial<JuicywayProviderError>);
  });

  it("never accepts an insecure provider base URL", () => {
    expect(
      () => new JuicywayProvider({ baseUrl: "http://api.example.com", apiKey: "test-secret" }),
    ).toThrowError(JuicywayProviderError);
  });

  it("trims the raw API key before sending it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(quoteBody));
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "  test-secret  " },
      { fetch: fetchMock },
    );
    await provider.getIndicativeQuote({ sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmountMinor: 1n });
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get("authorization")).toBe("test-secret");
  });

  it("rejects a Bearer-prefixed API key", () => {
    expect(
      () =>
        new JuicywayProvider({
          baseUrl: "https://api-sandbox.spendjuice.com",
          apiKey: "Bearer test-secret",
        }),
    ).toThrowError(/without a Bearer prefix/);
  });

  it("reports rejected credentials as an authentication error", async () => {
    const provider = new JuicywayProvider(
      { baseUrl: "https://api-sandbox.spendjuice.com", apiKey: "test-secret" },
      { fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401)) },
    );
    await expect(
      provider.getIndicativeQuote({ sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmountMinor: 1n }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_ERROR",
      status: 401,
    } satisfies Partial<JuicywayProviderError>);
  });
});
