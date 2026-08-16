import "server-only";
import { prisma } from "@barrel/db";
import { JuicywayProvider, ProviderRegistry } from "@barrel/providers";
import { PrismaCorridorConfigRepository, PrismaQuoteSnapshotRepository, QuoteService } from "@barrel/quotes";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required server environment: ${name}`);
  return value;
}

export function createQuoteService(): QuoteService {
  const juicyway = new JuicywayProvider({
    baseUrl: requiredEnvironment("JUICYWAY_BASE_URL"),
    apiKey: requiredEnvironment("JUICYWAY_API_KEY"),
    quotePath: process.env.JUICYWAY_QUOTE_PATH ?? "/exchange/quote",
  });

  return new QuoteService(
    new PrismaCorridorConfigRepository(prisma),
    new ProviderRegistry({ JUICYWAY: juicyway }),
    new PrismaQuoteSnapshotRepository(prisma),
  );
}
