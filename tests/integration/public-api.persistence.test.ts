import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PublicApiService } from "@barrel/public-api";
import { PrismaTradeIntentService } from "@barrel/trade-intents";
import { PrismaTradeHandoffService } from "@barrel/handoffs";

const prisma = new PrismaClient();
const quoteIds: string[] = [];
const intentIds: string[] = [];

afterAll(async () => {
  if (intentIds.length) await prisma.adminNotification.deleteMany({ where: { tradeIntentId: { in: intentIds } } });
  if (intentIds.length) await prisma.tradeIntent.deleteMany({ where: { id: { in: intentIds } } });
  if (quoteIds.length) await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.$disconnect();
});

async function quoteFixture(expiresAt = new Date(Date.now() + 900_000)) {
  const suffix = randomUUID();
  const quote = await prisma.quote.create({
    data: {
      quoteReference: `WEB-Q-${suffix}`,
      provider: "JUICYWAY",
      providerQuoteId: `provider-${suffix}`,
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
      targetAmountMinor: 190_476n,
      providerRate: "1030",
      customerRate: "1050",
      fixedSpreadSnapshot: "20",
      percentageSpreadSnapshot: "0",
      explicitFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      payoutFeeEstimateMinor: 0n,
      expectedMarginMinor: 3_809_600n,
      providerExpiresAt: new Date(Date.now() - 60_000),
      customerQuoteExpiresAt: expiresAt,
    },
  });
  quoteIds.push(quote.id);
  return quote;
}

describe("website public trade-request persistence", () => {
  it("creates one WEB TradeIntent and one outbox alert across an idempotent retry", async () => {
    const quote = await quoteFixture();
    const notifications = {
      dispatchTradeIntentNotifications: async (tradeIntentId: string) => ({ tradeIntentId, sentCount: 0, failedCount: 0, skippedCount: 1 }),
    };
    const service = new PublicApiService(
      prisma,
      {} as never,
      new PrismaTradeIntentService(prisma),
      new PrismaTradeHandoffService(prisma, ["+14035550101"]),
      notifications,
    );
    const request = {
      quoteId: quote.id,
      purposeOfPayment: "SUPPLIER_VENDOR",
      whatsappNumber: "+1 (587) 555-0101",
    };
    const key = `website-${randomUUID()}`;
    const customerCountBefore = await prisma.customer.count();
    const first = await service.createTradeRequest(request, key);
    const second = await service.createTradeRequest(request, key);

    expect(second).toEqual(first);
    const intents = await prisma.tradeIntent.findMany({ where: { idempotencyKey: key } });
    intentIds.push(...intents.map((intent) => intent.id));
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      originatingChannel: "WEB",
      contactWhatsAppNumber: "+15875550101",
      purposeOfPayment: "SUPPLIER_VENDOR",
      customerId: null,
      handoffState: "ALERT_PENDING",
    });
    expect(await prisma.adminNotification.count({ where: { tradeIntentId: intents[0]!.id } })).toBe(1);
    expect(await prisma.trade.count({ where: { tradeIntentId: intents[0]!.id } })).toBe(0);
    expect(await prisma.customer.count()).toBe(customerCountBefore);
  });

  it("rejects an expired website quote without creating intent or outbox", async () => {
    const quote = await quoteFixture(new Date(Date.now() - 1_000));
    const key = `website-expired-${randomUUID()}`;
    const service = new PublicApiService(
      prisma, {} as never, new PrismaTradeIntentService(prisma),
      new PrismaTradeHandoffService(prisma, ["+14035550101"]),
      { dispatchTradeIntentNotifications: async (tradeIntentId: string) => ({ tradeIntentId, sentCount: 0, failedCount: 0, skippedCount: 0 }) },
    );
    await expect(service.createTradeRequest({
      quoteId: quote.id, purposeOfPayment: "INVESTMENT", whatsappNumber: "+15875550101",
    }, key)).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(await prisma.tradeIntent.count({ where: { idempotencyKey: key } })).toBe(0);
  });
});
