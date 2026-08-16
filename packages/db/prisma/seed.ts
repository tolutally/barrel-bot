import { PrismaClient, SpreadMode } from "@prisma/client";

const prisma = new PrismaClient();

const supportedDirections = [
  ["NGN", "CAD"], ["NGN", "USD"], ["NGN", "USDT"],
  ["CAD", "NGN"], ["CAD", "USD"], ["CAD", "USDT"],
  ["USD", "NGN"], ["USD", "CAD"],
  ["USDT", "NGN"], ["USDT", "CAD"],
] as const;

function limits(sourceCurrency: string) {
  return sourceCurrency === "NGN"
    ? { minSourceAmountMinor: 100_000_00n, maxSourceAmountMinor: 10_000_000_00n }
    : { minSourceAmountMinor: 100_00n, maxSourceAmountMinor: 100_000_00n };
}

async function main() {
  for (const [sourceCurrency, targetCurrency] of supportedDirections) {
    await prisma.corridorConfig.upsert({
      where: { sourceCurrency_targetCurrency: { sourceCurrency, targetCurrency } },
      update: {
        enabled: true,
        spreadMode: SpreadMode.PERCENTAGE,
        fixedSpread: "0",
        percentageSpread: "0.015",
        ...limits(sourceCurrency),
      },
      create: {
        sourceCurrency,
        targetCurrency,
        provider: "JUICYWAY",
        enabled: true,
        spreadMode: SpreadMode.PERCENTAGE,
        fixedSpread: "0",
        percentageSpread: "0.015",
        ...limits(sourceCurrency),
        explicitSourceFeeMinor: 0n,
        providerFeeEstimateMinor: 0n,
        payoutFeeEstimateMinor: 0n,
        quoteTtlSeconds: 30,
        targetPrecision: 2,
        customerDisclaimer: "Indicative quote only. Final rate is confirmed before payment.",
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
