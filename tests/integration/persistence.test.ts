import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, CustomerType, ChannelType } from "@barrel/db";
import { calculatePricing, type PricingInput } from "@barrel/pricing";

const createdCustomerIds: string[] = [];
const createdQuoteIds: string[] = [];
const createdTradeIntentIds: string[] = [];

afterAll(async () => {
  await prisma.tradeIntent.deleteMany({ where: { id: { in: createdTradeIntentIds } } });
  await prisma.quote.deleteMany({ where: { id: { in: createdQuoteIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await prisma.$disconnect();
});

describe("Customer/Quote/TradeIntent persistence", () => {
  it("round-trips a Customer -> Quote -> TradeIntent chain", async () => {
    const customer = await prisma.customer.create({
      data: {
        customerNumber: `TEST-${randomUUID()}`,
        customerType: CustomerType.INDIVIDUAL,
      },
    });
    createdCustomerIds.push(customer.id);

    const quote = await prisma.quote.create({
      data: {
        quoteReference: `Q-${randomUUID()}`,
        customerId: customer.id,
        provider: "juicyway",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
        sourceAmountMinor: 200_000_00n,
        targetAmountMinor: 19_047_6n,
        providerRate: "1030",
        customerRate: "1050",
        fixedSpreadSnapshot: "20",
        percentageSpreadSnapshot: "0",
        explicitFeeMinor: 0n,
        providerFeeEstimateMinor: 0n,
        expectedMarginMinor: 380_972n,
        providerExpiresAt: new Date(Date.now() + 30_000),
        customerQuoteExpiresAt: new Date(Date.now() + 900_000),
      },
    });
    createdQuoteIds.push(quote.id);

    const tradeIntent = await prisma.tradeIntent.create({
      data: {
        publicReference: `BRL-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        tradeIntentReference: `TI-${randomUUID()}`,
        quoteId: quote.id,
        customerId: customer.id,
        customerType: CustomerType.INDIVIDUAL,
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
        sourceAmountMinor: quote.sourceAmountMinor,
        indicativeTargetAmountMinor: quote.targetAmountMinor,
        originatingChannel: ChannelType.WHATSAPP,
      },
    });
    createdTradeIntentIds.push(tradeIntent.id);

    const persistedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const persistedQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    const persistedTradeIntent = await prisma.tradeIntent.findUniqueOrThrow({
      where: { id: tradeIntent.id },
      include: { quote: true, customer: true },
    });

    expect(persistedCustomer.id).toBe(customer.id);
    expect(persistedQuote.customerId).toBe(customer.id);
    expect(persistedTradeIntent.quote?.id).toBe(quote.id);
    expect(persistedTradeIntent.customer?.id).toBe(customer.id);
  });
});

describe("pricing result persistence", () => {
  it("persists a calculatePricing() result into a Quote row", async () => {
    const input: PricingInput = {
      sourceAmountMinor: 200_000_000n,
      providerRate: "1030",
      spreadMode: "FIXED",
      fixedSpread: "20",
      percentageSpread: "0",
      explicitSourceFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      targetPrecision: 2,
    };
    const result = calculatePricing(input);

    const quote = await prisma.quote.create({
      data: {
        quoteReference: `Q-${randomUUID()}`,
        provider: "juicyway",
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
        sourceAmountMinor: result.sourceAmountMinor,
        targetAmountMinor: result.targetAmountMinor,
        providerRate: result.providerRate,
        customerRate: result.customerRate,
        fixedSpreadSnapshot: result.fixedSpreadSnapshot,
        percentageSpreadSnapshot: result.percentageSpreadSnapshot,
        explicitFeeMinor: result.explicitFeeMinor,
        providerFeeEstimateMinor: result.providerFeeEstimateMinor,
        payoutFeeEstimateMinor: result.payoutFeeEstimateMinor,
        expectedMarginMinor: result.expectedMarginMinor,
        providerExpiresAt: new Date(Date.now() + 30_000),
        customerQuoteExpiresAt: new Date(Date.now() + 900_000),
      },
    });
    createdQuoteIds.push(quote.id);

    const persisted = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });

    expect(persisted.sourceAmountMinor).toBe(result.sourceAmountMinor);
    expect(persisted.targetAmountMinor).toBe(result.targetAmountMinor);
    expect(persisted.providerRate.toString()).toBe(result.providerRate);
    expect(persisted.customerRate.toString()).toBe(result.customerRate);
    expect(persisted.expectedMarginMinor).toBe(result.expectedMarginMinor);
  });
});
