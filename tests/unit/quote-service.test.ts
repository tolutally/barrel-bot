import { describe, expect, it, vi } from "vitest";
import { toCustomerQuoteDisplay } from "@barrel/domain";
import { ProviderRegistry, type RateProvider } from "@barrel/providers";
import {
  QuoteService,
  QuoteServiceError,
  type CorridorConfigRepository,
  type DirectionalCorridorConfig,
  type QuoteSnapshotInput,
  type QuoteSnapshotRepository,
} from "@barrel/quotes";

const corridor: DirectionalCorridorConfig = {
  id: "ngn-cad",
  sourceCurrency: "NGN",
  targetCurrency: "CAD",
  provider: "JUICYWAY",
  enabled: true,
  spreadMode: "FIXED",
  fixedSpread: "20",
  percentageSpread: "0",
  minSourceAmountMinor: 1_000_000n,
  maxSourceAmountMinor: 1_000_000_000n,
  explicitSourceFeeMinor: 0n,
  providerFeeEstimateMinor: 0n,
  payoutFeeEstimateMinor: 0n,
  quoteTtlSeconds: 30,
  targetPrecision: 2,
  customerDisclaimer: "Indicative quote only. Final rate is confirmed before payment.",
};

function createHarness(configs: DirectionalCorridorConfig[]) {
  const getIndicativeQuote = vi.fn<RateProvider["getIndicativeQuote"]>().mockImplementation(async (request) => ({
    provider: "JUICYWAY",
    providerQuoteId: "provider-quote-1",
    sourceCurrency: request.sourceCurrency,
    targetCurrency: request.targetCurrency,
    normalizedSourcePerTargetRate: "1030",
    rawRate: "1030",
    rawSymbol: `${request.targetCurrency}-${request.sourceCurrency}`,
    rawType: "sell",
    locked: false,
    expiresAt: new Date("2026-08-10T00:00:20.000Z"),
    rawResponse: {},
  }));
  const provider: RateProvider = { getIndicativeQuote, listSupportedCorridors: async () => [], healthCheck: async () => ({ ok: true }) };
  const corridors: CorridorConfigRepository = {
    findDirectional: async (source, target) =>
      configs.find((item) => item.sourceCurrency === source && item.targetCurrency === target) ?? null,
  };
  const snapshots: QuoteSnapshotInput[] = [];
  const quotes: QuoteSnapshotRepository = {
    create: async (input) => {
      snapshots.push(input);
      return { id: "quote-1", quoteReference: "BARREL-Q-1" };
    },
  };
  const service = new QuoteService(
    corridors,
    new ProviderRegistry({ JUICYWAY: provider }),
    quotes,
    () => new Date("2026-08-10T00:00:00.000Z"),
  );
  return { service, getIndicativeQuote, snapshots };
}

describe("QuoteService directional routing", () => {
  it("prices configured NGN to CAD without hardcoded service currencies", async () => {
    const { service, getIndicativeQuote, snapshots } = createHarness([corridor]);
    const quote = await service.createIndicativeQuote({
      sourceCurrency: "ngn",
      targetCurrency: "cad",
      sourceAmountMinor: 200_000_000n,
    });

    expect(getIndicativeQuote).toHaveBeenCalledWith({
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
    });
    expect(quote.customerRate).toBe("1050");
    expect(quote.targetAmount).toBe("C$1,904.76");
    expect(snapshots[0]).toMatchObject({
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      fixedSpreadSnapshot: "20",
      targetAmountMinor: 190_476n,
    });
  });

  it("rejects an unconfigured reverse direction without calling or inverting", async () => {
    const { service, getIndicativeQuote } = createHarness([corridor]);
    await expect(
      service.createIndicativeQuote({
        sourceCurrency: "CAD",
        targetCurrency: "NGN",
        sourceAmountMinor: 100_00n,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CORRIDOR" } satisfies Partial<QuoteServiceError>);
    expect(getIndicativeQuote).not.toHaveBeenCalled();
  });

  it("presents the direction explicitly as You send and You receive", async () => {
    const { service } = createHarness([corridor]);
    const quote = await service.createIndicativeQuote({
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
    });
    expect(toCustomerQuoteDisplay(quote)).toEqual({
      sendLabel: "You send",
      sendAmount: "₦2,000,000.00 NGN",
      receiveLabel: "You receive",
      receiveAmount: "C$1,904.76 CAD",
      rateLabel: "Indicative rate",
      customerRate: "1050 NGN per CAD",
    });
  });
});
