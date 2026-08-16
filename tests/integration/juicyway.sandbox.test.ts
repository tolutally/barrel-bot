import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { JuicywayProvider, ProviderRegistry } from "@barrel/providers";
import { PrismaCorridorConfigRepository, PrismaQuoteSnapshotRepository, QuoteService } from "@barrel/quotes";

const configured = Boolean(process.env.JUICYWAY_BASE_URL && process.env.JUICYWAY_API_KEY);
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!configured)("Juicyway production acceptance", () => {
  it.each([
    { sourceCurrency: "NGN", targetCurrency: "CAD", amountMinor: 200_000_000n, expectedSource: "₦2,000,000.00" },
    { sourceCurrency: "USD", targetCurrency: "USDT", amountMinor: 10_000n, expectedSource: "$100.00" },
  ])("fetches, normalizes, prices, and persists a customer-safe $sourceCurrency to $targetCurrency quote", async ({ sourceCurrency, targetCurrency, amountMinor, expectedSource }) => {
    const provider = new JuicywayProvider({
      baseUrl: process.env.JUICYWAY_BASE_URL!,
      apiKey: process.env.JUICYWAY_API_KEY!,
      quotePath: process.env.JUICYWAY_QUOTE_PATH ?? "/exchange/quote",
    });
    const service = new QuoteService(
      new PrismaCorridorConfigRepository(prisma),
      new ProviderRegistry({ JUICYWAY: provider }),
      new PrismaQuoteSnapshotRepository(prisma, () => `PROD-ACCEPTANCE-Q-${randomUUID()}`),
    );

    const customerQuote = await service.createIndicativeQuote({
      sourceCurrency,
      targetCurrency,
      sourceAmountMinor: amountMinor,
    });
    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: customerQuote.id } });
    const rawProviderResponse = stored.rawProviderResponse as {
      data?: { id?: string; rate?: string | number; symbol?: string };
    };
    expect(stored.provider).toBe("JUICYWAY");
    expect(stored.providerQuoteId).toBeTruthy();
    expect(rawProviderResponse.data?.id).toBe(stored.providerQuoteId);
    expect(rawProviderResponse.data?.rate).toBeDefined();
    expect(rawProviderResponse.data?.symbol).toMatch(/^[A-Z0-9]+-[A-Z0-9]+$/);
    expect(stored.providerRate.gt(0)).toBe(true);
    expect(stored.customerRate.gt(stored.providerRate)).toBe(true);
    expect(stored.fixedSpreadSnapshot.gt(0) || stored.percentageSpreadSnapshot.gt(0)).toBe(true);
    expect(stored.sourceAmountMinor).toBe(amountMinor);
    expect(stored.targetAmountMinor).toBeGreaterThan(0n);
    expect(customerQuote).toMatchObject({
      id: stored.id,
      quoteReference: stored.quoteReference,
      sourceCurrency,
      targetCurrency,
      sourceAmount: expectedSource,
    });
    expect(customerQuote).not.toHaveProperty("provider");
    expect(customerQuote).not.toHaveProperty("providerRate");
    expect(customerQuote).not.toHaveProperty("rawProviderResponse");

    console.info(
      "PHASE_2_PRODUCTION_ACCEPTANCE",
      JSON.stringify({
        quoteReference: stored.quoteReference,
        requestedDirection: `${stored.sourceCurrency} -> ${stored.targetCurrency}`,
        customerSourceAmount: customerQuote.sourceAmount,
        customerTargetAmount: customerQuote.targetAmount,
        persistedInSupabase: true,
      }),
    );
  });
});
