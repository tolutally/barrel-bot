import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculatePricing } from "@barrel/pricing";

const prisma = new PrismaClient();
const runId = randomUUID();
const refs = {
  quote: `SMOKE-QUOTE-${runId}`,
  intent: `SMOKE-INTENT-${runId}`,
  business: `SMOKE-BUS-${runId}`,
  individual: `SMOKE-IND-${runId}`,
  businessCase: `SMOKE-KYB-${runId}`,
  individualCase: `SMOKE-KYC-${runId}`,
  webhookExternalId: `SMOKE-WEBHOOK-${runId}`,
};

let quoteId: string | undefined;
let businessCustomerId: string | undefined;
let individualCustomerId: string | undefined;

function expectPrismaCode(error: unknown, expectedCode: string): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(expectedCode);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await prisma.corridorConfig.updateMany({
    where: { sourceCurrency: "NGN", targetCurrency: "CAD" },
    data: { spreadMode: "PERCENTAGE", fixedSpread: "0", percentageSpread: "0.015" },
  });
  await prisma.tradeIntent.deleteMany({ where: { tradeIntentReference: refs.intent } });
  await prisma.quote.deleteMany({ where: { quoteReference: refs.quote } });
  await prisma.complianceCase.deleteMany({
    where: { caseReference: { in: [refs.businessCase, refs.individualCase] } },
  });
  if (businessCustomerId || individualCustomerId) {
    const customerIds = [businessCustomerId, individualCustomerId].filter((id): id is string => Boolean(id));
    await prisma.businessProfile.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.individualProfile.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  await prisma.webhookEvent.deleteMany({ where: { externalId: refs.webhookExternalId } });
  await prisma.$disconnect();
});

