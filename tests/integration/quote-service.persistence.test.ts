import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { ProviderRegistry, type RateProvider } from "@barrel/providers";
import { PrismaCorridorConfigRepository, PrismaQuoteSnapshotRepository, QuoteService } from "@barrel/quotes";

const prisma = new PrismaClient();
let createdQuoteId: string | undefined;

afterAll(async () => {
  if (createdQuoteId) await prisma.quote.delete({ where: { id: createdQuoteId } });
  await prisma.$disconnect();
});

describe("QuoteService Supabase persistence", () => {
  it("runs provider -> pricing -> snapshot -> customer-safe quote end to end", async () => {
    const fixtureProvider: RateProvider = {
      getIndicativeQuote: async (request) => ({
        provider: "JUICYWAY",
        providerQuoteId: "fixture-provider-quote",
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        normalizedSourcePerTargetRate: "1030",
        rawRate: "1030",
        rawSymbol: "CAD-NGN",
        rawType: "buy",
        locked: false,
        expiresAt: new Date(Date.now() + 30_000),
        rawResponse: { fixture: true },
      }),
      healthCheck: async () => ({ ok: true }),
    };
    const service = new QuoteService(
      new PrismaCorridorConfigRepository(prisma),
      new ProviderRegistry({ JUICYWAY: fixtureProvider }),
      new PrismaQuoteSnapshotRepository(prisma, () => `FIXTURE-Q-${Date.now()}`),
    );

    const quote = await service.createIndicativeQuote({
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
    });
    createdQuoteId = quote.id;
    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });

    expect(stored.providerRate.toString()).toBe("1030");
    expect(stored.customerRate.toString()).toBe("1045.45");
    expect(stored.targetAmountMinor).toBe(191_305n);
    expect(quote).toMatchObject({
      sourceAmount: "₦2,000,000.00",
      targetAmount: "C$1,913.05",
      customerRate: "1045.45",
    });
    expect(quote).not.toHaveProperty("providerRate");
  });
});
