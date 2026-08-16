import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaTradeIntentService } from "@barrel/trade-intents";

const prisma = new PrismaClient();
const suffix = randomUUID();
let channelId: string | undefined;
let conversationId: string | undefined;
let quoteId: string | undefined;
let intentId: string | undefined;

afterAll(async () => {
  if (conversationId) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { latestQuoteId: null, latestTradeIntentId: null },
    }).catch(() => undefined);
  }
  if (intentId) await prisma.tradeIntent.delete({ where: { id: intentId } }).catch(() => undefined);
  if (quoteId) await prisma.quote.delete({ where: { id: quoteId } }).catch(() => undefined);
  if (conversationId) await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => undefined);
  if (channelId) await prisma.customerChannel.delete({ where: { id: channelId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("WhatsApp TradeIntent persistence", () => {
  it("creates exactly one anonymous intent, stores payment purpose, and creates no Trade", async () => {
    const customerCountBefore = await prisma.customer.count();
    const channel = await prisma.customerChannel.create({
      data: { channelType: "WHATSAPP", externalIdentifier: `test-${suffix}` },
    });
    channelId = channel.id;
    const conversation = await prisma.conversation.create({ data: { customerChannelId: channel.id } });
    conversationId = conversation.id;
    const quote = await prisma.quote.create({
      data: {
        quoteReference: `TEST-Q-${suffix}`,
        conversationId: conversation.id,
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
        providerExpiresAt: new Date(Date.now() + 30_000),
        customerQuoteExpiresAt: new Date(Date.now() + 900_000),
      },
    });
    quoteId = quote.id;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { latestQuoteId: quote.id, state: "QUOTE_PRESENTED" },
    });

    const service = new PrismaTradeIntentService(prisma);
    const first = await service.createFromQuote(conversation.id, quote.id);
    intentId = first.id;
    const duplicate = await service.createFromQuote(conversation.id, quote.id);
    expect(duplicate.id).toBe(first.id);

    const stored = await prisma.tradeIntent.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored).toMatchObject({
      quoteId: quote.id,
      customerId: null,
      customerType: null,
      conversationId: conversation.id,
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
      indicativeTargetAmountMinor: 190_476n,
      originatingChannel: "WHATSAPP",
      purposeOfPayment: null,
      status: "PAYMENT_PURPOSE_REQUIRED",
    });
    expect(await prisma.tradeIntent.count({ where: { conversationId: conversation.id, quoteId: quote.id } })).toBe(1);
    expect(await prisma.trade.count({ where: { tradeIntentId: first.id } })).toBe(0);
    expect(await prisma.customer.count()).toBe(customerCountBefore);

    const selected = await service.setPaymentPurpose(conversation.id, first.id, "SUPPLIER_VENDOR");
    expect(selected.purposeOfPayment).toBe("SUPPLIER_VENDOR");
    expect(selected.status).toBe("READY_FOR_HANDOFF");
    const finalConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(finalConversation.state).toBe("TRADE_REQUEST_READY");
  });
});