describe.sequential("Supabase PostgreSQL persistence", () => {
  it("contains the configured NGN to CAD corridor at the common percentage spread", async () => {
    const corridors = await prisma.corridorConfig.findMany({
      where: { sourceCurrency: "NGN", targetCurrency: "CAD" },
    });
    expect(corridors).toHaveLength(1);
    expect(corridors[0]).toMatchObject({
      provider: "JUICYWAY",
      enabled: true,
      spreadMode: "PERCENTAGE",
      explicitSourceFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      payoutFeeEstimateMinor: 0n,
      quoteTtlSeconds: 30,
      targetPrecision: 2,
    });
    expect(corridors[0]?.fixedSpread.toString()).toBe("0");
    expect(corridors[0]?.percentageSpread.toString()).toBe("0.015");
  });

  it("persists and reproduces an anonymous pricing snapshot", async () => {
    const result = calculatePricing({
      sourceAmountMinor: 200_000_000n,
      providerRate: "1030",
      spreadMode: "FIXED",
      fixedSpread: "20",
      percentageSpread: "0",
      explicitSourceFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      payoutFeeEstimateMinor: 0n,
      targetPrecision: 2,
    });

    const created = await prisma.quote.create({
      data: {
        quoteReference: refs.quote,
        customerId: null,
        provider: "SMOKE_TEST",
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
    quoteId = created.id;

    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.customerId).toBeNull();
    expect(stored.providerRate.toString()).toBe("1030");
    expect(stored.customerRate.toString()).toBe("1050");
    expect(stored.fixedSpreadSnapshot.toString()).toBe("20");
    expect(stored.percentageSpreadSnapshot.toString()).toBe("0");
    expect(stored.sourceAmountMinor).toBe(200_000_000n);
    expect(stored.targetAmountMinor).toBe(190_476n);
    expect(stored.expectedMarginMinor).toBe(3_809_720n);
  });

  it("persists an early anonymous TradeIntent", async () => {
    const intent = await prisma.tradeIntent.create({
      data: {
        publicReference: `BRL-${refs.intent.slice(-8).toUpperCase()}`,
        tradeIntentReference: refs.intent,
        quoteId: quoteId!,
        customerId: null,
        customerType: null,
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
        sourceAmountMinor: 200_000_000n,
        indicativeTargetAmountMinor: 190_476n,
        originatingChannel: "WHATSAPP",
      },
    });
    expect(intent.customerId).toBeNull();
    expect(intent.customerType).toBeNull();
  });

  it("persists BUSINESS and INDIVIDUAL profiles and compliance cases", async () => {
    const business = await prisma.customer.create({
      data: {
        customerNumber: refs.business,
        customerType: "BUSINESS",
        businessProfile: {
          create: {
            legalName: "Phase 1.5 Smoke Test Ltd.",
            entityType: "CORPORATION",
            jurisdiction: "CA",
            country: "CA",
          },
        },
        complianceCases: {
          create: { caseReference: refs.businessCase, caseType: "BUSINESS_KYB" },
        },
      },
      include: { businessProfile: true, complianceCases: true },
    });
    businessCustomerId = business.id;
    expect(business.businessProfile?.legalName).toBe("Phase 1.5 Smoke Test Ltd.");
    expect(business.complianceCases.map((item) => item.caseType)).toContain("BUSINESS_KYB");

    const individual = await prisma.customer.create({
      data: {
        customerNumber: refs.individual,
        customerType: "INDIVIDUAL",
        individualProfile: {
          create: { firstName: "Synthetic", lastName: "Customer", country: "CA" },
        },
        complianceCases: {
          create: { caseReference: refs.individualCase, caseType: "INDIVIDUAL_KYC" },
        },
      },
      include: { individualProfile: true, complianceCases: true },
    });
    individualCustomerId = individual.id;
    expect(individual.individualProfile?.firstName).toBe("Synthetic");
    expect(individual.complianceCases.map((item) => item.caseType)).toContain("INDIVIDUAL_KYC");
  });

  it("keeps an existing Quote snapshot unchanged when corridor pricing changes", async () => {
    await prisma.corridorConfig.update({
      where: { sourceCurrency_targetCurrency: { sourceCurrency: "NGN", targetCurrency: "CAD" } },
      data: { fixedSpread: "25" },
    });
    const [storedQuote, currentCorridor] = await Promise.all([
      prisma.quote.findUniqueOrThrow({ where: { id: quoteId! } }),
      prisma.corridorConfig.findUniqueOrThrow({
        where: { sourceCurrency_targetCurrency: { sourceCurrency: "NGN", targetCurrency: "CAD" } },
      }),
    ]);
    expect(storedQuote.fixedSpreadSnapshot.toString()).toBe("20");
    expect(storedQuote.customerRate.toString()).toBe("1050");
    expect(currentCorridor.fixedSpread.toString()).toBe("25");
    await prisma.corridorConfig.update({
      where: { sourceCurrency_targetCurrency: { sourceCurrency: "NGN", targetCurrency: "CAD" } },
      data: { fixedSpread: "20" },
    });
  });

  it("enforces key uniqueness, profile, webhook, foreign-key, and Trade constraints", async () => {
    await expect(
      prisma.corridorConfig.create({
        data: {
          sourceCurrency: "NGN",
          targetCurrency: "CAD",
          provider: "JUICYWAY",
          fixedSpread: "20",
          percentageSpread: "0",
          minSourceAmountMinor: 1n,
          maxSourceAmountMinor: 2n,
          customerDisclaimer: "Synthetic duplicate",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPrismaCode(error, "P2002");
      return true;
    });

    await expect(
      prisma.customer.create({ data: { customerNumber: refs.business, customerType: "BUSINESS" } }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPrismaCode(error, "P2002");
      return true;
    });

    await expect(
      prisma.businessProfile.create({
        data: {
          customerId: businessCustomerId!,
          legalName: "Duplicate Profile Ltd.",
          entityType: "CORPORATION",
          jurisdiction: "CA",
          country: "CA",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPrismaCode(error, "P2002");
      return true;
    });

    await prisma.webhookEvent.create({
      data: { provider: "SMOKE", externalId: refs.webhookExternalId, eventType: "TEST", payloadHash: "abc" },
    });
    await expect(
      prisma.webhookEvent.create({
        data: { provider: "SMOKE", externalId: refs.webhookExternalId, eventType: "TEST", payloadHash: "def" },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPrismaCode(error, "P2002");
      return true;
    });

    await expect(
      prisma.quote.create({
        data: {
          quoteReference: `BAD-FK-${runId}`,
          customerId: "missing-customer",
          provider: "SMOKE_TEST",
          sourceCurrency: "NGN",
          targetCurrency: "CAD",
          sourceAmountMinor: 1n,
          targetAmountMinor: 1n,
          providerRate: "1",
          customerRate: "1",
          fixedSpreadSnapshot: "0",
          percentageSpreadSnapshot: "0",
          explicitFeeMinor: 0n,
          providerFeeEstimateMinor: 0n,
          expectedMarginMinor: 0n,
          providerExpiresAt: new Date(Date.now() + 30_000),
          customerQuoteExpiresAt: new Date(Date.now() + 900_000),
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPrismaCode(error, "P2003");
      return true;
    });

    const tradeCustomerColumn = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Trade' AND column_name = 'customerId'
    `;
    expect(tradeCustomerColumn).toEqual([{ is_nullable: "NO" }]);
  });

  it("does not grant Data API roles direct access to Barrel tables", async () => {
    const expectedTables = new Set(Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name));
    const privileges = await prisma.$queryRaw<
      Array<{ table_name: string; anon_allowed: boolean; authenticated_allowed: boolean }>
    >`
      SELECT
        c.relname AS table_name,
        has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT,INSERT,UPDATE,DELETE') AS anon_allowed,
        has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_allowed
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const barrelPrivileges = privileges.filter((row) => expectedTables.has(row.table_name));
    expect(barrelPrivileges).toHaveLength(expectedTables.size);
    expect(barrelPrivileges.filter((row) => row.anon_allowed || row.authenticated_allowed)).toEqual([]);
  });
});
