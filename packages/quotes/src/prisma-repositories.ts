import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CorridorConfigRepository,
  DirectionalCorridorConfig,
  QuoteSnapshotInput,
  QuoteSnapshotRepository,
} from "./quote-service";

export class PrismaCorridorConfigRepository implements CorridorConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDirectional(sourceCurrency: string, targetCurrency: string): Promise<DirectionalCorridorConfig | null> {
    const corridor = await this.prisma.corridorConfig.findUnique({
      where: { sourceCurrency_targetCurrency: { sourceCurrency, targetCurrency } },
    });
    if (!corridor) return null;
    return {
      id: corridor.id,
      sourceCurrency: corridor.sourceCurrency,
      targetCurrency: corridor.targetCurrency,
      provider: corridor.provider,
      enabled: corridor.enabled,
      spreadMode: corridor.spreadMode,
      fixedSpread: corridor.fixedSpread.toString(),
      percentageSpread: corridor.percentageSpread.toString(),
      minSourceAmountMinor: corridor.minSourceAmountMinor,
      maxSourceAmountMinor: corridor.maxSourceAmountMinor,
      explicitSourceFeeMinor: corridor.explicitSourceFeeMinor,
      providerFeeEstimateMinor: corridor.providerFeeEstimateMinor,
      payoutFeeEstimateMinor: corridor.payoutFeeEstimateMinor,
      quoteTtlSeconds: corridor.quoteTtlSeconds,
      targetPrecision: corridor.targetPrecision,
      customerDisclaimer: corridor.customerDisclaimer,
    };
  }
}

export class PrismaQuoteSnapshotRepository implements QuoteSnapshotRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly createReference: () => string = () => `BARREL-Q-${randomUUID()}`,
  ) {}

  async create(input: QuoteSnapshotInput): Promise<{ id: string; quoteReference: string }> {
    const rawProviderResponse = JSON.parse(JSON.stringify(input.providerQuote.rawResponse)) as Prisma.InputJsonValue;
    return this.prisma.quote.create({
      data: {
        quoteReference: this.createReference(),
        provider: input.providerQuote.provider,
        providerQuoteId: input.providerQuote.providerQuoteId,
        sourceCurrency: input.sourceCurrency,
        targetCurrency: input.targetCurrency,
        sourceAmountMinor: input.sourceAmountMinor,
        targetAmountMinor: input.targetAmountMinor,
        providerRate: input.providerRate,
        customerRate: input.customerRate,
        fixedSpreadSnapshot: input.fixedSpreadSnapshot,
        percentageSpreadSnapshot: input.percentageSpreadSnapshot,
        explicitFeeMinor: input.explicitFeeMinor,
        providerFeeEstimateMinor: input.providerFeeEstimateMinor,
        payoutFeeEstimateMinor: input.payoutFeeEstimateMinor,
        expectedMarginMinor: input.expectedMarginMinor,
        providerLocked: input.providerQuote.locked,
        providerExpiresAt: input.providerExpiresAt,
        customerQuoteExpiresAt: input.customerQuoteExpiresAt,
        rawProviderResponse,
        conversationId: input.conversationId,
      },
      select: { id: true, quoteReference: true },
    });
  }
}
